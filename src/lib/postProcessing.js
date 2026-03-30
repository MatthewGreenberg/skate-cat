import * as THREE from 'three'

export const POST_CONTROL_LIMITS = {
  bloomIntensity: { min: 0, max: 10, step: 0.1 },
  bloomThreshold: { min: 0, max: 1, step: 0.05 },
  bloomSmoothing: { min: 0, max: 1, step: 0.05 },
  brightness: { min: -0.3, max: 0.3, step: 0.01 },
  contrast: { min: -0.5, max: 0.5, step: 0.01 },
  hue: { min: -Math.PI, max: Math.PI, step: 0.01 },
  saturation: { min: -1, max: 1, step: 0.01 },
}

export const DEFAULT_GAME_POST_SETTINGS = {
  bloomIntensity: 2.1,
  bloomThreshold: 0.35,
  bloomSmoothing: 0.1,
  brightness: 0.0,
  contrast: 0.1,
  hue: 0,
  saturation: 0.15,
}

export const DEFAULT_INTRO_POST_SETTINGS = {
  bloomIntensity: 0.5,
  bloomThreshold: 0,
  bloomSmoothing: 0.15,
  brightness: 0.0,
  contrast: 0,
  hue: 0,
  saturation: 0,
}

export function createPostProcessingControls(defaults) {
  return {
    bloomIntensity: { value: defaults.bloomIntensity, ...POST_CONTROL_LIMITS.bloomIntensity },
    bloomThreshold: { value: defaults.bloomThreshold, ...POST_CONTROL_LIMITS.bloomThreshold },
    bloomSmoothing: { value: defaults.bloomSmoothing, ...POST_CONTROL_LIMITS.bloomSmoothing },
    brightness: { value: defaults.brightness, ...POST_CONTROL_LIMITS.brightness },
    contrast: { value: defaults.contrast, ...POST_CONTROL_LIMITS.contrast },
    hue: { value: defaults.hue, ...POST_CONTROL_LIMITS.hue },
    saturation: { value: defaults.saturation, ...POST_CONTROL_LIMITS.saturation },
  }
}

export function interpolatePostSettings(from, to, alpha) {
  return {
    bloomIntensity: THREE.MathUtils.lerp(from.bloomIntensity, to.bloomIntensity, alpha),
    bloomThreshold: THREE.MathUtils.lerp(from.bloomThreshold, to.bloomThreshold, alpha),
    bloomSmoothing: THREE.MathUtils.lerp(from.bloomSmoothing, to.bloomSmoothing, alpha),
    brightness: THREE.MathUtils.lerp(from.brightness, to.brightness, alpha),
    contrast: THREE.MathUtils.lerp(from.contrast, to.contrast, alpha),
    hue: THREE.MathUtils.lerp(from.hue, to.hue, alpha),
    saturation: THREE.MathUtils.lerp(from.saturation, to.saturation, alpha),
  }
}
