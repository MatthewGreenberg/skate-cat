import * as THREE from 'three'

const AUTO_DPR = [1, 1.25]
const AUTO_HIGH_DPR = [1, 1.5]
const FORCED_HIGH_DPR = [1, 2]
const QUIET_DPR = [1, 1]
const MOBILE_DPR = [0.75, 1]

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, shortSide: 0, longSide: 0 }
  }

  const width = window.innerWidth
  const height = window.innerHeight

  return {
    width,
    height,
    shortSide: Math.min(width, height),
    longSide: Math.max(width, height),
  }
}

function getCoarsePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches
}

export function createRenderProfile({
  qualityMode,
  effectiveQuality,
  gpuTier,
  isTouchDevice = false,
  isSafari = false,
}) {
  const tier = gpuTier?.tier ?? 3
  const viewport = getViewportSize()
  const hasCoarsePointer = getCoarsePointer()
  const isPhoneViewport = viewport.shortSide > 0 && viewport.shortSide <= 520 && viewport.longSide <= 1100
  const isMobileDevice = isTouchDevice || hasCoarsePointer
  const isConstrainedMobile = qualityMode === 'auto' && isMobileDevice && isPhoneViewport

  let canvasDpr = AUTO_DPR
  if (isSafari) {
    canvasDpr = QUIET_DPR
  } else if (qualityMode === 'high') {
    canvasDpr = FORCED_HIGH_DPR
  } else if (effectiveQuality === 'high') {
    canvasDpr = AUTO_HIGH_DPR
  } else if (effectiveQuality === 'quiet') {
    canvasDpr = QUIET_DPR
  }

  if (isConstrainedMobile) {
    canvasDpr = MOBILE_DPR
  }

  const useShadowMaps = !isConstrainedMobile && !isSafari
  const shadowMode = useShadowMaps ? 'map' : 'contact'

  return {
    quality: effectiveQuality,
    tier,
    isMobileDevice,
    isConstrainedMobile,
    canvasDpr,
    antialias: !isConstrainedMobile,
    useShadowMaps,
    shadowMode,
    shadowType: tier <= 1 ? THREE.BasicShadowMap : THREE.PCFShadowMap,
    foliageSegmentCount: isConstrainedMobile ? 1 : effectiveQuality === 'quiet' ? 1 : 2,
    simpleTransition: false,
    skipSceneCapture: false,
    disableAo: isConstrainedMobile,
    disableBloom: false,
    disableChromaticAberration: isConstrainedMobile,
    disableLensDistortion: isConstrainedMobile,
    disableVignette: false,
    disableIntroFluid: isConstrainedMobile,
    disableAmbientParticles: isConstrainedMobile,
    disableDustTrail: isConstrainedMobile,
    disableSpeedLines: false,
    disableWildflowers: false,
    disableSkyClouds: false,
    grassBladeCountCap: isConstrainedMobile ? 1200 : null,
    disableGrassWind: false,
    backgroundLowCost: isConstrainedMobile,
    disableCatOutlines: false,
    disableCatAccentLights: false,
    disableObstacleContactShadows: false,
    disableHoldSign: false,
    disableIntroScreenGlow: false,
    introScreenTextureSize: isConstrainedMobile ? 384 : null,
  }
}
