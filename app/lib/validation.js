/**
 * Request validation.
 *
 * Under the shared responsibility model Azure secures the platform: the SQL
 * service, the host, the network. What arrives in a request body is the
 * application's own responsibility, and no amount of correct infrastructure
 * makes an unvalidated payload safe. The lecturer refers back to this file when
 * that slide comes up.
 *
 * Validation is deliberately allow-list based. Everything not explicitly
 * permitted is rejected, rather than trying to enumerate what is dangerous.
 */

import {
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  PLAYER_NAME_PATTERN,
  SCORE_MAX,
  SCORE_MIN,
} from './config.js'

/**
 * @typedef {{ valid: true, value: { playerName: string, score: number } }} ValidSubmission
 * @typedef {{ valid: false, error: string }} InvalidSubmission
 */

function invalid(error) {
  return { valid: false, error }
}

/**
 * @param {unknown} payload the parsed JSON request body
 * @returns {ValidSubmission | InvalidSubmission}
 */
export function validateScoreSubmission(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return invalid('The request body must be a JSON object.')
  }

  const { player_name: rawName, score: rawScore } = /** @type {Record<string, unknown>} */ (payload)

  if (typeof rawName !== 'string') {
    return invalid('player_name is required and must be a string.')
  }

  const playerName = rawName.trim()

  if (playerName.length < PLAYER_NAME_MIN_LENGTH || playerName.length > PLAYER_NAME_MAX_LENGTH) {
    return invalid(
      `player_name must be between ${PLAYER_NAME_MIN_LENGTH} and ${PLAYER_NAME_MAX_LENGTH} characters.`,
    )
  }

  if (!PLAYER_NAME_PATTERN.test(playerName)) {
    return invalid(
      'player_name may only contain letters, digits, spaces, dots, hyphens and underscores.',
    )
  }

  if (typeof rawScore !== 'number' || !Number.isInteger(rawScore)) {
    return invalid('score is required and must be an integer.')
  }

  if (rawScore < SCORE_MIN || rawScore > SCORE_MAX) {
    return invalid(`score must be between ${SCORE_MIN} and ${SCORE_MAX}.`)
  }

  return { valid: true, value: { playerName, score: rawScore } }
}
