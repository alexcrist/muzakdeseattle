// ─────────────────────────────────────────────
// Player identity stored in localStorage
// (acts like a persistent cookie)
// ─────────────────────────────────────────────

const PLAYER_KEY = 'ml_player'

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
