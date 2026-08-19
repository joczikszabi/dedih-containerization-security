/**
 * Every tunable value the server has, in one place.
 *
 * The four environment variables are the entire contract with whatever runs
 * this image: nothing else about the platform reaches the application.
 */

import os from 'node:os'

/** The platform picks the port. 3000 locally and in the container. */
export const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3000

/**
 * Postgres connection string, for example:
 *   postgres://snake:secret@postgres:5432/snake
 *
 * Undefined until a database exists. The application is required to start and
 * serve the game anyway, with a leaderboard that lives in this process only.
 */
export const DATABASE_URL = process.env.DATABASE_URL

/**
 * Which pod is answering. Kubernetes injects it through the downward API, see
 * k8s/snake.yaml. Empty under plain Docker.
 */
export const POD_NAME = process.env.POD_NAME ?? ''

/** Which image built this container. Set as a build arg, see the Dockerfile. */
export const IMAGE_TAG = process.env.IMAGE_TAG ?? 'unknown'

/** Who the process runs as. uid 0 means root. */
export function describeUser() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1
  let name = 'unknown'
  try {
    name = os.userInfo().username
  } catch {
    // A container with no matching passwd entry cannot resolve the name. The
    // uid is the part that matters, so report that and carry on.
    name = uid === 0 ? 'root' : `uid ${String(uid)}`
  }
  return { user: name, uid }
}

export const LEADERBOARD_SIZE = 10

/** Validation limits for POST /api/scores. */
export const PLAYER_NAME_MIN_LENGTH = 1
export const PLAYER_NAME_MAX_LENGTH = 40 // matches VARCHAR(40) in the scores table
export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N} ._-]+$/u
export const SCORE_MIN = 0
export const SCORE_MAX = 100000

/**
 * Connection retry. A database pod that has just been created takes a few
 * seconds to accept connections, and the application must not fall over while
 * it waits. Delays double from INITIAL up to MAX.
 */
export const DATABASE_CONNECT_MAX_ATTEMPTS = 6
export const DATABASE_RETRY_INITIAL_DELAY_MS = 1000
export const DATABASE_RETRY_MAX_DELAY_MS = 8000

/** How long to wait before trying again after the retry budget is exhausted. */
export const DATABASE_RECONNECT_INTERVAL_MS = 15000
