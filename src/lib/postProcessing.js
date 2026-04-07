import * as THREE from "three";

export const POST_CONTROL_LIMITS = {
  bloomIntensity: { min: 0, max: 10, step: 0.1 },
  bloomThreshold: { min: 0, max: 1, step: 0.05 },
  bloomSmoothing: { min: 0, max: 1, step: 0.05 },
  brightness: { min: -0.3, max: 0.3, step: 0.01 },
  contrast: { min: -0.5, max: 0.5, step: 0.01 },
  hue: { min: -Math.PI, max: Math.PI, step: 0.01 },
  saturation: { min: -1, max: 1, step: 0.01 },
  distortionX: { min: -0.2, max: 0.2, step: 0.001 },
  distortionY: { min: -0.2, max: 0.2, step: 0.001 },
};

export const DEFAULT_GAME_POST_SETTINGS = {
  bloomIntensity: 2.1,
  bloomThreshold: 0.35,
  bloomSmoothing: 0.1,
  brightness: 0.0,
  contrast: 0.1,
  hue: 0,
  saturation: 0.15,
  distortionX: 0,
  distortionY: 0,
};

export const DEFAULT_INTRO_POST_SETTINGS = {
  bloomIntensity: 0.75,
  bloomThreshold: 0,
  bloomSmoothing: 0.15,
  brightness: 0.0,
  contrast: 0.08,
  hue: 0,
  saturation: 0.08,
  distortionX: 0,
  distortionY: 0,
};

export const INTRO_OVERLAY_CONTROL_LIMITS = {
  distortionPixels: { min: 0, max: 4, step: 0.05 },
  flowScale: { min: 0.5, max: 12, step: 0.1 },
  flowSpeed: { min: 0, max: 2, step: 0.01 },
  cellSize: { min: 1, max: 16, step: 0.25 },
  pixelatePixels: { min: 1, max: 48, step: 1 },
  blendStrength: { min: 0, max: 1, step: 0.01 },
  desaturateBias: { min: 0, max: 1, step: 0.01 },
  desaturateAmount: { min: 0, max: 1, step: 0.01 },
  brushRadius: { min: 0.01, max: 0.18, step: 0.0025 },
  brushStrength: { min: 0.05, max: 1, step: 0.01 },
  decayRate: { min: 0.2, max: 6, step: 0.05 },
};

export const DEFAULT_INTRO_OVERLAY_SETTINGS = {
  enabled: true,
  distortionPixels: 4,
  flowScale: 2.3,
  flowSpeed: 0.28,
  cellSize: 3,
  pixelatePixels: 27,
  blendStrength: 0.28,
  desaturateBias: 0.55,
  desaturateAmount: 0.83,
  brushRadius: 0.06,
  brushStrength: 1,
  decayRate: 1.5,
};

export function createPostProcessingControls(defaults) {
  return {
    bloomIntensity: {
      value: defaults.bloomIntensity,
      ...POST_CONTROL_LIMITS.bloomIntensity,
    },
    bloomThreshold: {
      value: defaults.bloomThreshold,
      ...POST_CONTROL_LIMITS.bloomThreshold,
    },
    bloomSmoothing: {
      value: defaults.bloomSmoothing,
      ...POST_CONTROL_LIMITS.bloomSmoothing,
    },
    brightness: {
      value: defaults.brightness,
      ...POST_CONTROL_LIMITS.brightness,
    },
    contrast: { value: defaults.contrast, ...POST_CONTROL_LIMITS.contrast },
    hue: { value: defaults.hue, ...POST_CONTROL_LIMITS.hue },
    saturation: {
      value: defaults.saturation,
      ...POST_CONTROL_LIMITS.saturation,
    },
    distortionX: {
      value: defaults.distortionX,
      ...POST_CONTROL_LIMITS.distortionX,
    },
    distortionY: {
      value: defaults.distortionY,
      ...POST_CONTROL_LIMITS.distortionY,
    },
  };
}

export function createIntroOverlayControls(defaults) {
  return {
    enabled: defaults.enabled,
    distortionPixels: {
      value: defaults.distortionPixels,
      ...INTRO_OVERLAY_CONTROL_LIMITS.distortionPixels,
    },
    flowScale: {
      value: defaults.flowScale,
      ...INTRO_OVERLAY_CONTROL_LIMITS.flowScale,
    },
    flowSpeed: {
      value: defaults.flowSpeed,
      ...INTRO_OVERLAY_CONTROL_LIMITS.flowSpeed,
    },
    cellSize: {
      value: defaults.cellSize,
      ...INTRO_OVERLAY_CONTROL_LIMITS.cellSize,
    },
    pixelatePixels: {
      value: defaults.pixelatePixels,
      ...INTRO_OVERLAY_CONTROL_LIMITS.pixelatePixels,
    },
    blendStrength: {
      value: defaults.blendStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.blendStrength,
    },
    desaturateBias: {
      value: defaults.desaturateBias,
      ...INTRO_OVERLAY_CONTROL_LIMITS.desaturateBias,
    },
    desaturateAmount: {
      value: defaults.desaturateAmount,
      ...INTRO_OVERLAY_CONTROL_LIMITS.desaturateAmount,
    },
    brushRadius: {
      value: defaults.brushRadius,
      ...INTRO_OVERLAY_CONTROL_LIMITS.brushRadius,
    },
    brushStrength: {
      value: defaults.brushStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.brushStrength,
    },
    decayRate: {
      value: defaults.decayRate,
      ...INTRO_OVERLAY_CONTROL_LIMITS.decayRate,
    },
  };
}

export function interpolatePostSettings(from, to, alpha) {
  return {
    bloomIntensity: THREE.MathUtils.lerp(
      from.bloomIntensity,
      to.bloomIntensity,
      alpha,
    ),
    bloomThreshold: THREE.MathUtils.lerp(
      from.bloomThreshold,
      to.bloomThreshold,
      alpha,
    ),
    bloomSmoothing: THREE.MathUtils.lerp(
      from.bloomSmoothing,
      to.bloomSmoothing,
      alpha,
    ),
    brightness: THREE.MathUtils.lerp(from.brightness, to.brightness, alpha),
    contrast: THREE.MathUtils.lerp(from.contrast, to.contrast, alpha),
    hue: THREE.MathUtils.lerp(from.hue, to.hue, alpha),
    saturation: THREE.MathUtils.lerp(from.saturation, to.saturation, alpha),
    distortionX: THREE.MathUtils.lerp(from.distortionX, to.distortionX, alpha),
    distortionY: THREE.MathUtils.lerp(from.distortionY, to.distortionY, alpha),
  };
}
