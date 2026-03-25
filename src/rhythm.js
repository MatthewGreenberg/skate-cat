import { gameState } from "./store";

export const SONG_BPM = 170;
export const BEAT_INTERVAL = 60 / SONG_BPM;
// BPM gives spacing, but this track still needs a fixed phase anchor relative
// to file time 0 so the beat grid lands on the intended musical pulse.
export const TRACK_BEAT_PHASE_OFFSET_SECONDS = -0.068;
export const AUDIO_VISUAL_SYNC_OFFSET_SECONDS = TRACK_BEAT_PHASE_OFFSET_SECONDS;
export const INPUT_TIMING_COMPENSATION_SECONDS = 0.08;
export const DEFAULT_OBSTACLE_HIT_DELAY_SECONDS = 0;
export const PERFECT_EARLY_WINDOW_SECONDS = 0.14;
export const PERFECT_LATE_WINDOW_SECONDS = 0.0;
export const GOOD_EARLY_WINDOW_SECONDS = 0.21;
export const GOOD_LATE_WINDOW_SECONDS = 0.06;
export const MAX_TARGET_LOCK_WINDOW_SECONDS = BEAT_INTERVAL * 0.8;

export function getObstacleHitTime(
  beatIndex,
  obstacleHitDelaySeconds = gameState.obstacleHitDelaySeconds.current ??
    DEFAULT_OBSTACLE_HIT_DELAY_SECONDS,
) {
  return beatIndex * BEAT_INTERVAL + obstacleHitDelaySeconds;
}

export function getPerceivedMusicTime(
  currentTimeSeconds,
  syncOffsetSeconds = gameState.timingOffsetSeconds.current ??
    AUDIO_VISUAL_SYNC_OFFSET_SECONDS,
) {
  if (!Number.isFinite(currentTimeSeconds)) return 0;
  return Math.max(0, currentTimeSeconds - syncOffsetSeconds);
}

export function getNearestScheduledTarget(
  currentTimeSeconds,
  targets,
  maxOffsetSeconds = MAX_TARGET_LOCK_WINDOW_SECONDS,
) {
  if (!Array.isArray(targets) || targets.length === 0) return null;

  let nearestTarget = null;
  let nearestAbsOffset = Infinity;

  for (const target of targets) {
    const offset = currentTimeSeconds - target.targetTime;
    const absOffset = Math.abs(offset);
    if (absOffset < nearestAbsOffset) {
      nearestAbsOffset = absOffset;
      nearestTarget = { ...target, offset };
    }
  }

  if (!nearestTarget || nearestAbsOffset > maxOffsetSeconds) return null;
  return nearestTarget;
}

export function getTimingGradeFromOffset(signedOffsetSeconds) {
  if (
    signedOffsetSeconds >= -PERFECT_EARLY_WINDOW_SECONDS &&
    signedOffsetSeconds <= PERFECT_LATE_WINDOW_SECONDS
  ) {
    return "Perfect";
  }
  if (
    signedOffsetSeconds >= -GOOD_EARLY_WINDOW_SECONDS &&
    signedOffsetSeconds <= GOOD_LATE_WINDOW_SECONDS
  ) {
    return "Good";
  }
  return "Sloppy";
}
