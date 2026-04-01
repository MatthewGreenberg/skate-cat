/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from '@react-three/postprocessing'
import {
  BloomEffect,
  BrightnessContrastEffect,
  HueSaturationEffect,
  LensDistortionEffect,
} from 'postprocessing'
import TransitionEffect from './TransitionEffect'
import { gameState, getNightFactor } from '../store'
import { interpolatePostSettings } from '../lib/postProcessing'

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
  showGameWorld,
  runActive,
  introTexture,
}) {
  const bloomRef = useRef(null)
  const brightnessContrastRef = useRef(null)
  const hueSaturationRef = useRef(null)
  const lensDistortionRef = useRef(null)

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

  const bloom = bloomRef.current
  const brightnessContrast = brightnessContrastRef.current
  const hueSaturation = hueSaturationRef.current
  const lensDistortion = lensDistortionRef.current

  useEffect(() => () => {
    bloomRef.current?.dispose()
    brightnessContrastRef.current?.dispose()
    hueSaturationRef.current?.dispose()
    lensDistortionRef.current?.dispose()
  }, [])

  useFrame(() => {
    const transitionMix = isTransitioning
      ? THREE.MathUtils.smootherstep(transitionProgressRef.current, 0, 1)
      : showGameWorld ? 1 : 0
    const activeSettings = interpolatePostSettings(introSettings, gameSettings, transitionMix)

    brightnessContrast.brightness = activeSettings.brightness
    brightnessContrast.contrast = activeSettings.contrast
    hueSaturation.hue = activeSettings.hue
    hueSaturation.saturation = activeSettings.saturation
    lensDistortion.distortion.set(
      activeSettings.distortionX,
      activeSettings.distortionY
    )
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
      <primitive object={bloom} />
      {isTransitioning && introTexture && (
        <TransitionEffect
          introTexture={introTexture}
          progressRef={transitionProgressRef}
          settings={transitionSettings}
        />
      )}
      <primitive object={brightnessContrast} />
      <primitive object={hueSaturation} />
      <primitive object={lensDistortion} />
    </EffectComposer>
  )
}
