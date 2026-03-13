export const SONG_BPM = 150
export const BEAT_INTERVAL = 60 / SONG_BPM

// Obstacles are scheduled every other beat on this phase.
export const OBSTACLE_BEAT_DIVISOR = 2
export const OBSTACLE_PHASE = 1

export function getSignedOffsetFromTargetBeat(currentTimeSeconds) {
  const beatFloat = currentTimeSeconds / BEAT_INTERVAL
  const nearestTargetBeat =
    Math.round((beatFloat - OBSTACLE_PHASE) / OBSTACLE_BEAT_DIVISOR) * OBSTACLE_BEAT_DIVISOR +
    OBSTACLE_PHASE
  return (beatFloat - nearestTargetBeat) * BEAT_INTERVAL
}
