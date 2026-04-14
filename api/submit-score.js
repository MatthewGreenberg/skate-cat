import { createClient } from '@supabase/supabase-js'

const MAX_SCORE = 1_000_000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method not allowed' })
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  const { initials, score, rank } = body ?? {}

  if (typeof initials !== 'string' || initials.length < 1 || initials.length > 3) {
    return res.status(400).json({ error: 'invalid initials' })
  }
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: 'invalid score' })
  }
  if (rank != null && (typeof rank !== 'string' || rank.length > 4)) {
    return res.status(400).json({ error: 'invalid rank' })
  }

  const { error } = await supabase.from('leaderboard').insert({
    initials: initials.toUpperCase(),
    score: Math.floor(score),
    rank: rank ?? null,
  })

  if (error) {
    console.error('[api/submit-score] insert failed', error)
    return res.status(500).json({ error: 'insert failed' })
  }
  return res.status(200).json({ ok: true })
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return null }
}
