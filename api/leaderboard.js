import { createClient } from '@supabase/supabase-js'

const MAX_ENTRIES = 10
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

async function fetchTop(sinceMs) {
  let q = supabase
    .from('leaderboard')
    .select('initials, score, rank')
    .order('score', { ascending: false })
    .limit(MAX_ENTRIES)
  if (sinceMs != null) {
    q = q.gte('created_at', new Date(Date.now() - sinceMs).toISOString())
  }
  const { data, error } = await q
  if (error) {
    console.error('[api/leaderboard] fetch failed', error)
    return []
  }
  return data ?? []
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method not allowed' })
  }
  const [daily, weekly, alltime] = await Promise.all([
    fetchTop(DAY_MS),
    fetchTop(WEEK_MS),
    fetchTop(null),
  ])
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ daily, weekly, alltime })
}
