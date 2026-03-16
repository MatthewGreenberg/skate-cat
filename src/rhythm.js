export const SONG_BPM = 150
export const BEAT_INTERVAL = 60 / SONG_BPM
export const PERFECT_WINDOW_SECONDS = 0.09
export const GOOD_WINDOW_SECONDS = 0.18

// Obstacles are scheduled every other beat on this phase.
export const OBSTACLE_BEAT_DIVISOR = 2
export const OBSTACLE_PHASE = 1

export function getNearestTargetBeat(currentTimeSeconds) {
  const beatFloat = currentTimeSeconds / BEAT_INTERVAL
  return (
    Math.round((beatFloat - OBSTACLE_PHASE) / OBSTACLE_BEAT_DIVISOR) * OBSTACLE_BEAT_DIVISOR +
    OBSTACLE_PHASE
  )
}

export function getSignedOffsetFromTargetBeat(currentTimeSeconds) {
  const beatFloat = currentTimeSeconds / BEAT_INTERVAL
  const nearestTargetBeat = getNearestTargetBeat(currentTimeSeconds)
  return (beatFloat - nearestTargetBeat) * BEAT_INTERVAL
}

export function getTimingGradeFromOffset(signedOffsetSeconds) {
  const absOffset = Math.abs(signedOffsetSeconds)
  if (absOffset <= PERFECT_WINDOW_SECONDS) return 'Perfect'
  if (absOffset <= GOOD_WINDOW_SECONDS) return 'Good'
  return 'Sloppy'
}
