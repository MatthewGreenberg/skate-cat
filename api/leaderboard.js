import { createClient } from '@supabase/supabase-js'

const MAX_ENTRIES = 10

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method not allowed' })
  }
  const { data, error } = await supabase
    .from('leaderboard')
    .select('initials, score, rank')
    .order('score', { ascending: false })
    .limit(MAX_ENTRIES)
  if (error) {
    console.error('[api/leaderboard] fetch failed', error)
    return res.status(500).json({ error: 'fetch failed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ entries: data ?? [] })
}
