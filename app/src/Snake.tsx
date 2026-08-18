import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { describeError } from './api'
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  CELL_SIZE,
  MAX_FRAME_DELTA_MS,
  PLAYER_NAME_MAX_LENGTH,
  TICK_INTERVAL_MS,
} from './constants'
import { advance, createGame, turn } from './game'
import type { Direction, GameState } from './game'
import type { SubmitOutcome } from './types'

type GameStatus = 'idle' | 'playing' | 'paused' | 'over'

const DIRECTION_KEYS: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const BOARD_WIDTH = BOARD_COLUMNS * CELL_SIZE
const BOARD_HEIGHT = BOARD_ROWS * CELL_SIZE
const SNAKE_INSET = 2
const HEAD_INSET = 1
const FOOD_INSET = 5
const CELL_RADIUS = 6

interface Palette {
  background: string
  grid: string
  snake: string
  head: string
  food: string
}

/**
 * The palette lives in styles.css and nowhere else. Reading it back through
 * custom properties keeps the canvas and the DOM the same colours without
 * writing the hex values down twice.
 */
function readPalette(element: HTMLElement): Palette {
  const styles = getComputedStyle(element)
  const read = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }
  return {
    background: read('--board-surface', '#0d0f16'),
    grid: read('--board-grid', '#171b26'),
    snake: read('--accent', '#38bdf8'),
    head: read('--accent-bright', '#7dd3fc'),
    food: read('--food', '#fb7185'),
  }
}

/**
 * Sizes the backing store to the device pixel ratio so the board is crisp on a
 * high density screen. CSS still controls the displayed size, which is how the
 * canvas stays responsive on a narrow window.
 */
function configureCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  canvas.width = Math.round(BOARD_WIDTH * ratio)
  canvas.height = Math.round(BOARD_HEIGHT * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function fillCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  inset: number,
  radius: number,
): void {
  context.beginPath()
  context.roundRect(
    x * CELL_SIZE + inset,
    y * CELL_SIZE + inset,
    CELL_SIZE - inset * 2,
    CELL_SIZE - inset * 2,
    radius,
  )
  context.fill()
}

function drawBoard(
  context: CanvasRenderingContext2D,
  state: GameState,
  palette: Palette,
  dimmed: boolean,
): void {
  context.globalAlpha = 1
  context.fillStyle = palette.background
  context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)

  context.strokeStyle = palette.grid
  context.lineWidth = 1
  context.beginPath()
  for (let column = 1; column < BOARD_COLUMNS; column += 1) {
    context.moveTo(column * CELL_SIZE + 0.5, 0)
    context.lineTo(column * CELL_SIZE + 0.5, BOARD_HEIGHT)
  }
  for (let row = 1; row < BOARD_ROWS; row += 1) {
    context.moveTo(0, row * CELL_SIZE + 0.5)
    context.lineTo(BOARD_WIDTH, row * CELL_SIZE + 0.5)
  }
  context.stroke()

  // Dimming the board is what makes an overlay readable without hiding the
  // state underneath it.
  context.globalAlpha = dimmed ? 0.35 : 1

  context.fillStyle = palette.food
  fillCell(context, state.food.x, state.food.y, FOOD_INSET, CELL_RADIUS)

  state.snake.forEach((segment, index) => {
    const isHead = index === 0
    context.fillStyle = isHead ? palette.head : palette.snake
    fillCell(context, segment.x, segment.y, isHead ? HEAD_INSET : SNAKE_INSET, CELL_RADIUS)
  })

  context.globalAlpha = 1
}

interface SnakeProps {
  /** Resolves with where the score ended up. Rejects only on a rejected name. */
  onSubmitScore: (playerName: string, score: number) => Promise<SubmitOutcome>
}

export function Snake({ onSubmitScore }: SnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const gameRef = useRef<GameState>(createGame())
  const statusRef = useRef<GameStatus>('idle')

  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [personalBest, setPersonalBest] = useState(0)
  const [playerName, setPlayerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // The game loop reads the status every frame and React state is not readable
  // from inside a closure that was created once, so the ref is the loop's copy
  // and the state is the renderer's copy. They are only ever set together.
  const changeStatus = useCallback((next: GameStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const startGame = useCallback(() => {
    gameRef.current = createGame()
    setScore(0)
    setOutcome(null)
    setSubmitError(null)
    changeStatus('playing')
  }, [changeStatus])

  const endGame = useCallback(
    (finalScore: number) => {
      setPersonalBest((previous) => Math.max(previous, finalScore))
      changeStatus('over')
    },
    [changeStatus],
  )

  const toggleGame = useCallback(() => {
    if (statusRef.current === 'playing') {
      changeStatus('paused')
      return
    }
    if (statusRef.current === 'paused') {
      changeStatus('playing')
      return
    }
    startGame()
  }, [changeStatus, startGame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }

    const palette = readPalette(canvas)
    configureCanvas(canvas, context)

    let frameHandle = 0
    let previousTimestamp = performance.now()
    let accumulated = 0

    const frame = (timestamp: number) => {
      const delta = Math.min(timestamp - previousTimestamp, MAX_FRAME_DELTA_MS)
      previousTimestamp = timestamp

      if (statusRef.current === 'playing') {
        // A fixed logical tick drained from an accumulator: the snake moves at
        // the same speed on a 60Hz laptop and a 144Hz monitor.
        accumulated += delta
        while (accumulated >= TICK_INTERVAL_MS) {
          accumulated -= TICK_INTERVAL_MS
          gameRef.current = advance(gameRef.current)
          if (!gameRef.current.alive) {
            endGame(gameRef.current.score)
            break
          }
        }
        // React bails out when the value is unchanged, so this is a no-op on
        // most frames.
        setScore(gameRef.current.score)
      } else {
        accumulated = 0
      }

      drawBoard(context, gameRef.current, palette, statusRef.current !== 'playing')
      frameHandle = requestAnimationFrame(frame)
    }

    frameHandle = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(frameHandle)
    }
  }, [endGame])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Never steal keys from the name entry field.
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const direction = DIRECTION_KEYS[event.key]
      if (direction !== undefined) {
        event.preventDefault()
        if (statusRef.current === 'idle') {
          startGame()
        }
        if (statusRef.current === 'playing') {
          gameRef.current = turn(gameRef.current, direction)
        }
        return
      }

      if (event.key === ' ' || event.key === 'Enter') {
        // A focused button already handles both keys. Acting here as well would
        // start and immediately pause the game.
        if (event.target instanceof HTMLButtonElement) {
          return
        }
        event.preventDefault()
        toggleGame()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [startGame, toggleGame])

  useEffect(() => {
    const pause = () => {
      if (statusRef.current === 'playing') {
        changeStatus('paused')
      }
    }
    const handleVisibility = () => {
      if (document.hidden) {
        pause()
      }
    }

    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [changeStatus])

  useEffect(() => {
    if (status === 'over') {
      nameInputRef.current?.focus()
    }
  }, [status])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = playerName.trim()
    if (trimmed.length === 0) {
      setSubmitError('Enter a name first.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    onSubmitScore(trimmed, score)
      .then((result) => {
        setOutcome(result)
      })
      .catch((error: unknown) => {
        setSubmitError(describeError(error))
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <section className="game" aria-labelledby="game-heading">
      <h2 className="visually-hidden" id="game-heading">
        Snake
      </h2>

      <div className="scoreboard">
        <p className="score">
          <span className="score-label">Score</span>
          <span className="score-value">{score}</span>
        </p>
        <p className="score">
          <span className="score-label">Best</span>
          <span className="score-value">{personalBest}</span>
        </p>
      </div>

      <div className="game-stage">
        <canvas
          aria-label={`Snake board, ${String(BOARD_COLUMNS)} by ${String(BOARD_ROWS)} cells. Use the arrow keys to steer.`}
          className="game-canvas"
          height={BOARD_HEIGHT}
          ref={canvasRef}
          role="img"
          width={BOARD_WIDTH}
        />

        {status === 'idle' && (
          <div className="overlay">
            <p className="overlay-title">Snake</p>
            <p className="overlay-text">Arrow keys to steer, space to pause.</p>
            <button className="button" onClick={startGame} type="button">
              Start
            </button>
          </div>
        )}

        {status === 'paused' && (
          <div className="overlay">
            <p className="overlay-title">Paused</p>
            <p className="overlay-text">The game pauses when the window loses focus.</p>
            <button className="button" onClick={toggleGame} type="button">
              Resume
            </button>
          </div>
        )}

        {status === 'over' && (
          <div className="overlay">
            <p className="overlay-title">Game over</p>
            <p className="overlay-text">
              You scored <strong>{score}</strong>.
            </p>

            {outcome === null ? (
              <form className="name-form" onSubmit={handleSubmit}>
                <label className="name-label" htmlFor="player-name">
                  Name for the leaderboard
                </label>
                <input
                  autoComplete="off"
                  className="name-input"
                  id="player-name"
                  maxLength={PLAYER_NAME_MAX_LENGTH}
                  onChange={(event) => {
                    setPlayerName(event.target.value)
                  }}
                  ref={nameInputRef}
                  type="text"
                  value={playerName}
                />
                {submitError !== null && (
                  <p className="overlay-error" role="alert">
                    {submitError}
                  </p>
                )}
                <div className="overlay-actions">
                  <button className="button" disabled={submitting} type="submit">
                    {submitting ? 'Saving...' : 'Submit score'}
                  </button>
                  <button className="button button-quiet" onClick={startGame} type="button">
                    Skip
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p
                  className={outcome.saved === 'database' ? 'overlay-ok' : 'overlay-warning'}
                  role="status"
                >
                  {outcome.message}
                </p>
                <button className="button" onClick={startGame} type="button">
                  Play again
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
