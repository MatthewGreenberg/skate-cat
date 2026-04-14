import * as THREE from "three";

export const POST_CONTROL_LIMITS = {
  bloomIntensity: { min: 0, max: 10, step: 0.1 },
  bloomThreshold: { min: 0, max: 1, step: 0.01 },
  bloomSmoothing: { min: 0, max: 1, step: 0.05 },
  brightness: { min: -0.3, max: 0.3, step: 0.01 },
  contrast: { min: -0.5, max: 0.5, step: 0.01 },
  hue: { min: -Math.PI, max: Math.PI, step: 0.01 },
  saturation: { min: -1, max: 1, step: 0.01 },
  distortionX: { min: -1.0, max: 1.0, step: 0.01 },
  distortionY: { min: -1.0, max: 1.0, step: 0.01 },
};

export const DEFAULT_GAME_POST_SETTINGS = {
  bloomIntensity: 1.5,
  bloomThreshold: 0.24,
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
  warpStrength: { min: 0, max: 200, step: 5 },
  scanlineFrequency: { min: 20, max: 420, step: 1 },
  scanlineStrength: { min: 0, max: 1, step: 0.01 },
  rgbSplit: { min: 0, max: 6, step: 0.05 },
  highlightStrength: { min: 0, max: 1, step: 0.01 },
  edgeGlowStrength: { min: 0, max: 1.5, step: 0.01 },
  velocityWarp: { min: 0, max: 4, step: 0.05 },
  brushRadius: { min: 0.01, max: 0.18, step: 0.0025 },
  brushStrength: { min: 0.05, max: 1, step: 0.01 },
  decayRate: { min: 0.2, max: 6, step: 0.05 },
};

export const DEFAULT_INTRO_OVERLAY_SETTINGS = {
  enabled: true,
  brushRadius: 0.05,
  brushStrength: 0.145,
  decayRate: 1.75,
  warpStrength: 166,
  scanlineFrequency: 420,
  scanlineStrength: 0.72,
  rgbSplit: 5.05,
  highlightStrength: 0,
  edgeGlowStrength: 0.96,
  velocityWarp: 1.6,
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
    warpStrength: {
      value: defaults.warpStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.warpStrength,
    },
    scanlineFrequency: {
      value: defaults.scanlineFrequency,
      ...INTRO_OVERLAY_CONTROL_LIMITS.scanlineFrequency,
    },
    scanlineStrength: {
      value: defaults.scanlineStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.scanlineStrength,
    },
    rgbSplit: {
      value: defaults.rgbSplit,
      ...INTRO_OVERLAY_CONTROL_LIMITS.rgbSplit,
    },
    highlightStrength: {
      value: defaults.highlightStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.highlightStrength,
    },
    edgeGlowStrength: {
      value: defaults.edgeGlowStrength,
      ...INTRO_OVERLAY_CONTROL_LIMITS.edgeGlowStrength,
    },
    velocityWarp: {
      value: defaults.velocityWarp,
      ...INTRO_OVERLAY_CONTROL_LIMITS.velocityWarp,
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
