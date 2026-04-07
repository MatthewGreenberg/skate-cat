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
import { isSafari } from '../../store'

function getScreenTextureSize(quality) {
  if (isSafari) return 512
  if (quality === 'high') return 1024
  if (quality === 'quiet') return 512
  return 768
}

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
  quality = 'auto',
  onStart,
  onDismiss,
  onAction,
  disabled = false,
  buttonLabel = 'PRESS START',
  instructionLabel = 'SPACE / ENTER TO SHRED',
  screenMode = 'title',
  summary = null,
  showDismissButton = false,
  bootVisualMix = 1,
  bootStatusLabel = 'SYNCING STAGE',
  bootProgress = 0,
  bootReady = false,
  highScore = 0,
  leaderboard = [],
  initialsEntry = null,
}) {
  const [hoveredAction, setHoveredAction] = useState(null)
  const screenWidth = size[0] * sizeScale[0]
  const screenHeight = size[1] * sizeScale[1]
  const glowWidth = screenWidth * glowScale[0]
  const glowHeight = screenHeight * glowScale[1]
  const curveDepth = Math.max(screenWidth, screenHeight) * curveAmount
  const screenTextureSize = getScreenTextureSize(quality)
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
    canvas.width = screenTextureSize
    canvas.height = screenTextureSize
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const texture = new THREE.CanvasTexture(canvas)
    texture.flipY = true
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
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
    return { canvas, ctx, texture, material }
  }, [screenTextureSize])

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

      if (screenMode === 'leaderboard') {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape' || event.key === 'Backspace') {
          event.preventDefault()
          onAction?.('back')
        }
        return
      }

      if (screenMode === 'initials') {
        event.preventDefault()
        if (event.key === 'ArrowUp') { onAction?.('letterUp'); return }
        if (event.key === 'ArrowDown') { onAction?.('letterDown'); return }
        if (event.key === 'ArrowLeft') { onAction?.('cursorLeft'); return }
        if (event.key === 'ArrowRight') { onAction?.('cursorRight'); return }
        if (event.key === 'Enter') { onAction?.('confirmInitials'); return }
        if (/^[a-zA-Z]$/.test(event.key)) {
          onAction?.('letterDirect', event.key.toUpperCase())
        }
        return
      }

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
  }, [disabled, onAction, onDismiss, onStart, screenMode, showDismissButton])

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
  const bootElapsedRef = useRef(0)
  const leaderboardElapsedRef = useRef(0)
  const initialsElapsedRef = useRef(0)
  const prevDrawInputsRef = useRef(null)
  // Channel-flip transition: 0 = idle, >0 = animating (counts down from FLIP_DURATION)
  const channelFlipRef = useRef(0)
  const FLIP_DURATION = 0.35

  useFrame((state, delta) => {
    const modeChanged = prevScreenModeRef.current !== screenMode
    if (modeChanged) {
      // Only trigger channel-flip for leaderboard/initials transitions (not boot/summary which have their own power-on)
      const isFlipTransition =
        (prevScreenModeRef.current === 'title' || prevScreenModeRef.current === 'leaderboard' || prevScreenModeRef.current === 'initials') &&
        (screenMode === 'title' || screenMode === 'leaderboard' || screenMode === 'initials')
      if (isFlipTransition) {
        channelFlipRef.current = FLIP_DURATION
      } else {
        powerOnRef.current = 0
      }
      summaryElapsedRef.current = 0
      bootElapsedRef.current = 0
      leaderboardElapsedRef.current = 0
      initialsElapsedRef.current = 0
    }
    prevScreenModeRef.current = screenMode

    // Advance channel-flip timer
    if (channelFlipRef.current > 0) {
      channelFlipRef.current = Math.max(0, channelFlipRef.current - delta)
    }

    if (screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials') {
      if (powerOnRef.current < 1) {
        powerOnRef.current = Math.min(1, powerOnRef.current + delta / Math.max(crtRef.current.powerOnDuration ?? 0.4, 0.001))
      }
    }
    if (screenMode === 'summary') {
      summaryElapsedRef.current += delta
    }
    if (screenMode === 'boot') {
      bootElapsedRef.current += delta
    }
    if (screenMode === 'leaderboard') {
      leaderboardElapsedRef.current += delta
    }
    if (screenMode === 'initials') {
      initialsElapsedRef.current += delta
    }
    if (!gpu) return

    // Build a lightweight fingerprint of inputs that affect canvas output
    const isAnimatingMode = screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials'
    const drawInputs = `${screenMode}|${hoveredAction}|${disabled}|${bootReady}|${Math.round(bootProgress)}|${highScore}`

    // Animated modes need continuous redraws; static modes only redraw on input change
    const needsRedraw = isAnimatingMode
      || channelFlipRef.current > 0
      || drawInputs !== prevDrawInputsRef.current

    if (needsRedraw) {
      prevDrawInputsRef.current = drawInputs
      drawTvScreen(gpu.ctx, gpu.canvas, state.clock.elapsedTime, {
        hovered: hoveredAction === 'start' || hoveredAction === 'back' || hoveredAction === 'confirmInitials',
        disabled,
        buttonLabel,
        instructionLabel,
        screenMode,
        summary,
        showDismissButton,
        dismissHovered: hoveredAction === 'dismiss',
        summaryElapsed: summaryElapsedRef.current,
        bootElapsed: bootElapsedRef.current,
        bootStatusLabel,
        bootProgress,
        bootReady,
        highScore,
        highScoresHovered: hoveredAction === 'highscores',
        leaderboard,
        leaderboardElapsed: leaderboardElapsedRef.current,
        initials: initialsEntry?.initials ?? null,
        cursorPos: initialsEntry?.cursorPos ?? 0,
        initialsScore: initialsEntry?.score ?? 0,
        initialsRank: initialsEntry?.rank ?? 'F',
        initialsElapsed: initialsElapsedRef.current,
      })
      // Three.js marks canvas textures dirty for GPU upload
      // eslint-disable-next-line react-hooks/immutability -- texture.needsUpdate is required API
      gpu.texture.needsUpdate = true
    }
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
    const isPoweringOn = (screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials') && pwr < 1
    const bootBrightnessMix = screenMode === 'boot'
      ? THREE.MathUtils.lerp(0.38, 1, bootVisualMix)
      : 1
    // Channel-flip effect: smooth brightness dip + noise spike on a bell curve
    const flipT = channelFlipRef.current / FLIP_DURATION // 1 at start → 0 at end
    const flipIntensity = Math.sin(flipT * Math.PI) // bell curve: 0 → 1 → 0
    const flipNoise = flipIntensity * 0.7
    const flipDim = 1 - flipIntensity * 0.85
    const flipAberration = flipIntensity * 0.025
    uniforms.uScanlineIntensity.value = c.scanlineIntensity + (isPoweringOn ? (1 - powerEase) * 0.4 : 0) + flipIntensity * 0.5
    uniforms.uScanlineDensity.value = c.scanlineDensity
    uniforms.uGrilleIntensity.value = c.grilleIntensity
    uniforms.uGrilleDensity.value = c.grilleDensity
    uniforms.uRollIntensity.value = c.rollIntensity + flipIntensity * 0.8
    uniforms.uRollSpeed.value = c.rollSpeed
    uniforms.uNoiseIntensity.value = c.noiseIntensity + (isPoweringOn ? (1 - powerEase) * 0.3 : 0) + flipNoise
    uniforms.uVignetteStrength.value = c.vignetteStrength
    uniforms.uVignetteStart.value = c.vignetteStart
    uniforms.uBrightness.value = c.brightness * (screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials' ? powerEase : 1) * bootBrightnessMix * flipDim
    uniforms.uBlackLevel.value = c.blackLevel
    uniforms.uAberration.value = c.aberration + flipAberration
  })

  const handlePointerDown = (event) => {
    event.stopPropagation()
    const action = resolveActionFromEvent(event)
    if (disabled || !action) return
    if (action === 'dismiss') {
      onDismiss?.()
      return
    }
    // Route new actions through onAction
    if (action === 'highscores' || action === 'back' || action === 'confirmInitials') {
      onAction?.(action)
      return
    }
    // Handle slot clicks for initials (slotUp_0, slotDown_1, etc.)
    if (action.startsWith('slotUp_') || action.startsWith('slotDown_')) {
      const slotIndex = parseInt(action.split('_')[1], 10)
      onAction?.('slotSelect', slotIndex)
      onAction?.(action.startsWith('slotUp_') ? 'letterUp' : 'letterDown')
      return
    }
    onStart?.()
  }

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
          onPointerDown={handlePointerDown}
        >
          <primitive object={gpu.material} attach="material" />
        </mesh>
      </group>
    </group>
  )
}
