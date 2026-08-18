/** Every tunable value the browser side has, in one place. */

/** Board geometry. The canvas is BOARD_COLUMNS * CELL_SIZE CSS pixels wide. */
export const BOARD_COLUMNS = 22
export const BOARD_ROWS = 22
export const CELL_SIZE = 22

/** One logical move every TICK_INTERVAL_MS, independent of frame rate. */
export const TICK_INTERVAL_MS = 110

/**
 * A tab that was in the background can report a delta of many seconds. Clamping
 * it stops the game from simulating a hundred moves in one frame.
 */
export const MAX_FRAME_DELTA_MS = 250

export const INITIAL_SNAKE_LENGTH = 4
export const POINTS_PER_FOOD = 10

/** How often the status panel asks the server whether the database is up. */
export const HEALTH_POLL_INTERVAL_MS = 4000

/** Mirrors PLAYER_NAME_MAX_LENGTH in lib/config.js and NVARCHAR(40) in the schema. */
export const PLAYER_NAME_MAX_LENGTH = 40

export const LEADERBOARD_SIZE = 10
