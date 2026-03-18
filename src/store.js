import { createRef } from 'react'
import * as THREE from 'three'

const DEFAULT_TIMING_OFFSET_SECONDS = -0.160
const debugParams = new URLSearchParams(window.location.search)
export const debugMode = debugParams.get('debug') || ''
export const isDebug = debugParams.has('debug')
export const isTimingDebug = debugMode === 'timing'
export const isObstacleSpacingDebug = debugMode === 'spacing' || debugParams.get('spacingDebug') === '1'

export function createIdleGrindState() {
  return { active: false, obstacleId: 0, x: 0, z: 0 }
}

export function createIdleGrindSparkState() {
  return { active: false, position: [0, 0, 0], direction: 1, intensity: 0, impactId: 0 }
}

// Shared mutable game state (refs avoid re-renders)
export const gameState = {
  speed: createRef(),
  baseSpeed: 8,
  postMilestoneSpeedBoost: 3.5,
  speedBoostActive: false,
  speedLinesOn: false,
  jumping: false,
  gameOver: false,
  score: 0,
  onGameOver: null, // callback to trigger React re-render
  onRestart: null,
  kickflip: createRef(),
  screenShake: createRef(),
  landed: createRef(),
  streak: createRef(),
  scoreMultiplier: createRef(),
  pendingJumpTiming: createRef(),
  obstacleTargets: createRef(),
  obstacleDebug: createRef(),
  upArrowHeld: createRef(),
  activeGrind: createRef(),
  grindSpark: createRef(),
  timeScale: createRef(),
  grindCooldownObstacleId: createRef(),
  catHeight: createRef(),
  lastScoringEvent: createRef(),
  comboEnergy: createRef(),
  timeOfDay: createRef(), // 0→1 cycling float
  nightContrast: createRef(), // contrast offset driven by day/night cycle
  timingOffsetSeconds: createRef(),
}
gameState.speed.current = 0
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] }
gameState.screenShake.current = 0
gameState.landed.current = { triggered: false, position: [0, 0, 0] }
gameState.streak.current = 0
gameState.scoreMultiplier.current = 1
gameState.pendingJumpTiming.current = null
gameState.obstacleTargets.current = []
gameState.obstacleDebug.current = []
gameState.upArrowHeld.current = false
gameState.activeGrind.current = createIdleGrindState()
gameState.grindSpark.current = createIdleGrindSparkState()
gameState.timeScale.current = 1
gameState.grindCooldownObstacleId.current = 0
gameState.catHeight.current = 0.05
gameState.lastScoringEvent.current = { id: 0, points: 0, grade: 'Perfect', multiplier: 1, isRail: false, trickName: '' }
gameState.comboEnergy.current = 1
gameState.timeOfDay.current = 0
gameState.nightContrast.current = 0
gameState.timingOffsetSeconds.current = DEFAULT_TIMING_OFFSET_SECONDS

export function getScoreMultiplier(streak) {
  if (streak >= 20) return 4
  if (streak >= 10) return 3
  if (streak >= 5) return 2
  return 1
}

export function getGameDelta(delta) {
  return delta * (gameState.timeScale.current ?? 1)
}

// ~45 seconds per full day/night cycle
export const DAY_NIGHT_CYCLE_SPEED = 1 / 45

// Square-wave day/night: 35% day, 10% sunset, 35% night, 10% sunrise, then wraps
// 0–0.35: day, 0.35–0.45: sunset, 0.45–0.8: night, 0.8–0.9: sunrise, 0.9–1: day
export function getNightFactor(t) {
  if (t < 0.35) return 0
  if (t < 0.45) return (t - 0.35) / 0.1
  if (t < 0.8) return 1
  if (t < 0.9) return 1 - (t - 0.8) / 0.1
  return 0
}

// Returns 0–1 for sunset intensity (peaks at ~0.4)
export function getSunsetFactor(t) {
  if (t < 0.35) return 0
  if (t < 0.4) return (t - 0.35) / 0.05
  if (t < 0.45) return 1 - (t - 0.4) / 0.05
  return 0
}

// Returns contrast offset: ramps to -0.1 during sunset, holds through night, ramps back during sunrise
export function getNightContrastOffset(t) {
  if (t < 0.35) return 0
  if (t < 0.45) return -0.1 * ((t - 0.35) / 0.1)
  if (t < 0.8) return -0.1
  if (t < 0.9) return -0.1 * (1 - (t - 0.8) / 0.1)
  return 0
}

// Returns 0–1 for sunrise intensity (peaks at ~0.85)
export function getSunriseFactor(t) {
  if (t < 0.8) return 0
  if (t < 0.85) return (t - 0.8) / 0.05
  if (t < 0.9) return 1 - (t - 0.85) / 0.05
  return 0
}

// Reusable temp colors to avoid allocations
const _c1 = new THREE.Color()
const _c2 = new THREE.Color()
const _c3 = new THREE.Color()

// Cache parsed hex colors to avoid re-parsing every frame
const _colorCache = new Map()
function cachedColor(hex, dest) {
  let cached = _colorCache.get(hex)
  if (!cached) {
    cached = new THREE.Color(hex)
    _colorCache.set(hex, cached)
  }
  dest.copy(cached)
}

// Lerp between day, sunset, and night colors based on timeOfDay
export function lerpDayNightColor(target, dayHex, nightHex, nightFactor, sunsetHex, sunsetFactor) {
  cachedColor(dayHex, _c1)
  cachedColor(nightHex, _c2)
  target.copy(_c1).lerp(_c2, nightFactor)
  if (sunsetHex && sunsetFactor > 0) {
    cachedColor(sunsetHex, _c3)
    target.lerp(_c3, sunsetFactor * 0.6)
  }
}
