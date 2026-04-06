/**
 * Shared colors and Leva default values for the CRT TV room intro.
 */

export const ROOM_BACKGROUND = "#09070a";
export const SCREEN_CYAN = "#ffd166";
export const SCREEN_ORANGE = "#ef476f";
export const WALL_EDGE_COOL = "#6479b8";
/** Base color for the intro room area rug (circle + darker ring). */
export const RUG_COLOR = "#7a5240";

export const DEFAULT_TV = {
  posX: 0.48,
  posY: 0,
  posZ: -1.1,
  rotY: 3.14,
  scale: 4.44,
};

export const DEFAULT_CAT = {
  posX: -0.7,
  posY: 0.87,
  posZ: -0.1,
  rotX: 0.05,
  rotY: -0.1,
  rotZ: 0.01,
  scale: 0.03,
};

export const DEFAULT_TV_UI = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 0.88,
  scaleY: 0.88,
  curve: 0,
  glowEnabled: true,
  glowScaleX: 1.03,
  glowScaleY: 1.03,
  glowOpacity: 0.04,
  glowOffsetZ: -0.01,
};

export const DEFAULT_TV_CRT = {
  warp: 0,
  aberration: 0.005,
  edgeAberration: 0,
  hoverBoost: 0.25,
  scanlineIntensity: 0.2,
  scanlineDensity: 860,
  grilleIntensity: 0.03,
  grilleDensity: 1400,
  rollIntensity: 0.08,
  rollSpeed: 0.18,
  noiseIntensity: 0.04,
  vignetteStrength: 1.25,
  vignetteStart: 0.18,
  brightness: 1.08,
  blackLevel: 0,
  powerOnDuration: 0.7,
};
