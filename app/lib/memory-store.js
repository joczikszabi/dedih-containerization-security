/**
 * The leaderboard used when there is no database.
 *
 * This exists to be wrong in a specific, visible way. It lives in the memory of
 * one process, so two replicas of the same image hold two different
 * leaderboards. Submit a score, refresh a few times, and it appears and
 * disappears depending on which pod answered.
 *
 * That confusion is the single most important thing in the course. Containers
 * are disposable, anything you keep inside one dies with it, and the fix is to
 * put state somewhere that outlives any individual container. Do not "improve"
 * this into a shared cache: the divergence is the lesson.
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
