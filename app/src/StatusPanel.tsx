import type { HealthResponse } from './types'

/**
 * The visible artifact of the whole course.
 *
 * Every row is something the participants change with their own hands during
 * the day: the image they shrank, the user they stopped being, the pod that
 * answered this particular request, the leaderboard that does or does not
 * survive a restart.
 *
 * Every row signals its state three ways at once: wording, icon shape and
 * colour. Colour alone would be invisible to a colour blind participant and
 * unreadable on a projector, so it is never the only signal.
 */

type RowState = 'ok' | 'degraded' | 'info'

interface StatusRow {
  label: string
  value: string
  state: RowState
}

function StateIcon({ state }: { state: RowState }) {
  if (state === 'ok') {
    return (
      <svg className="status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M5 8.3 7.1 10.4 11 6.2" />
      </svg>
    )
  }
  if (state === 'degraded') {
    return (
      <svg className="status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.8 15 14.2H1z" />
        <path d="M8 6.2v3.4" />
        <path d="M8 11.9v0.1" />
      </svg>
    )
  }
  return (
    <svg className="status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5.2v0.1" />
      <path d="M8 7.6v3.4" />
    </svg>
  )
}

export function StatusPanel({ health }: { health: HealthResponse }) {
  const inKubernetes = health.pod.length > 0
  const isRoot = health.uid === 0
  const shared = health.store === 'database'

  const rows: StatusRow[] = [
    {
      label: 'Pod',
      value: inKubernetes ? health.pod : 'none, plain Docker',
      state: 'info',
    },
    {
      label: 'Image',
      value: health.image,
      state: 'info',
    },
    {
      label: 'Running as',
      value: `${health.user} (uid ${String(health.uid)})`,
      state: isRoot ? 'degraded' : 'ok',
    },
    {
      label: 'Leaderboard',
      value: shared ? 'shared database' : 'this pod only',
      state: shared ? 'ok' : 'degraded',
    },
  ]

  return (
    <section className="panel" aria-labelledby="status-heading">
      <h2 className="panel-heading" id="status-heading">
        Status
      </h2>
      <div aria-live="polite">
        <ul className="status-list">
          {rows.map((row) => (
            <li className={`status-row is-${row.state}`} key={row.label}>
              <span className="status-label">{row.label}</span>
              <span className="status-value">
                <StateIcon state={row.state} />
                {row.value}
              </span>
            </li>
          ))}
        </ul>
        <p className="status-detail">{health.detail}</p>
      </div>
    </section>
  )
}
