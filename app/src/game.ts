/**
 * Snake rules, with no React and no canvas in sight.
 *
 * Every function here is pure: given a state it returns the next state. The
 * component owns when to call them, the renderer owns how to draw the result.
 */

import { BOARD_COLUMNS, BOARD_ROWS, INITIAL_SNAKE_LENGTH, POINTS_PER_FOOD } from './constants'

export interface Point {
  x: number
  y: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface GameState {
  /** Head first. */
  snake: Point[]
  /** The direction of the move just completed. */
  direction: Direction
  /** The queued input for the next move. */
  nextDirection: Direction
  food: Point
  score: number
  alive: boolean
}

const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITES: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function isOutsideBoard(point: Point): boolean {
  return point.x < 0 || point.y < 0 || point.x >= BOARD_COLUMNS || point.y >= BOARD_ROWS
}

/** Picks a free cell. Falls back to the head if the board is somehow full. */
function placeFood(snake: Point[], random: () => number): Point {
  const occupied = new Set(snake.map((segment) => `${String(segment.x)}:${String(segment.y)}`))
  const free: Point[] = []
  for (let x = 0; x < BOARD_COLUMNS; x += 1) {
    for (let y = 0; y < BOARD_ROWS; y += 1) {
      if (!occupied.has(`${String(x)}:${String(y)}`)) {
        free.push({ x, y })
      }
    }
  }
  const head = snake[0] ?? { x: 0, y: 0 }
  if (free.length === 0) {
    return head
  }
  return free[Math.floor(random() * free.length)] ?? head
}

export function createGame(random: () => number = Math.random): GameState {
  const startX = Math.floor(BOARD_COLUMNS / 2)
  const startY = Math.floor(BOARD_ROWS / 2)
  const snake: Point[] = []
  for (let offset = 0; offset < INITIAL_SNAKE_LENGTH; offset += 1) {
    snake.push({ x: startX - offset, y: startY })
  }
  return {
    snake,
    direction: 'right',
    nextDirection: 'right',
    food: placeFood(snake, random),
    score: 0,
    alive: true,
  }
}

/**
 * Queues a turn.
 *
 * The check is against `direction`, the move already made, not against
 * `nextDirection`. Otherwise two fast key presses inside a single tick (right,
 * then up, then left) would queue a reversal and kill the player on their own
 * neck.
 */
export function turn(state: GameState, direction: Direction): GameState {
  if (!state.alive || OPPOSITES[state.direction] === direction) {
    return state
  }
  return { ...state, nextDirection: direction }
}

/** Advances the game by exactly one logical tick. */
export function advance(state: GameState, random: () => number = Math.random): GameState {
  if (!state.alive) {
    return state
  }

  const direction = state.nextDirection
  const vector = VECTORS[direction]
  const head = state.snake[0]
  if (head === undefined) {
    return { ...state, alive: false }
  }

  const nextHead: Point = { x: head.x + vector.x, y: head.y + vector.y }
  const eating = samePoint(nextHead, state.food)

  // The tail cell frees up in this same tick unless the snake is growing, so
  // moving into it is legal. Collision is checked against the body that remains.
  const body = eating ? state.snake : state.snake.slice(0, -1)

  if (isOutsideBoard(nextHead) || body.some((segment) => samePoint(segment, nextHead))) {
    return { ...state, direction, alive: false }
  }

  const snake = [nextHead, ...body]

  return {
    snake,
    direction,
    nextDirection: direction,
    food: eating ? placeFood(snake, random) : state.food,
    score: eating ? state.score + POINTS_PER_FOOD : state.score,
    alive: true,
  }
}
