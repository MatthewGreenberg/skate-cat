import { createRef } from 'react'
import * as THREE from 'three'

export const isDebug = new URLSearchParams(window.location.search).has('debug')

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
  timeOfDay: createRef(), // 0→1 cycling float
  nightContrast: createRef(), // contrast offset driven by day/night cycle
}
gameState.speed.current = 0
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] }
gameState.screenShake.current = 0
gameState.landed.current = { triggered: false, position: [0, 0, 0] }
gameState.streak.current = 0
gameState.timeOfDay.current = 0
gameState.nightContrast.current = 0

// ~45 seconds per full day/night cycle
export const DAY_NIGHT_CYCLE_SPEED = 1 / 45

// Returns 0–1 for how "night" it currently is
// 0-0.25: day (0), 0.25-0.4: sunset (0→1), 0.4-0.6: night (1), 0.6-0.75: sunrise (1→0), 0.75-1: day (0)
export function getNightFactor(t) {
  if (t < 0.25) return 0
  if (t < 0.4) return (t - 0.25) / 0.15
  if (t < 0.6) return 1
  if (t < 0.75) return 1 - (t - 0.6) / 0.15
  return 0
}

// Returns 0–1 for sunset intensity (peaks at ~0.33)
export function getSunsetFactor(t) {
  if (t < 0.25) return 0
  if (t < 0.33) return (t - 0.25) / 0.08
  if (t < 0.4) return 1 - (t - 0.33) / 0.07
  return 0
}

// Returns contrast offset: ramps to -0.1 from 0.25→0.35, holds, ramps back from 0.55→0.65
export function getNightContrastOffset(t) {
  if (t < 0.25) return 0
  if (t < 0.35) return -0.1 * ((t - 0.25) / 0.1)
  if (t < 0.55) return -0.1
  if (t < 0.65) return -0.1 * (1 - (t - 0.55) / 0.1)
  return 0
}

// Returns 0–1 for sunrise intensity (peaks at ~0.67)
export function getSunriseFactor(t) {
  if (t < 0.6) return 0
  if (t < 0.67) return (t - 0.6) / 0.07
  if (t < 0.75) return 1 - (t - 0.67) / 0.08
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
