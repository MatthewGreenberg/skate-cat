/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from '@react-three/postprocessing'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  BrightnessContrastEffect,
  HueSaturationEffect,
  LensDistortionEffect,
  VignetteEffect,
  VignetteTechnique,
} from 'postprocessing'
import { N8AO } from '@react-three/postprocessing'
import TransitionEffect from './TransitionEffect'
import { gameState, getNightFactor } from '../store'
import { interpolatePostSettings } from '../lib/postProcessing'
import { useOptionalControls } from '../lib/debugControls'

const NIGHT_BLOOM_INTENSITY = 4.3

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
  runActive,
  capturedTexture,
  gpuTier,
  chromaticSpike = 0,
}) {
  const tier = gpuTier?.tier ?? 3
  const aoCtrl = useOptionalControls('AO', {
    aoEnabled: true,
    aoRadius: { value: 0.5, min: 0.05, max: 3, step: 0.05 },
    aoIntensityIntro: { value: 6.1, min: 0, max: 10, step: 0.1 },
    aoIntensityGame: { value: 3, min: 0, max: 10, step: 0.1 },
    aoDistanceFalloff: { value: 1.05, min: 0, max: 2, step: 0.05 },
    aoHalfRes: true,
  }, [])

  const aoRef = useRef(null)
  const bloomRef = useRef(null)
  const brightnessContrastRef = useRef(null)
  const hueSaturationRef = useRef(null)
  const lensDistortionRef = useRef(null)
  const chromaticAberrationRef = useRef(null)
  const chromaticStrengthRef = useRef(0)
  const freezeEffectRef = useRef(0)
  const vignetteRef = useRef(null)
  const postMixRef = useRef(showGameWorld ? 1 : 0)
  const postMixStartRef = useRef(showGameWorld ? 1 : 0)
  const wasTransitioningRef = useRef(false)

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

  const bloom = bloomRef.current
  const brightnessContrast = brightnessContrastRef.current
  const hueSaturation = hueSaturationRef.current
  const lensDistortion = lensDistortionRef.current
  const chromaticAberration = chromaticAberrationRef.current
  const vignette = vignetteRef.current

  useEffect(() => () => {
    bloomRef.current?.dispose()
    brightnessContrastRef.current?.dispose()
    hueSaturationRef.current?.dispose()
    lensDistortionRef.current?.dispose()
    chromaticAberrationRef.current?.dispose()
    vignetteRef.current?.dispose()
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

    // Freeze-frame death effect: slow zoom + vignette darkening
    freezeEffectRef.current = THREE.MathUtils.lerp(
      freezeEffectRef.current,
      chromaticSpike,
      chromaticSpike > freezeEffectRef.current ? 0.06 : 0.15
    )
    const freezeT = freezeEffectRef.current
    // Slow zoom: push lens distortion inward (barrel zoom)
    const zoomAmount = freezeT * -0.12
    lensDistortion.distortion.set(
      activeSettings.distortionX + zoomAmount,
      activeSettings.distortionY + zoomAmount
    )
    // Vignette: darken edges
    vignette.offset = THREE.MathUtils.lerp(0.3, 0.05, freezeT)
    vignette.darkness = THREE.MathUtils.lerp(0, 0.85, freezeT)
    bloom.luminanceMaterial.threshold = activeSettings.bloomThreshold
    bloom.luminanceMaterial.smoothing = activeSettings.bloomSmoothing

    // Suppress bloom during early transition so the live intro buffer renders cleanly.
    if (isTransitioning && transitionProgressRef.current < 0.15) {
      bloom.intensity = 0
      return
    }

    const nightFactor = runActive ? getNightFactor(gameState.timeOfDay.current) : 0
    bloom.intensity = THREE.MathUtils.lerp(activeSettings.bloomIntensity, NIGHT_BLOOM_INTENSITY, nightFactor)
    bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(activeSettings.bloomThreshold, 0, nightFactor)
  })

  return (
    <EffectComposer multisampling={0}>
      {aoCtrl.aoEnabled && tier >= 2 && (
        <N8AO
          ref={aoRef}
          aoRadius={aoCtrl.aoRadius}
          intensity={aoCtrl.aoIntensityIntro}
          distanceFalloff={aoCtrl.aoDistanceFalloff}
          color={new THREE.Color('#1a0a2e')}
          halfRes={aoCtrl.aoHalfRes || tier === 2}
          depthAwareUpsampling
          quality={tier >= 3 ? 'medium' : 'performance'}
        />
      )}
      <primitive object={bloom} />
      <primitive object={chromaticAberration} />
      {isTransitioning && capturedTexture && (
        <TransitionEffect
          capturedTexture={capturedTexture}
          progressRef={transitionProgressRef}
          settings={transitionSettings}
          direction={transitionDirection}
        />
      )}
      <primitive object={brightnessContrast} />
      <primitive object={hueSaturation} />
      <primitive object={lensDistortion} />
      <primitive object={vignette} />
    </EffectComposer>
  )
}
