/**
 * The leaderboard used when there is no database.
 *
 * Per process, so replicas of the same image hold different lists and a score
 * appears or disappears depending on which one answered. That divergence is
 * deliberate teaching material: do not replace this with a shared cache.
 */

import { LEADERBOARD_SIZE } from './config.js'

/** @type {Array<{ id: number, player_name: string, score: number, created_at: string }>} */
let scores = []
let nextId = 1

export function addScore(playerName, score) {
  scores.push({
    id: nextId,
    player_name: playerName,
    score,
    created_at: new Date().toISOString(),
  })
  nextId += 1
  scores.sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at))
  scores = scores.slice(0, LEADERBOARD_SIZE)
}

export function listScores() {
  return scores
}

export function clear() {
  scores = []
  nextId = 1
}
