import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from '@react-three/postprocessing'
import { BloomEffect, BrightnessContrastEffect, HueSaturationEffect } from 'postprocessing'
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
  const bloom = useMemo(() => new BloomEffect({
    intensity: introSettings.bloomIntensity,
    luminanceThreshold: introSettings.bloomThreshold,
    luminanceSmoothing: introSettings.bloomSmoothing,
    mipmapBlur: true,
  }), [introSettings.bloomIntensity, introSettings.bloomSmoothing, introSettings.bloomThreshold])
  const brightnessContrast = useMemo(() => new BrightnessContrastEffect({
    brightness: introSettings.brightness,
    contrast: introSettings.contrast,
  }), [introSettings.brightness, introSettings.contrast])
  const hueSaturation = useMemo(() => new HueSaturationEffect({
    hue: introSettings.hue,
    saturation: introSettings.saturation,
  }), [introSettings.hue, introSettings.saturation])

  useEffect(() => () => {
    bloom.dispose()
    brightnessContrast.dispose()
    hueSaturation.dispose()
  }, [bloom, brightnessContrast, hueSaturation])

  useFrame(() => {
    const transitionMix = isTransitioning
      ? THREE.MathUtils.smootherstep(transitionProgressRef.current, 0, 1)
      : showGameWorld ? 1 : 0
    const activeSettings = interpolatePostSettings(introSettings, gameSettings, transitionMix)

    brightnessContrast.brightness = activeSettings.brightness
    brightnessContrast.contrast = activeSettings.contrast
    hueSaturation.hue = activeSettings.hue
    hueSaturation.saturation = activeSettings.saturation
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
    </EffectComposer>
  )
}
