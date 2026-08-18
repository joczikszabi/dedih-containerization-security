/** Shapes shared between the API client and the components. */

export type DatabaseStatus = 'ok' | 'unavailable'

/** Where the leaderboard currently lives. */
export type StoreKind = 'database' | 'memory'

/**
 * The body of GET /api/health.
 *
 * Half of these fields describe the application and half describe the platform
 * it landed on. That is the whole idea: the same image reports different things
 * depending on where it runs.
 */
export interface HealthResponse {
  db: DatabaseStatus
  detail: string
  /** Empty when running under plain Docker rather than Kubernetes. */
  pod: string
  image: string
  user: string
  uid: number
  store: StoreKind
}

/** One row of GET /api/scores, in the wire shape the server sends. */
export interface ScoreRecord {
  id: number
  player_name: string
  score: number
  created_at: string
}

/** What the leaderboard renders. */
export interface LeaderboardEntry {
  key: string
  playerName: string
  score: number
}

/** Where a submitted score ended up, so the game over overlay can say so. */
export interface SubmitOutcome {
  saved: StoreKind
  message: string
}
