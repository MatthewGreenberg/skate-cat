const LEADERBOARD_KEY = 'skateCat_leaderboard'
const MAX_ENTRIES = 10

export function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY)
    if (!raw) return []
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return []
    return entries
      .filter(e => e && typeof e.initials === 'string' && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function isHighScore(score) {
  const board = loadLeaderboard()
  if (board.length < MAX_ENTRIES) return true
  return score > board[board.length - 1].score
}

export function insertScore(initials, score, rank) {
  const board = loadLeaderboard()
  board.push({ initials, score, rank })
  board.sort((a, b) => b.score - a.score)
  const trimmed = board.slice(0, MAX_ENTRIES)
  saveLeaderboard(trimmed)
  return trimmed
}

export function getHighScore() {
  const board = loadLeaderboard()
  return board.length > 0 ? board[0].score : 0
}
