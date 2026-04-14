const MAX_ENTRIES = 10
const EMPTY = { daily: [], weekly: [], alltime: [] }

export async function fetchLeaderboards() {
  try {
    const res = await fetch('/api/leaderboard')
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = await res.json()
    return {
      daily: Array.isArray(data.daily) ? data.daily : [],
      weekly: Array.isArray(data.weekly) ? data.weekly : [],
      alltime: Array.isArray(data.alltime) ? data.alltime : [],
    }
  } catch (err) {
    console.error('[leaderboard] fetch failed', err)
    return EMPTY
  }
}

export function isHighScore(score, board) {
  if (!Array.isArray(board) || board.length < MAX_ENTRIES) return true
  return score > board[board.length - 1].score
}

export async function submitScore(initials, score, rank) {
  try {
    const res = await fetch('/api/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initials, score, rank }),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch (err) {
    console.error('[leaderboard] submit failed', err)
  }
  return fetchLeaderboards()
}
