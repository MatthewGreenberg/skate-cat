const MAX_ENTRIES = 10

export async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard')
    if (!res.ok) throw new Error(`status ${res.status}`)
    const { entries } = await res.json()
    return Array.isArray(entries) ? entries : []
  } catch (err) {
    console.error('[leaderboard] fetch failed', err)
    return []
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
  return fetchLeaderboard()
}
