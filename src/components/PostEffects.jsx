/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { folder } from 'leva'
import { EffectComposer } from '@react-three/postprocessing'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  GodRaysEffect,
  HueSaturationEffect,
  KernelSize,
  LensDistortionEffect,
  VignetteEffect,
  VignetteTechnique,
} from 'postprocessing'
import { N8AO } from '@react-three/postprocessing'
import TransitionEffect from './TransitionEffect'
import IntroFluidEffect from './IntroFluidEffect'
import VhsGlitchEffect from './VhsGlitchEffect'
import { gameState, getNightFactor, isSafari } from '../store'
import { interpolatePostSettings } from '../lib/postProcessing'
import { useOptionalControls } from '../lib/debugControls'
import {
  godRaysSourceRef,
  SharpOverlayPass,
  sharpSelection,
} from './introScene/sharpSelection'

const NIGHT_BLOOM_INTENSITY = 4.3
const VHS_GLITCH_DURATION_SECONDS = 0.7

export function TransitionAnimator({ progressRef, isTransitioning, duration, onComplete }) {
  useFrame((_, delta) => {
    if (!isTransitioning) return
    progressRef.current = Math.min(progressRef.current + delta / Math.max(duration, 0.001), 1)
    if (progressRef.current >= 1) {
      onComplete()
    }
  })
  return null
}

export default function PostEffects({
  introSettings,
  gameSettings,
  transitionSettings,
  transitionProgressRef,
  isTransitioning,
  transitionDirection = 'forward',
  showGameWorld,
  showIntroOverlay,
  runActive,
  capturedTexture,
  gpuTier,
  quality = 'auto',
  chromaticSpike = 0,
  introOverlaySettings,
  renderProfile = {},
  introScreenMode,
}) {
  const tier = gpuTier?.tier ?? 3
  const { scene, camera } = useThree()
  const aoCtrl = useOptionalControls('AO', {
    aoEnabled: true,
    aoRadius: { value: 0.5, min: 0.05, max: 3, step: 0.05 },
    aoIntensityIntro: { value: 6.1, min: 0, max: 10, step: 0.1 },
    aoIntensityGame: { value: 3, min: 0, max: 10, step: 0.1 },
    aoDistanceFalloff: { value: 1.05, min: 0, max: 2, step: 0.05 },
    aoHalfRes: true,
  }, [])
  const dofCtrl = useOptionalControls('Intro', {
    'Depth of Field': folder({
      dofEnabled: true,
      dofFocusDistance: { value: 8.3, min: 0.1, max: 12, step: 0.05 },
      dofFocusRange: { value: 0.9, min: 0.05, max: 6, step: 0.05 },
      dofBokehScale: { value: 4.2, min: 0, max: 14, step: 0.1 },
    }, { collapsed: true }),
  }, [])
  const godRaysCtrl = useOptionalControls('Intro', {
    'God Rays': folder({
      godRaysEnabled: true,
      godRaysDensity: { value: 0.82, min: 0, max: 1, step: 0.005 },
      godRaysDecay: { value: 0.9, min: 0.6, max: 0.99, step: 0.005 },
      godRaysWeight: { value: 0.15, min: 0, max: 1.5, step: 0.01 },
      godRaysExposure: { value: 0.41, min: 0, max: 1.4, step: 0.01 },
      godRaysSamples: { value: 38, min: 10, max: 120, step: 1 },
      godRaysClampMax: { value: 1, min: 0.2, max: 1, step: 0.01 },
    }, { collapsed: true }),
  }, [])
  const shouldEnableAo = aoCtrl.aoEnabled
    && showGameWorld
    && quality !== 'quiet'
    && tier >= 2
    && !isSafari
    && !renderProfile.disableAo
  const shouldEnableBloom = !renderProfile.disableBloom
  const shouldEnableChromatic = !renderProfile.disableChromaticAberration
  const shouldEnableLensDistortion = !renderProfile.disableLensDistortion
  const shouldEnableVignette = !renderProfile.disableVignette
  const shouldEnableIntroFluid = showIntroOverlay && introOverlaySettings.enabled && !renderProfile.disableIntroFluid
  const shouldEnableTransition = isTransitioning && (renderProfile.simpleTransition || capturedTexture)
  const shouldEnableColorGrading = true
  // AO / bloom use tier >= 2; intro DOF + god rays need tier 1 too — detect-gpu often
  // classifies iOS Safari as tier 1 ("quiet"), which hid these entirely.
  const introDofGodRaysTierOk = tier >= 1 || isSafari
  const shouldEnableDof = dofCtrl.dofEnabled
    && !showGameWorld
    && introDofGodRaysTierOk
    && !renderProfile.disableDof
  const shouldEnableGodRays = godRaysCtrl.godRaysEnabled
    && !showGameWorld
    && introDofGodRaysTierOk
    && !renderProfile.disableGodRays

  const aoRef = useRef(null)
  const bloomRef = useRef(null)
  const brightnessContrastRef = useRef(null)
  const hueSaturationRef = useRef(null)
  const lensDistortionRef = useRef(null)
  const chromaticAberrationRef = useRef(null)
  const chromaticStrengthRef = useRef(0)
  const freezeEffectRef = useRef(0)
  const vhsProgressRef = useRef(0)
  const vhsStartTimeRef = useRef(null)
  const prevChromaticSpikeRef = useRef(0)
  const vignetteRef = useRef(null)
  const dofRef = useRef(null)
  const sharpOverlayRef = useRef(null)
  const godRaysRef = useRef(null)
  const godRaysDummyRef = useRef(null)
  const postMixRef = useRef(showGameWorld ? 1 : 0)
  const postMixStartRef = useRef(showGameWorld ? 1 : 0)
  const introOverlayMixRef = useRef(showIntroOverlay ? 1 : 0)
  const wasTransitioningRef = useRef(false)
  const godRaysDimRef = useRef(0)

  if (bloomRef.current == null) {
    bloomRef.current = new BloomEffect({
      intensity: introSettings.bloomIntensity,
      luminanceThreshold: introSettings.bloomThreshold,
      luminanceSmoothing: introSettings.bloomSmoothing,
      mipmapBlur: true,
    })
  }
  if (brightnessContrastRef.current == null) {
    brightnessContrastRef.current = new BrightnessContrastEffect({
      brightness: introSettings.brightness,
      contrast: introSettings.contrast,
    })
  }
  if (hueSaturationRef.current == null) {
    hueSaturationRef.current = new HueSaturationEffect({
      hue: introSettings.hue,
      saturation: introSettings.saturation,
    })
  }
  if (lensDistortionRef.current == null) {
    lensDistortionRef.current = new LensDistortionEffect({
      distortion: new THREE.Vector2(introSettings.distortionX, introSettings.distortionY),
    })
  }
  if (chromaticAberrationRef.current == null) {
    chromaticAberrationRef.current = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.1,
    })
  }
  if (vignetteRef.current == null) {
    vignetteRef.current = new VignetteEffect({
      technique: VignetteTechnique.DEFAULT,
      offset: 0,
      darkness: 0,
    })
  }
  if (dofRef.current == null) {
    dofRef.current = new DepthOfFieldEffect(camera, {
      focusDistance: dofCtrl.dofFocusDistance,
      focusRange: dofCtrl.dofFocusRange,
      bokehScale: dofCtrl.dofBokehScale,
      resolutionScale: 0.5,
    })
  }
  if (sharpOverlayRef.current == null) {
    sharpOverlayRef.current = new SharpOverlayPass(scene, camera)
  }
  if (godRaysRef.current == null) {
    // GodRaysEffect requires a non-null lightSource at construction. We swap
    // in the real CRT screen mesh once TvScreen registers it via godRaysSourceRef.
    godRaysDummyRef.current = new THREE.Mesh(
      new THREE.PlaneGeometry(0.0001, 0.0001),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, visible: false })
    )
    godRaysRef.current = new GodRaysEffect(camera, godRaysDummyRef.current, {
      kernelSize: KernelSize.SMALL,
      density: godRaysCtrl.godRaysDensity,
      decay: godRaysCtrl.godRaysDecay,
      weight: godRaysCtrl.godRaysWeight,
      exposure: godRaysCtrl.godRaysExposure,
      samples: godRaysCtrl.godRaysSamples,
      clampMax: godRaysCtrl.godRaysClampMax,
      blur: true,
    })
  }

  const bloom = bloomRef.current
  const brightnessContrast = brightnessContrastRef.current
  const hueSaturation = hueSaturationRef.current
  const lensDistortion = lensDistortionRef.current
  const chromaticAberration = chromaticAberrationRef.current
  const vignette = vignetteRef.current
  const dof = dofRef.current
  const sharpOverlay = sharpOverlayRef.current
  const godRays = godRaysRef.current

  useEffect(() => {
    if (sharpOverlayRef.current) {
      sharpOverlayRef.current.overlayScene = scene
      sharpOverlayRef.current.overlayCamera = camera
    }
  }, [scene, camera])

  useEffect(() => () => {
    bloomRef.current?.dispose()
    brightnessContrastRef.current?.dispose()
    hueSaturationRef.current?.dispose()
    lensDistortionRef.current?.dispose()
    chromaticAberrationRef.current?.dispose()
    vignetteRef.current?.dispose()
    dofRef.current?.dispose()
    sharpOverlayRef.current?.dispose()
    godRaysRef.current?.dispose()
    godRaysDummyRef.current?.geometry?.dispose()
    godRaysDummyRef.current?.material?.dispose()
  }, [])

  useFrame(() => {
    if (isTransitioning && !wasTransitioningRef.current) {
      postMixStartRef.current = postMixRef.current
    }
    // Snap post mix to target when reverse transition ends
    if (!isTransitioning && wasTransitioningRef.current && transitionDirection === 'reverse') {
      postMixRef.current = 0
    }
    wasTransitioningRef.current = isTransitioning

    const transitionAlpha = THREE.MathUtils.smootherstep(transitionProgressRef.current, 0, 1)
    const staticMix = chromaticSpike > 0 && showGameWorld && !isTransitioning
      ? THREE.MathUtils.lerp(1, 0.74, chromaticSpike)
      : showGameWorld ? 1 : 0
    const desiredPostMix = isTransitioning
      ? THREE.MathUtils.lerp(
        postMixStartRef.current,
        transitionDirection === 'reverse' ? 0 : 1,
        transitionAlpha
      )
      : staticMix

    postMixRef.current = THREE.MathUtils.lerp(
      postMixRef.current,
      desiredPostMix,
      isTransitioning ? 0.24 : chromaticSpike > 0 ? 0.2 : 0.14
    )

    const overlayTargetMix = showIntroOverlay && introOverlaySettings.enabled ? 1 : 0
    introOverlayMixRef.current = THREE.MathUtils.lerp(
      introOverlayMixRef.current,
      overlayTargetMix,
      overlayTargetMix > introOverlayMixRef.current ? 0.08 : 0.14
    )

    const activeSettings = interpolatePostSettings(introSettings, gameSettings, postMixRef.current)

    if (aoRef.current) {
      aoRef.current.configuration.intensity = THREE.MathUtils.lerp(
        aoCtrl.aoIntensityIntro, aoCtrl.aoIntensityGame, postMixRef.current
      )
    }

    brightnessContrast.brightness = activeSettings.brightness
    brightnessContrast.contrast = activeSettings.contrast
    hueSaturation.hue = activeSettings.hue
    hueSaturation.saturation = activeSettings.saturation
    chromaticStrengthRef.current = THREE.MathUtils.lerp(
      chromaticStrengthRef.current,
      0,
      0.12
    )
    chromaticAberration.offset.set(
      0.0095 * chromaticStrengthRef.current,
      0.0038 * chromaticStrengthRef.current
    )

    // VHS eject glitch drives the freeze moment now — keep lens/vignette at baseline
    // so they don't fight the glitch pass.
    freezeEffectRef.current = 0
    lensDistortion.distortion.set(activeSettings.distortionX, activeSettings.distortionY)
    vignette.offset = 0
    vignette.darkness = 0

    // Ramp VHS glitch progress over VHS_GLITCH_DURATION_SECONDS while chromaticSpike > 0
    const prevSpike = prevChromaticSpikeRef.current
    if (chromaticSpike > 0 && prevSpike <= 0) {
      vhsStartTimeRef.current = performance.now()
    }
    if (chromaticSpike <= 0) {
      vhsStartTimeRef.current = null
      vhsProgressRef.current = 0
    } else if (vhsStartTimeRef.current != null) {
      const elapsed = (performance.now() - vhsStartTimeRef.current) / 1000
      vhsProgressRef.current = Math.min(elapsed / VHS_GLITCH_DURATION_SECONDS, 1)
    }
    prevChromaticSpikeRef.current = chromaticSpike
    if (shouldEnableBloom) {
      // During forward transition, snap bloom to game settings so there's no tween through
      // an in-between look. Reverse and non-transition frames use the interpolated values.
      const bloomSource = (isTransitioning && transitionDirection !== 'reverse')
        ? gameSettings
        : activeSettings
      bloom.luminanceMaterial.threshold = bloomSource.bloomThreshold
      bloom.luminanceMaterial.smoothing = bloomSource.bloomSmoothing
      const nightFactor = runActive ? getNightFactor(gameState.timeOfDay.current) : 0
      bloom.intensity = THREE.MathUtils.lerp(bloomSource.bloomIntensity, NIGHT_BLOOM_INTENSITY, nightFactor)
      bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(bloomSource.bloomThreshold, 0, nightFactor)
    }

    // Disable effects that have no visual contribution to save full-screen passes
    chromaticAberration.enabled = shouldEnableChromatic && chromaticStrengthRef.current > 0.001
    lensDistortion.enabled = shouldEnableLensDistortion && !isSafari
    vignette.enabled = shouldEnableVignette && vignette.darkness > 0.001

    if (dof) {
      dof.enabled = shouldEnableDof
      if (shouldEnableDof) {
        const dofMobileMul = renderProfile.isMobileDevice ? 0.45 : 1
        dof.cocMaterial.focusDistance = dofCtrl.dofFocusDistance
        dof.cocMaterial.focusRange = dofCtrl.dofFocusRange
        dof.bokehScale = dofCtrl.dofBokehScale * dofMobileMul
      }
    }
    if (sharpOverlay) {
      sharpOverlay.enabled = shouldEnableDof && sharpSelection.size > 0
    }
    if (godRays) {
      const source = godRaysSourceRef.current ?? godRaysDummyRef.current
      if (source && godRays.lightSource !== source) {
        godRays.lightSource = source
      }
      const hasRealSource = godRaysSourceRef.current != null
      godRays.enabled = shouldEnableGodRays && hasRealSource
      // Tween god rays down when looking at the summary or leaderboard screens.
      const shouldDimGodRays = introScreenMode === 'leaderboard'
        || introScreenMode === 'initials'
        || introScreenMode === 'summary'
      godRaysDimRef.current = THREE.MathUtils.lerp(
        godRaysDimRef.current,
        shouldDimGodRays ? 1 : 0,
        0.06
      )
      if (godRays.enabled) {
        const mat = godRays.godRaysMaterial
        if (mat) {
          const dimMul = THREE.MathUtils.lerp(1, 0.5, godRaysDimRef.current)
          const mobileMul = renderProfile.isMobileDevice ? 0.4 : 1
          mat.density = godRaysCtrl.godRaysDensity
          mat.decay = godRaysCtrl.godRaysDecay
          mat.weight = godRaysCtrl.godRaysWeight * dimMul * mobileMul
          mat.exposure = godRaysCtrl.godRaysExposure * dimMul * mobileMul
          mat.samples = godRaysCtrl.godRaysSamples
          const clampUniform = mat.uniforms?.clampMax
          if (clampUniform) clampUniform.value = godRaysCtrl.godRaysClampMax
        }
      }
    }
  })

  const shouldMountComposer = shouldEnableAo
    || shouldEnableBloom
    || shouldEnableTransition
    || shouldEnableIntroFluid
    || shouldEnableColorGrading
    || shouldEnableLensDistortion
    || shouldEnableVignette
    || shouldEnableDof
    || shouldEnableGodRays

  if (!shouldMountComposer) return null

  return (
    <EffectComposer multisampling={0}>
      {shouldEnableAo && (
        <N8AO
          ref={aoRef}
          aoRadius={aoCtrl.aoRadius}
          intensity={aoCtrl.aoIntensityIntro}
          distanceFalloff={aoCtrl.aoDistanceFalloff}
          color={new THREE.Color('#1a0a2e')}
          halfRes={aoCtrl.aoHalfRes || tier === 2 || quality !== 'high'}
          depthAwareUpsampling
          quality={tier >= 3 && quality === 'high' ? 'medium' : 'performance'}
        />
      )}
      {shouldEnableDof && <primitive object={dof} />}
      {shouldEnableDof && <primitive object={sharpOverlay} />}
      {shouldEnableBloom && <primitive object={bloom} />}
      {shouldEnableGodRays && <primitive object={godRays} />}
      {shouldEnableChromatic && <primitive object={chromaticAberration} />}
      <VhsGlitchEffect progressRef={vhsProgressRef} />
      {shouldEnableTransition && (
        <TransitionEffect
          capturedTexture={capturedTexture}
          progressRef={transitionProgressRef}
          settings={transitionSettings}
          direction={transitionDirection}
          simpleMode={renderProfile.simpleTransition}
        />
      )}
      {shouldEnableIntroFluid && (
        <IntroFluidEffect
          active
          mixRef={introOverlayMixRef}
          settings={introOverlaySettings}
        />
      )}
      <primitive object={brightnessContrast} />
      <primitive object={hueSaturation} />
      {shouldEnableLensDistortion && <primitive object={lensDistortion} />}
      {shouldEnableVignette && <primitive object={vignette} />}
    </EffectComposer>
  )
}
