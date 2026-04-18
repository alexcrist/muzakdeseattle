// ─────────────────────────────────────────────
// Player identity stored in localStorage
// (acts like a persistent cookie)
// ─────────────────────────────────────────────

const PLAYER_KEY = 'ml_player'
const SEEN_RESULTS_KEY = 'ml_seen_results'

export function getStoredPlayer() {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storePlayer(player) {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player))
}

export function clearPlayer() {
  localStorage.removeItem(PLAYER_KEY)
}

// Track which round's results the player has already seen
export function getSeenResultsRoundId() {
  return localStorage.getItem(SEEN_RESULTS_KEY) || null
}

export function markResultsSeen(roundId) {
  localStorage.setItem(SEEN_RESULTS_KEY, roundId)
}
