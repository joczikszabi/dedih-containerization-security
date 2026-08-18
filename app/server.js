/**
 * Entry point. App Service runs `npm start`, which runs this file.
 *
 * Plain JavaScript on purpose: a second TypeScript build step buys nothing for
 * a server this size and adds one more way for the deployment to fail.
 *
 * The server always starts. If there is no database, or the database cannot be
 * reached, the game is still served and the status panel says so. That degraded
 * state is a designed outcome of the course, not an accident.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'

import { PORT } from './lib/config.js'
import { startDatabase, stopDatabase } from './lib/database.js'
import { createApiRouter } from './lib/routes.js'

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))
const staticDirectory = path.join(rootDirectory, 'dist')

const app = express()

app.disable('x-powered-by')

// A score submission is two short fields. Anything larger is not a score.
app.use(express.json({ limit: '8kb' }))

app.use('/api', createApiRouter())

// The Vite build output. In development `npm run dev` serves this instead and
// proxies /api here, so this directory only exists after `npm run build`.
app.use(express.static(staticDirectory, { index: 'index.html' }))

// Express 5 forwards rejected promises from handlers here, so an unexpected
// failure produces a 500 with a logged cause instead of an unhandled rejection.
app.use((error, request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'The request body is not valid JSON.' })
    return
  }
  console.error('[http] unhandled error', error)
  response.status(500).json({ error: 'Internal server error.' })
})

if (!existsSync(staticDirectory)) {
  console.warn(`[http] ${staticDirectory} does not exist, run "npm run build" to create it`)
}

startDatabase()

const server = app.listen(PORT, () => {
  console.log(`[http] listening on http://localhost:${PORT}`)
})

// App Service sends SIGTERM before recycling a worker. Close in order so
// in flight requests finish and the SQL pool is released cleanly.
const shutdown = (signal) => {
  console.log(`[http] ${signal} received, shutting down`)
  server.close(() => {
    stopDatabase()
      .catch((error) => {
        console.error('[db] shutdown failed', error)
      })
      .finally(() => {
        process.exit(0)
      })
  })
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  shutdown('SIGINT')
})
