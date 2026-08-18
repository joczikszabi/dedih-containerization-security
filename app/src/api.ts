import type { HealthResponse, ScoreRecord, StoreKind } from './types'

/** An HTTP error the caller is expected to handle and show, not a crash. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ErrorBody {
  error?: string
  detail?: string
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    const { error, detail } = (body ?? {}) as ErrorBody
    return [error, detail].filter(Boolean).join(' ') || `HTTP ${String(response.status)}`
  } catch {
    // A non JSON error body is still an error, it just has nothing to read.
    return `HTTP ${String(response.status)}`
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }
  return (await response.json()) as T
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health')
}

export function fetchScores(): Promise<ScoreRecord[]> {
  return requestJson<ScoreRecord[]>('/api/scores')
}

export function postScore(
  playerName: string,
  score: number,
): Promise<{ saved: boolean; store: StoreKind }> {
  return requestJson<{ saved: boolean; store: StoreKind }>('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName, score }),
  })
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
