/**
 * Renders the intro title screen on a curved mesh in front of the TV: canvas → texture → CRT shader, pointer + keyboard start.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DEFAULT_TV_CRT, SCREEN_CYAN } from './constants'
import { CRT_FRAGMENT_SHADER, CRT_VERTEX_SHADER } from './crtShaders'
import { createCurvedScreenGeometry } from './curvedScreenGeometry'
import { drawTvScreen, getTvScreenActionAtPoint } from './tvScreenCanvas'

export function TvScreen({
  position,
  size,
  rotation,
  screenOffset = [0, 0, 0],
  screenRotationOffset = [0, 0, 0],
  sizeScale = [1, 1],
  curveAmount = 0.045,
  showGlow = false,
  glowScale = [1.06, 1.08],
  glowOpacity = 0.05,
  glowOffsetZ = -0.01,
  crt = DEFAULT_TV_CRT,
  onStart,
  onDismiss,
  disabled = false,
  buttonLabel = 'PRESS START',
  screenMode = 'title',
  summary = null,
  showDismissButton = false,
}) {
  const [hoveredAction, setHoveredAction] = useState(null)
  const screenWidth = size[0] * sizeScale[0]
  const screenHeight = size[1] * sizeScale[1]
  const glowWidth = screenWidth * glowScale[0]
  const glowHeight = screenHeight * glowScale[1]
  const curveDepth = Math.max(screenWidth, screenHeight) * curveAmount
  const screenGeometry = useMemo(
    () => createCurvedScreenGeometry(screenWidth, screenHeight, curveDepth),
    [curveDepth, screenHeight, screenWidth]
  )
  const glowGeometry = useMemo(
    () => createCurvedScreenGeometry(glowWidth, glowHeight, curveDepth * 0.9),
    [curveDepth, glowHeight, glowWidth]
  )

  const gpu = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const texture = new THREE.CanvasTexture(canvas)
    texture.flipY = true
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    const c0 = DEFAULT_TV_CRT
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uWarp: { value: c0.warp },
        uAberration: { value: c0.aberration },
        uEdgeAberration: { value: c0.edgeAberration },
        uHoverBoost: { value: c0.hoverBoost },
        uScanlineIntensity: { value: c0.scanlineIntensity },
        uScanlineDensity: { value: c0.scanlineDensity },
        uGrilleIntensity: { value: c0.grilleIntensity },
        uGrilleDensity: { value: c0.grilleDensity },
        uRollIntensity: { value: c0.rollIntensity },
        uRollSpeed: { value: c0.rollSpeed },
        uNoiseIntensity: { value: c0.noiseIntensity },
        uVignetteStrength: { value: c0.vignetteStrength },
        uVignetteStart: { value: c0.vignetteStart },
        uBrightness: { value: c0.brightness },
        uBlackLevel: { value: c0.blackLevel },
      },
      vertexShader: CRT_VERTEX_SHADER,
      fragmentShader: CRT_FRAGMENT_SHADER,
      toneMapped: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
    return { canvas, texture, material }
  }, [])

  useCursor(Boolean(hoveredAction) && !disabled)

  useEffect(() => {
    if (disabled) setHoveredAction(null)
  }, [disabled])

  useEffect(() => () => {
    screenGeometry.dispose()
    glowGeometry.dispose()
  }, [glowGeometry, screenGeometry])

  useEffect(() => () => {
    if (!gpu) return
    gpu.texture.dispose()
    gpu.material.dispose()
  }, [gpu])

  useEffect(() => {
    if (disabled) return undefined
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (showDismissButton && (event.key === 'x' || event.key === 'X')) {
        event.preventDefault()
        onDismiss?.()
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onStart?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, onDismiss, onStart, showDismissButton])

  const resolveActionFromEvent = (event) => {
    if (!event.uv || !gpu) return null
    return getTvScreenActionAtPoint(
      event.uv.x * gpu.canvas.width,
      (1 - event.uv.y) * gpu.canvas.height,
      gpu.canvas.width,
      gpu.canvas.height,
      {
        screenMode,
        disabled,
        showDismissButton,
      }
    )
  }

  const crtRef = useRef(crt)
  crtRef.current = crt
  const powerOnRef = useRef(0)
  const prevScreenModeRef = useRef(screenMode)
  const summaryElapsedRef = useRef(0)

  useFrame((state, delta) => {
    // Animate CRT power-on when returning to summary screen
    if (screenMode === 'summary' && prevScreenModeRef.current !== 'summary') {
      powerOnRef.current = 0
      summaryElapsedRef.current = 0
    }
    prevScreenModeRef.current = screenMode
    if (screenMode === 'summary') {
      if (powerOnRef.current < 1) {
        powerOnRef.current = Math.min(1, powerOnRef.current + delta / Math.max(crtRef.current.powerOnDuration ?? 0.4, 0.001))
      }
      summaryElapsedRef.current += delta
    }
    if (!gpu) return
    const ctx = gpu.canvas.getContext('2d')
    if (!ctx) return
    drawTvScreen(ctx, gpu.canvas, state.clock.elapsedTime, {
      hovered: hoveredAction === 'start',
      disabled,
      buttonLabel,
      screenMode,
      summary,
      showDismissButton,
      dismissHovered: hoveredAction === 'dismiss',
      summaryElapsed: summaryElapsedRef.current,
    })
    // Three.js marks canvas textures dirty for GPU upload
    // eslint-disable-next-line react-hooks/immutability -- texture.needsUpdate is required API
    gpu.texture.needsUpdate = true
    const uniforms = gpu.material.uniforms
    const c = crtRef.current
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uHover.value = hoveredAction ? 1 : 0
    uniforms.uWarp.value = c.warp
    uniforms.uAberration.value = c.aberration
    uniforms.uEdgeAberration.value = c.edgeAberration
    uniforms.uHoverBoost.value = c.hoverBoost
    // Power-on effect: ramp brightness, boost scanlines and noise during warm-up
    const pwr = powerOnRef.current
    const powerEase = pwr
    const isPoweringOn = screenMode === 'summary' && pwr < 1
    uniforms.uScanlineIntensity.value = c.scanlineIntensity + (isPoweringOn ? (1 - powerEase) * 0.4 : 0)
    uniforms.uScanlineDensity.value = c.scanlineDensity
    uniforms.uGrilleIntensity.value = c.grilleIntensity
    uniforms.uGrilleDensity.value = c.grilleDensity
    uniforms.uRollIntensity.value = c.rollIntensity
    uniforms.uRollSpeed.value = c.rollSpeed
    uniforms.uNoiseIntensity.value = c.noiseIntensity + (isPoweringOn ? (1 - powerEase) * 0.3 : 0)
    uniforms.uVignetteStrength.value = c.vignetteStrength
    uniforms.uVignetteStart.value = c.vignetteStart
    uniforms.uBrightness.value = c.brightness * (screenMode === 'summary' ? powerEase : 1)
    uniforms.uBlackLevel.value = c.blackLevel
  })

  if (!gpu) return null

  return (
    <group position={position} rotation={rotation}>
      <group position={screenOffset} rotation={screenRotationOffset}>
        {showGlow && (
          <mesh geometry={glowGeometry} position={[0, 0, glowOffsetZ]} renderOrder={3}>
            <meshBasicMaterial
              color={SCREEN_CYAN}
              toneMapped={false}
              transparent
              opacity={glowOpacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              depthTest={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
          <mesh
          geometry={screenGeometry}
          renderOrder={4}
          onPointerEnter={(event) => {
            setHoveredAction(resolveActionFromEvent(event))
          }}
          onPointerMove={(event) => {
            setHoveredAction(resolveActionFromEvent(event))
          }}
          onPointerLeave={() => setHoveredAction(null)}
          onPointerDown={(event) => {
            event.stopPropagation()
            const action = resolveActionFromEvent(event)
            if (disabled || !action) return
            if (action === 'dismiss') {
              onDismiss?.()
              return
            }
            onStart?.()
          }}
        >
          <primitive object={gpu.material} attach="material" />
        </mesh>
      </group>
    </group>
  )
}
