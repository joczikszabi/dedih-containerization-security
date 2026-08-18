/**
 * Database access.
 *
 * The rule this module exists to enforce: the application keeps serving the
 * game when there is no database. Every failure here is a handled state, never
 * an exception that reaches the HTTP layer or the process.
 *
 * `getDatabaseStatus()` is the single source of truth for availability. The
 * health endpoint, the read path and the write path all derive their behaviour
 * from it, so there is exactly one place where "is the database usable" is
 * decided.
 */

import pg from 'pg'

import {
  DATABASE_CONNECT_MAX_ATTEMPTS,
  DATABASE_RECONNECT_INTERVAL_MS,
  DATABASE_RETRY_INITIAL_DELAY_MS,
  DATABASE_RETRY_MAX_DELAY_MS,
  DATABASE_URL,
  LEADERBOARD_SIZE,
} from './config.js'

const { Pool } = pg

const STATUS_OK = 'ok'
const STATUS_UNAVAILABLE = 'unavailable'

/**
 * The scores table is created by the application at startup, not by a
 * migration tool and not by whoever deployed the cluster.
 *
 * That is a deliberate simplification and worth saying out loud: a real project
 * versions its schema and deploys it as its own step, with Flyway, Liquibase,
 * Prisma Migrate or similar, so that schema changes are reviewable and
 * independent of the application rollout. One CREATE TABLE at startup is the
 * smallest thing that works for a single table in a five hour course.
 */
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name VARCHAR(40) NOT NULL,
  score       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`

const SELECT_TOP_SCORES_SQL = `
SELECT id, player_name, score, created_at
FROM scores
ORDER BY score DESC, created_at ASC
LIMIT $1
`

const INSERT_SCORE_SQL = `INSERT INTO scores (player_name, score) VALUES ($1, $2)`

/** Thrown by the write path so the router can answer 503 instead of 500. */
export class DatabaseUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DatabaseUnavailableError'
  }
}

/** @type {import('pg').Pool | null} */
let pool = null
let status = STATUS_UNAVAILABLE
let detail = 'Not started yet.'
let connectAttemptInFlight = false
/** @type {NodeJS.Timeout | null} */
let reconnectTimer = null
let shuttingDown = false

/**
 * How often the cached status is re-checked against the actual database.
 *
 * Without this, `status` only changes when a real query happens to fail, so the
 * application can report a healthy database long after it became unreachable.
 * A NetworkPolicy is the obvious case: existing connections are not torn down,
 * they simply stop delivering packets, and nothing notices until someone tries
 * to use one.
 */
const VERIFY_INTERVAL_MS = 3000
let lastVerifiedAt = 0

/**
 * Cheap liveness check against the real database. Fire and forget: the caller
 * gets the previous answer immediately and the next caller gets the updated
 * one, which keeps /api/health fast while still being honest within a few
 * seconds.
 */
export function verifyDatabase() {
  if (status !== STATUS_OK || pool === null) {
    return
  }
  const now = Date.now()
  if (now - lastVerifiedAt < VERIFY_INTERVAL_MS) {
    return
  }
  lastVerifiedAt = now
  const current = pool
  current.query('SELECT 1').catch((error) => {
    if (pool === current) {
      handleQueryFailure(error)
    }
  })
}

/** The single availability check. Everything else asks this. */
export function getDatabaseStatus() {
  return { db: status, detail }
}

/** @returns {boolean} */
export function isDatabaseAvailable() {
  return getDatabaseStatus().db === STATUS_OK
}

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

async function openPool(connectionString) {
  const candidate = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    // Without these, a query on a connection whose packets are being dropped
    // hangs until the kernel gives up on the TCP session, which can be minutes.
    // A NetworkPolicy does exactly that, and the application has to notice.
    query_timeout: 4000,
    statement_timeout: 4000,
  })

  // A Pool is an EventEmitter, and an EventEmitter that emits `error` with no
  // listener throws. That would take the whole process down the moment the
  // database pod was deleted, which is precisely the failure this application
  // has to survive, so the listener is attached before the first query.
  candidate.on('error', (error) => {
    markUnavailable(`Connection pool error: ${describe(error)}`)
  })

  // Prove the connection rather than trusting the pool to be lazy about it.
  const client = await candidate.connect()
  client.release()
  return candidate
}

async function closeQuietly(candidate) {
  try {
    await candidate.end()
  } catch (error) {
    // Closing a pool that already failed is expected to throw. Log it and move
    // on: there is nothing left to clean up and nothing the caller can do.
    console.warn(`[db] closing a failed pool reported: ${describe(error)}`)
  }
}

async function connectWithRetry(connectionString) {
  let delay = DATABASE_RETRY_INITIAL_DELAY_MS
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= DATABASE_CONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await openPool(connectionString)
    } catch (error) {
      lastError = describe(error)
      if (attempt === DATABASE_CONNECT_MAX_ATTEMPTS) {
        break
      }
      console.warn(
        `[db] connect attempt ${attempt}/${DATABASE_CONNECT_MAX_ATTEMPTS} failed (${lastError}), retrying in ${delay}ms`,
      )
      detail = `Connecting, attempt ${attempt} of ${DATABASE_CONNECT_MAX_ATTEMPTS} failed.`
      await sleep(delay)
      delay = Math.min(delay * 2, DATABASE_RETRY_MAX_DELAY_MS)
    }
  }

  throw new Error(`${DATABASE_CONNECT_MAX_ATTEMPTS} connection attempts failed: ${lastError}`)
}

function markUnavailable(reason) {
  if (status === STATUS_UNAVAILABLE && detail === reason) {
    return
  }
  status = STATUS_UNAVAILABLE
  detail = reason
  console.warn(`[db] unavailable: ${reason}`)
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer !== null) {
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, DATABASE_RECONNECT_INTERVAL_MS)
  // Do not keep the event loop alive just for a retry timer.
  reconnectTimer.unref()
}

async function connect() {
  if (connectAttemptInFlight || shuttingDown || !DATABASE_URL) {
    return
  }
  connectAttemptInFlight = true
  detail = 'Connecting to the database.'

  try {
    const candidate = await connectWithRetry(DATABASE_URL)
    try {
      await candidate.query(CREATE_TABLE_SQL)
    } catch (error) {
      await closeQuietly(candidate)
      throw error
    }
    pool = candidate
    status = STATUS_OK
    detail = 'Connected, scores table ready.'
    console.log('[db] connected, scores table ready')
  } catch (error) {
    pool = null
    markUnavailable(describe(error))
    scheduleReconnect()
  } finally {
    connectAttemptInFlight = false
  }
}

/**
 * Called once at startup. Never throws and never blocks the HTTP server from
 * listening: with no database the application still has a game to serve.
 */
export function startDatabase() {
  if (!DATABASE_URL) {
    status = STATUS_UNAVAILABLE
    detail = 'DATABASE_URL is not set.'
    console.log('[db] no DATABASE_URL, leaderboard lives in this process only')
    return
  }
  void connect()
}

/** Called on SIGTERM so a pod delete does not leave sockets hanging. */
export async function stopDatabase() {
  shuttingDown = true
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const current = pool
  pool = null
  status = STATUS_UNAVAILABLE
  detail = 'Shutting down.'
  if (current !== null) {
    await closeQuietly(current)
  }
}

/**
 * A query failed on a pool we believed was healthy. Report unavailable and
 * start reconnecting rather than pretending the next query will work.
 */
function handleQueryFailure(error) {
  markUnavailable(`Query failed: ${describe(error)}`)
  const current = pool
  pool = null
  if (current !== null) {
    void closeQuietly(current)
  }
  scheduleReconnect()
}

/**
 * Top scores, or an empty list when the database is unavailable. The caller
 * decides what to do with an empty list, see lib/routes.js.
 *
 * @returns {Promise<Array<{ id: number, player_name: string, score: number, created_at: Date }>>}
 */
export async function listTopScores() {
  if (!isDatabaseAvailable() || pool === null) {
    return []
  }
  try {
    const result = await pool.query(SELECT_TOP_SCORES_SQL, [LEADERBOARD_SIZE])
    return result.rows
  } catch (error) {
    handleQueryFailure(error)
    return []
  }
}

/**
 * @param {string} playerName already validated by lib/validation.js
 * @param {number} score already validated by lib/validation.js
 * @throws {DatabaseUnavailableError}
 */
export async function insertScore(playerName, score) {
  if (!isDatabaseAvailable() || pool === null) {
    throw new DatabaseUnavailableError(detail)
  }
  try {
    // Parameterised, never string concatenation. The platform secures the
    // database service; keeping user input out of the query text is the
    // application's own job.
    await pool.query(INSERT_SCORE_SQL, [playerName, score])
  } catch (error) {
    handleQueryFailure(error)
    throw new DatabaseUnavailableError(`Could not write the score: ${describe(error)}`)
  }
}
