import { useCallback, useEffect, useState } from 'react'

import { describeError, fetchHealth, fetchScores, postScore } from './api'
import { HEALTH_POLL_INTERVAL_MS } from './constants'
import { Leaderboard } from './Leaderboard'
import { Snake } from './Snake'
import { StatusPanel } from './StatusPanel'
import type { HealthResponse, LeaderboardEntry, ScoreRecord, SubmitOutcome } from './types'

const INITIAL_HEALTH: HealthResponse = {
  db: 'unavailable',
  detail: 'Asking the server.',
  pod: '',
  image: 'unknown',
  user: 'unknown',
  uid: -1,
  store: 'memory',
}

export function App() {
  const [health, setHealth] = useState<HealthResponse>(INITIAL_HEALTH)
  const [scores, setScores] = useState<ScoreRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // Health and scores are polled together on purpose. With several replicas and
  // no database, consecutive polls are answered by different pods, so the pod
  // name and the leaderboard change at the same time and the participant can
  // see that the two are connected. That correlation is the lesson.
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const [nextHealth, nextScores] = await Promise.all([fetchHealth(), fetchScores()])
        if (!cancelled) {
          setHealth(nextHealth)
          setScores(nextScores)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(`Cannot reach the server: ${describeError(caught)}`)
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, HEALTH_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [version])

  const submitScore = useCallback(
    async (playerName: string, score: number): Promise<SubmitOutcome> => {
      const result = await postScore(playerName, score)
      setVersion((previous) => previous + 1)
      return result.store === 'database'
        ? { saved: 'database', message: 'Saved to the database.' }
        : {
            saved: 'memory',
            message: 'Saved in this pod’s memory. It will not survive a restart.',
          }
    },
    [],
  )

  const entries: LeaderboardEntry[] = scores.map((record) => ({
    key: `${health.store}-${String(record.id)}`,
    playerName: record.player_name,
    score: record.score,
  }))

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">DEDIH Snake</h1>
        <p className="app-subtitle">Containerization and Security, ELTE IK DEDIH 2.0</p>
      </header>

      <main className="app-main">
        <Snake onSubmitScore={submitScore} />
        <aside className="app-side">
          <StatusPanel health={health} />
          <Leaderboard entries={entries} error={error} source={health.store} />
        </aside>
      </main>

      <footer className="app-footer">
        <p>
          The same image runs on a laptop, in Docker and in Kubernetes. Watch the status panel to
          see what changes and what does not.
        </p>
      </footer>
    </div>
  )
}
