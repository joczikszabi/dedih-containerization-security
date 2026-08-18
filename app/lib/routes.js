/**
 * HTTP layer.
 *
 * Handlers validate, pick a store, and shape a response. They never decide for
 * themselves whether the database is usable, they ask `isDatabaseAvailable()`.
 *
 * Note the write path: with no database a score is still accepted, it just goes
 * into this process's memory. That is deliberate. A 503 would teach nothing,
 * whereas a score that survives one refresh and vanishes on the next teaches
 * exactly what a container is.
 */

import { Router } from 'express'

import { describeUser, IMAGE_TAG, POD_NAME } from './config.js'
import {
  DatabaseUnavailableError,
  getDatabaseStatus,
  insertScore,
  isDatabaseAvailable,
  listTopScores,
  verifyDatabase,
} from './database.js'
import * as memoryStore from './memory-store.js'
import { validateScoreSubmission } from './validation.js'

export function createApiRouter() {
  const router = Router()

  // The status panel in the browser polls this. It reports the application's
  // own state and the platform it happens to be running on, which is what
  // makes replicas, rollouts and hardening visible without reading kubectl.
  router.get('/health', (request, response) => {
    // Re-checks the database at most every few seconds, without blocking this
    // request. Otherwise the panel keeps saying "connected" after the database
    // has gone away, which is the one thing it must never do.
    verifyDatabase()
    const { db, detail } = getDatabaseStatus()
    const { user, uid } = describeUser()
    response.json({
      db,
      detail,
      pod: POD_NAME,
      image: IMAGE_TAG,
      user,
      uid,
      store: db === 'ok' ? 'database' : 'memory',
    })
  })

  router.get('/scores', async (request, response) => {
    if (!isDatabaseAvailable()) {
      response.json(memoryStore.listScores())
      return
    }
    response.json(await listTopScores())
  })

  router.post('/scores', async (request, response) => {
    const validation = validateScoreSubmission(request.body)
    if (!validation.valid) {
      response.status(400).json({ error: validation.error })
      return
    }

    const { playerName, score } = validation.value

    if (!isDatabaseAvailable()) {
      memoryStore.addScore(playerName, score)
      response.status(201).json({ saved: true, store: 'memory' })
      return
    }

    try {
      await insertScore(playerName, score)
      response.status(201).json({ saved: true, store: 'database' })
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        // The database went away between the check and the write. Do not lose
        // the score, fall back to memory and say so.
        memoryStore.addScore(playerName, score)
        response.status(201).json({ saved: true, store: 'memory', detail: error.message })
        return
      }
      throw error
    }
  })

  return router
}
