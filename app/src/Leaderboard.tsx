import type { LeaderboardEntry, StoreKind } from './types'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  source: StoreKind
  error: string | null
}

export function Leaderboard({ entries, source, error }: LeaderboardProps) {
  const shared = source === 'database'

  return (
    <section className="panel" aria-labelledby="leaderboard-heading">
      <h2 className="panel-heading" id="leaderboard-heading">
        Leaderboard
      </h2>
      <p className="panel-note">
        {shared
          ? 'Top 10 from the database. Every pod sees the same list.'
          : 'Held in one pod’s memory. Other replicas have their own.'}
      </p>

      {error !== null && <p className="panel-error">{error}</p>}

      {entries.length === 0 ? (
        <p className="panel-empty">No scores yet. Play a round.</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((entry, index) => (
            <li className="leaderboard-row" key={entry.key}>
              <span className="leaderboard-rank">{index + 1}</span>
              <span className="leaderboard-name">{entry.playerName}</span>
              <span className="leaderboard-score">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
