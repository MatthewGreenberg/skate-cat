import { BEAT_INTERVAL } from '../rhythm'
import { SPEED_RESPONSE } from '../store'

export const LANE_POSITIONS = {
  farLeft: -0.34,
  left: -0.22,
  center: 0,
  right: 0.22,
  farRight: 0.34,
}

export const LANE_JITTER = 0.035

export const GRIND_RAIL_LENGTH_MIN = 6.5
export const GRIND_RAIL_LENGTH_MAX = 8.5
export const GRIND_ENTRY_PADDING = 0.35
export const GRIND_EXIT_PADDING = 0.8
export const GRIND_EXIT_RECOVERY_PADDING = 1.15
export const LOG_COLLISION_ENTRY_DISTANCE = 0.85
export const LOG_COLLISION_EXIT_DISTANCE = 0.35

export function getLaneX(lane) {
  const base = LANE_POSITIONS[lane] ?? 0
  const jitterScale = lane === 'center' ? 0.55 : 1
  return base + (Math.random() - 0.5) * LANE_JITTER * jitterScale
}

export function getLanePreferenceOrder(preferredLane) {
  return Object.keys(LANE_POSITIONS).sort((a, b) => {
    const aDistance = Math.abs((LANE_POSITIONS[a] ?? 0) - (LANE_POSITIONS[preferredLane] ?? 0))
    const bDistance = Math.abs((LANE_POSITIONS[b] ?? 0) - (LANE_POSITIONS[preferredLane] ?? 0))
    return aDistance - bDistance
  })
}

export function getGrindHalfLength(obstacle) {
  return (obstacle.railLength || GRIND_RAIL_LENGTH_MIN) * 0.5
}

export function getGrindEntryMinZ(obstacle) {
  return -getGrindHalfLength(obstacle) - GRIND_ENTRY_PADDING
}

export function getGrindExitZ(obstacle) {
  return getGrindHalfLength(obstacle) + GRIND_EXIT_PADDING
}

export function getBeatDistanceForWorldDistance(distance, speed) {
  return distance / Math.max(speed, 0.001) / BEAT_INTERVAL
}

export function getPredictedTravelDistance(durationSeconds, currentSpeed, targetSpeed) {
  const duration = Math.max(durationSeconds, 0)
  const safeCurrentSpeed = Math.max(currentSpeed || 0, 0)
  const safeTargetSpeed = Math.max(targetSpeed || safeCurrentSpeed, 0)

  if (duration <= 0) return 0
  if (Math.abs(safeTargetSpeed - safeCurrentSpeed) < 0.0001) {
    return safeCurrentSpeed * duration
  }

  return (
    safeTargetSpeed * duration -
    ((safeTargetSpeed - safeCurrentSpeed) * (1 - Math.exp(-SPEED_RESPONSE * duration))) / SPEED_RESPONSE
  )
}

export function getObstacleLaneWindow(obstacle, speed) {
  const beatIndex = obstacle.beatIndex || 0

  if (obstacle.isVertical) {
    const railLength = obstacle.railLength || GRIND_RAIL_LENGTH_MAX
    return {
      startBeat: beatIndex - getBeatDistanceForWorldDistance(GRIND_ENTRY_PADDING, speed),
      endBeat: beatIndex + getBeatDistanceForWorldDistance(
        railLength + GRIND_EXIT_PADDING + GRIND_EXIT_RECOVERY_PADDING,
        speed
      ),
    }
  }

  return {
    startBeat: beatIndex - getBeatDistanceForWorldDistance(LOG_COLLISION_ENTRY_DISTANCE, speed),
    endBeat: beatIndex + getBeatDistanceForWorldDistance(LOG_COLLISION_EXIT_DISTANCE, speed),
  }
}

export function laneWindowsOverlap(windowA, windowB) {
  return windowA.startBeat <= windowB.endBeat && windowA.endBeat >= windowB.startBeat
}

export function obstaclesHaveMixedTimeConflict(obstacle, other, speed) {
  if (Boolean(obstacle.isVertical) === Boolean(other.isVertical)) return false

  return laneWindowsOverlap(
    getObstacleLaneWindow(obstacle, speed),
    getObstacleLaneWindow(other, speed)
  )
}

export function buildObstacleDebugEntries(obstacles, speed) {
  return obstacles
    .map((obstacle) => {
      const laneWindow = getObstacleLaneWindow(obstacle, speed)
      const conflicts = obstacles
        .filter((other) =>
          other.id !== obstacle.id &&
          obstaclesHaveMixedTimeConflict(obstacle, other, speed)
        )
        .map((other) => other.id)
        .sort((a, b) => a - b)

      return {
        id: obstacle.id,
        type: obstacle.isVertical ? 'rail' : 'log',
        lane: obstacle.lane,
        requestedLane: obstacle.requestedLane || obstacle.lane,
        remapped: (obstacle.requestedLane || obstacle.lane) !== obstacle.lane,
        beatIndex: obstacle.beatIndex,
        z: obstacle.z,
        railLength: obstacle.railLength || GRIND_RAIL_LENGTH_MIN,
        windowStartBeat: laneWindow.startBeat,
        windowEndBeat: laneWindow.endBeat,
        conflicts,
      }
    })
    .sort((a, b) => a.beatIndex - b.beatIndex || a.id - b.id)
}
