export const SONG_BPM = 150
export const BEAT_INTERVAL = 60 / SONG_BPM
export const PERFECT_WINDOW_SECONDS = 0.09
export const GOOD_WINDOW_SECONDS = 0.18
export const MAX_TARGET_LOCK_WINDOW_SECONDS = BEAT_INTERVAL * 0.8

export function getNearestScheduledTarget(currentTimeSeconds, targets, maxOffsetSeconds = MAX_TARGET_LOCK_WINDOW_SECONDS) {
  if (!Array.isArray(targets) || targets.length === 0) return null

  let nearestTarget = null
  let nearestAbsOffset = Infinity

  for (const target of targets) {
    const offset = currentTimeSeconds - target.targetTime
    const absOffset = Math.abs(offset)
    if (absOffset < nearestAbsOffset) {
      nearestAbsOffset = absOffset
      nearestTarget = { ...target, offset }
    }
  }

  if (!nearestTarget || nearestAbsOffset > maxOffsetSeconds) return null
  return nearestTarget
}

export function getTimingGradeFromOffset(signedOffsetSeconds) {
  const absOffset = Math.abs(signedOffsetSeconds)
  if (absOffset <= PERFECT_WINDOW_SECONDS) return 'Perfect'
  if (absOffset <= GOOD_WINDOW_SECONDS) return 'Good'
  return 'Sloppy'
}
