import { useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFBO } from '@react-three/drei'
import { EffectComposer } from '@react-three/postprocessing'
import { BloomEffect, BrightnessContrastEffect, HueSaturationEffect } from 'postprocessing'
import IntroScene from './IntroScene'
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
  introCaptureCameraRef,
}) {
  const { size, viewport } = useThree()
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
  const introScene = useMemo(() => new THREE.Scene(), [])
  const introCaptureCamera = useMemo(() => new THREE.PerspectiveCamera(43, 1, 0.1, 1000), [])
  const introWidth = Math.max(1, Math.floor(size.width * viewport.dpr * 0.5))
  const introHeight = Math.max(1, Math.floor(size.height * viewport.dpr * 0.5))
  const introRenderTarget = useFBO(introWidth, introHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })

  useEffect(() => () => {
    bloom.dispose()
    brightnessContrast.dispose()
    hueSaturation.dispose()
  }, [bloom, brightnessContrast, hueSaturation])

  useEffect(() => {
    introRenderTarget.texture.colorSpace = THREE.SRGBColorSpace
    introRenderTarget.texture.generateMipmaps = false
  }, [introRenderTarget])

  useEffect(() => {
    introCaptureCamera.aspect = introWidth / introHeight
    introCaptureCamera.updateProjectionMatrix()
  }, [introCaptureCamera, introHeight, introWidth])

  useLayoutEffect(() => {
    introCaptureCameraRef.current = introCaptureCamera
    return () => {
      if (introCaptureCameraRef.current === introCaptureCamera) {
        introCaptureCameraRef.current = null
      }
    }
  }, [introCaptureCamera, introCaptureCameraRef])

  useFrame((state) => {
    if (!isTransitioning) return

    const previousTarget = state.gl.getRenderTarget()
    const previousAutoClear = state.gl.autoClear
    const previousXrEnabled = state.gl.xr.enabled
    const previousIsPresenting = state.gl.xr.isPresenting

    state.gl.autoClear = true
    state.gl.xr.enabled = false
    state.gl.xr.isPresenting = false
    state.gl.setRenderTarget(introRenderTarget)
    state.gl.clear()
    state.gl.render(introScene, introCaptureCamera)
    state.gl.setRenderTarget(previousTarget)
    state.gl.autoClear = previousAutoClear
    state.gl.xr.enabled = previousXrEnabled
    state.gl.xr.isPresenting = previousIsPresenting
  }, 0)

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
    <>
      {isTransitioning && createPortal(
        <IntroScene disabled buttonLabel="PRESS START" />,
        introScene,
      )}
      <EffectComposer multisampling={0}>
        <primitive object={bloom} />
        {isTransitioning && (
          <TransitionEffect
            introTexture={introRenderTarget.texture}
            progressRef={transitionProgressRef}
            settings={transitionSettings}
          />
        )}
        <primitive object={brightnessContrast} />
        <primitive object={hueSaturation} />
      </EffectComposer>
    </>
  )
}
