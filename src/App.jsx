import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useProgress } from '@react-three/drei'
import Ground from './components/Ground'
import SkateCat from './components/SkateCat'
import SpeedLines from './components/SpeedLines'
import Obstacles from './components/Obstacles'
import CameraRig from './components/CameraRig'
import GameOverScreen from './components/GameOverScreen'
import KickflipSparks from './components/KickflipSparks'
import DustTrail from './components/DustTrail'
import AmbientParticles from './components/AmbientParticles'
import Background from './components/Background'
import Sky from './components/Sky'
import IntroScene from './components/IntroScene'
import GameHud from './components/GameHud'
import TransitionEffect from './components/TransitionEffect'
import { EffectComposer } from '@react-three/postprocessing'
import { BloomEffect, BrightnessContrastEffect, HueSaturationEffect, Pass, CopyMaterial } from 'postprocessing'
import { button, useControls } from 'leva'
import { createBufferedMusicTransport } from './audioTransport'
import {
  gameState,
  DAY_NIGHT_CYCLE_SPEED,
  createIdleGrindState,
  createIdleGrindSparkState,
  getNightFactor,
  getNightContrastOffset,
  isObstacleSpacingDebug,
  isTimingDebug,
  getSunsetFactor,
  getSunriseFactor,
  lerpDayNightColor,
} from './store'
import {
  AUDIO_VISUAL_SYNC_OFFSET_SECONDS,
  BEAT_INTERVAL,
  GOOD_EARLY_WINDOW_SECONDS,
  GOOD_LATE_WINDOW_SECONDS,
  getPerceivedMusicTime,
  getTimingGradeFromOffset,
  INPUT_TIMING_COMPENSATION_SECONDS,
  PERFECT_EARLY_WINDOW_SECONDS,
  PERFECT_LATE_WINDOW_SECONDS,
  TRACK_BEAT_PHASE_OFFSET_SECONDS,
} from './rhythm'

const NIGHT_BLOOM_INTENSITY = 4.3
const POST_CONTROL_LIMITS = {
  bloomIntensity: { min: 0, max: 10, step: 0.1 },
  bloomThreshold: { min: 0, max: 1, step: 0.05 },
  bloomSmoothing: { min: 0, max: 1, step: 0.05 },
  brightness: { min: -0.3, max: 0.3, step: 0.01 },
  contrast: { min: -0.5, max: 0.5, step: 0.01 },
  hue: { min: -Math.PI, max: Math.PI, step: 0.01 },
  saturation: { min: -1, max: 1, step: 0.01 },
}
const DEFAULT_GAME_POST_SETTINGS = {
  bloomIntensity: 2.1,
  bloomThreshold: 0.35,
  bloomSmoothing: 0.1,
  brightness: 0.0,
  contrast: 0.1,
  hue: 0,
  saturation: 0.15,
}
const DEFAULT_INTRO_POST_SETTINGS = {
  bloomIntensity: 0.5,
  bloomThreshold: 0,
  bloomSmoothing: 0.15,
  brightness: 0.0,
  contrast: 0,
  hue: 0,
  saturation: 0,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createPostProcessingControls(defaults) {
  return {
    bloomIntensity: { value: defaults.bloomIntensity, ...POST_CONTROL_LIMITS.bloomIntensity },
    bloomThreshold: { value: defaults.bloomThreshold, ...POST_CONTROL_LIMITS.bloomThreshold },
    bloomSmoothing: { value: defaults.bloomSmoothing, ...POST_CONTROL_LIMITS.bloomSmoothing },
    brightness: { value: defaults.brightness, ...POST_CONTROL_LIMITS.brightness },
    contrast: { value: defaults.contrast, ...POST_CONTROL_LIMITS.contrast },
    hue: { value: defaults.hue, ...POST_CONTROL_LIMITS.hue },
    saturation: { value: defaults.saturation, ...POST_CONTROL_LIMITS.saturation },
  }
}

function interpolatePostSettings(from, to, alpha) {
  return {
    bloomIntensity: THREE.MathUtils.lerp(from.bloomIntensity, to.bloomIntensity, alpha),
    bloomThreshold: THREE.MathUtils.lerp(from.bloomThreshold, to.bloomThreshold, alpha),
    bloomSmoothing: THREE.MathUtils.lerp(from.bloomSmoothing, to.bloomSmoothing, alpha),
    brightness: THREE.MathUtils.lerp(from.brightness, to.brightness, alpha),
    contrast: THREE.MathUtils.lerp(from.contrast, to.contrast, alpha),
    hue: THREE.MathUtils.lerp(from.hue, to.hue, alpha),
    saturation: THREE.MathUtils.lerp(from.saturation, to.saturation, alpha),
  }
}

const _snapshotSize = new THREE.Vector2()

class SnapshotCapturePass extends Pass {
  constructor() {
    super('SnapshotCapturePass')
    this.needsSwap = false
    this.fullscreenMaterial = new CopyMaterial()
    this.shouldCaptureRef = null
    this.snapshotTextureRef = null
    this.onCaptured = null
    this.snapshotRenderTarget = null
  }

  ensureRenderTarget(renderer) {
    renderer.getDrawingBufferSize(_snapshotSize)
    const width = Math.max(1, Math.floor(_snapshotSize.x))
    const height = Math.max(1, Math.floor(_snapshotSize.y))

    if (this.snapshotRenderTarget && this.snapshotRenderTarget.width === width && this.snapshotRenderTarget.height === height) {
      return this.snapshotRenderTarget
    }

    this.snapshotRenderTarget?.dispose()
    this.snapshotRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    this.snapshotRenderTarget.texture.colorSpace = THREE.SRGBColorSpace
    this.snapshotRenderTarget.texture.generateMipmaps = false

    return this.snapshotRenderTarget
  }

  render(renderer, inputBuffer, outputBuffer) {
    this.fullscreenMaterial.inputBuffer = inputBuffer.texture

    if (this.shouldCaptureRef?.current) {
      const renderTarget = this.ensureRenderTarget(renderer)
      renderer.setRenderTarget(renderTarget)
      renderer.render(this.scene, this.camera)
      this.snapshotTextureRef.current = renderTarget.texture
      this.shouldCaptureRef.current = false
      this.onCaptured?.()
    }

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  dispose() {
    if (this.snapshotTextureRef) {
      this.snapshotTextureRef.current = null
    }
    super.dispose()
  }
}

function SnapshotCapture({ shouldCaptureRef, snapshotTextureRef, onCaptured }) {
  const pass = useMemo(() => new SnapshotCapturePass(), [])

  useEffect(() => {
    pass.shouldCaptureRef = shouldCaptureRef
    pass.snapshotTextureRef = snapshotTextureRef
    pass.onCaptured = onCaptured

    return () => {
      pass.shouldCaptureRef = null
      pass.snapshotTextureRef = null
      pass.onCaptured = null
      snapshotTextureRef.current = null
    }
  }, [onCaptured, pass, shouldCaptureRef, snapshotTextureRef])

  return <primitive object={pass} />
}


function DayNightController({ isRunning }) {
  const dirLightRef = useRef()
  const ambientRef = useRef()
  const hemiRef = useRef()
  const { scene } = useThree()
  const { timeOfDay, paused } = useControls('Day/Night', {
    timeOfDay: { value: 0, min: 0, max: 1, step: 0.01 },
    paused: false,
  })

  useFrame((_, delta) => {
    // Cycle timeOfDay only while the run is active (or use leva override when paused)
    if (paused) {
      gameState.timeOfDay.current = timeOfDay
    } else if (isRunning) {
      gameState.timeOfDay.current = (gameState.timeOfDay.current + delta * DAY_NIGHT_CYCLE_SPEED) % 1
    }

    const nightFactor = getNightFactor(gameState.timeOfDay.current)
    const sunriseFactor = getSunriseFactor(gameState.timeOfDay.current)
    const sunsetFactor = getSunsetFactor(gameState.timeOfDay.current)
    const warmFactor = sunriseFactor > 0 ? sunriseFactor : sunsetFactor

    // Directional light — warm tint during sunrise/sunset
    if (dirLightRef.current) {
      lerpDayNightColor(dirLightRef.current.color, '#ffe6bf', '#4466aa', nightFactor, '#ffaa77', warmFactor)
      dirLightRef.current.intensity = THREE.MathUtils.lerp(1.65, 0.3, nightFactor)
    }

    // Ambient light
    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.22, 0.08, nightFactor)
    }

    // Hemisphere light
    if (hemiRef.current) {
      lerpDayNightColor(hemiRef.current.color, '#b7dbff', '#1a2244', nightFactor)
      lerpDayNightColor(hemiRef.current.groundColor, '#78a24f', '#0a1a0a', nightFactor)
      hemiRef.current.intensity = THREE.MathUtils.lerp(0.55, 0.15, nightFactor)
    }

    // Fog
    if (scene.fog) {
      lerpDayNightColor(scene.fog.color, '#c4d4b8', '#1a2233', nightFactor, '#9a7a60', warmFactor)
    }

    // Night contrast offset
    gameState.nightContrast.current = getNightContrastOffset(gameState.timeOfDay.current)
  })

  return (
    <>
      <ambientLight ref={ambientRef} color="#f2f7ff" intensity={0.22} />
      <directionalLight
        ref={dirLightRef}
        position={[5, 10, 3]}
        color="#ffe6bf"
        intensity={1.65}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.1}
        shadow-camera-far={50}
        shadow-bias={-0.002}
        shadow-normalBias={0.02}
      />
      <hemisphereLight ref={hemiRef} args={['#b7dbff', '#78a24f', 0.55]} />
    </>
  )
}

function PostEffects({
  introSettings,
  gameSettings,
  snapshotTexture,
  transitionSettings,
  transitionProgressRef,
  isTransitioning,
  hasStartedGame,
  shouldCaptureRef,
  snapshotTextureRef,
  onCaptured,
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
      : hasStartedGame ? 1 : 0
    const activeSettings = interpolatePostSettings(introSettings, gameSettings, transitionMix)

    brightnessContrast.brightness = activeSettings.brightness
    brightnessContrast.contrast = activeSettings.contrast
    hueSaturation.hue = activeSettings.hue
    hueSaturation.saturation = activeSettings.saturation
    bloom.luminanceMaterial.threshold = activeSettings.bloomThreshold
    bloom.luminanceMaterial.smoothing = activeSettings.bloomSmoothing

    // Suppress bloom during early transition so the snapshot renders cleanly
    if (isTransitioning && snapshotTexture && transitionProgressRef.current < 0.15) {
      bloom.intensity = 0
      return
    }

    const nightFactor = hasStartedGame ? getNightFactor(gameState.timeOfDay.current) : 0
    bloom.intensity = THREE.MathUtils.lerp(activeSettings.bloomIntensity, NIGHT_BLOOM_INTENSITY, nightFactor)
    bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(activeSettings.bloomThreshold, 0, nightFactor)
  })

  return (
    <EffectComposer multisampling={0}>
      <primitive object={bloom} />
      {isTransitioning && snapshotTexture && (
        <TransitionEffect
          snapshotTexture={snapshotTexture}
          progressRef={transitionProgressRef}
          settings={transitionSettings}
        />
      )}
      <primitive object={brightnessContrast} />
      <primitive object={hueSaturation} />
      <SnapshotCapture
        shouldCaptureRef={shouldCaptureRef}
        snapshotTextureRef={snapshotTextureRef}
        onCaptured={onCaptured}
      />
    </EffectComposer>
  )
}

function TransitionAnimator({ progressRef, isTransitioning, duration, onComplete }) {
  useFrame((_, delta) => {
    if (!isTransitioning) return
    progressRef.current = Math.min(progressRef.current + delta / Math.max(duration, 0.001), 1)
    if (progressRef.current >= 1) {
      onComplete()
    }
  })
  return null
}

const COUNTDOWN_STEPS = ['1', '2', '3', 'GO!']

function TimingDebugHud({ musicRef, visible, playbackRate, manualOffsetMs, obstacleHitDelayMs }) {
  const [metrics, setMetrics] = useState({
    currentTime: 0,
    nextTargetTime: null,
    offsetMs: 0,
    upcomingCount: 0,
  })

  useEffect(() => {
    if (!visible || !isTimingDebug) return

    let animationFrameId = 0
    const tick = () => {
      const currentTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const targets = gameState.obstacleTargets.current || []
      const nextTarget = targets.find((target) => target.targetTime >= currentTime - 0.02) || null
      setMetrics((prev) => {
        const nextTargetTime = nextTarget?.targetTime ?? null
        const nextOffsetMs = nextTarget ? Math.round((currentTime - nextTarget.targetTime) * 1000) : 0
        const upcomingCount = targets.filter((target) => target.targetTime >= currentTime - 0.02).length
        if (
          prev.currentTime === currentTime &&
          prev.nextTargetTime === nextTargetTime &&
          prev.offsetMs === nextOffsetMs &&
          prev.upcomingCount === upcomingCount
        ) {
          return prev
        }
        return {
          currentTime,
          nextTargetTime,
          offsetMs: nextOffsetMs,
          upcomingCount,
        }
      })
      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [musicRef, visible])

  if (!visible || !isTimingDebug) return null

  const formatTime = (value) => (typeof value === 'number' ? value.toFixed(3) : '---')
  const offsetLabel = `${metrics.offsetMs > 0 ? '+' : ''}${metrics.offsetMs}ms`
  const judgedOffsetMs = metrics.offsetMs + Math.round(INPUT_TIMING_COMPENSATION_SECONDS * 1000)
  const judgedOffsetLabel = `${judgedOffsetMs > 0 ? '+' : ''}${judgedOffsetMs}ms`
  const previewGrade = getTimingGradeFromOffset(judgedOffsetMs / 1000)
  const previewGradeColor =
    previewGrade === 'Perfect' ? '#9fffb2' : previewGrade === 'Good' ? '#ffe08a' : '#ff9c9c'
  const perfectWindowStartMs = Math.round((-PERFECT_EARLY_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const perfectWindowEndMs = Math.round((PERFECT_LATE_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const goodWindowStartMs = Math.round((-GOOD_EARLY_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const goodWindowEndMs = Math.round((GOOD_LATE_WINDOW_SECONDS - INPUT_TIMING_COMPENSATION_SECONDS) * 1000)
  const windowMinMs = goodWindowStartMs - 50
  const windowMaxMs = Math.max(goodWindowEndMs + 50, 50)
  const windowSpanMs = Math.max(1, windowMaxMs - windowMinMs)
  const toPercent = (value) => `${clamp(((value - windowMinMs) / windowSpanMs) * 100, 0, 100)}%`
  const goodWindowLeft = toPercent(goodWindowStartMs)
  const goodWindowWidth = `${clamp(((goodWindowEndMs - goodWindowStartMs) / windowSpanMs) * 100, 0, 100)}%`
  const perfectWindowLeft = toPercent(perfectWindowStartMs)
  const perfectWindowWidth = `${clamp(((perfectWindowEndMs - perfectWindowStartMs) / windowSpanMs) * 100, 0, 100)}%`
  const markerLeft = toPercent(metrics.offsetMs)

  return (
    <div
      style={{
        position: 'fixed',
        right: '1rem',
        top: '1rem',
        zIndex: 240,
        width: 'min(320px, calc(100vw - 2rem))',
        padding: '0.8rem 0.95rem',
        borderRadius: '18px',
        border: '1px solid rgba(86, 184, 255, 0.35)',
        background: 'rgba(6, 12, 20, 0.78)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        color: '#eaf7ff',
        fontFamily: 'Nunito, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
        Timing Debug
      </div>
      <div style={{ marginTop: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.8rem', fontSize: '0.82rem' }}>
        <span style={{ opacity: 0.68 }}>music</span>
        <span>{formatTime(metrics.currentTime)}s</span>
        <span style={{ opacity: 0.68 }}>next target</span>
        <span>{formatTime(metrics.nextTargetTime)}s</span>
        <span style={{ opacity: 0.68 }}>visual offset</span>
        <span>{offsetLabel}</span>
        <span style={{ opacity: 0.68 }}>press preview</span>
        <span style={{ color: previewGradeColor, fontWeight: 900 }}>{previewGrade} ({judgedOffsetLabel})</span>
        <span style={{ opacity: 0.68 }}>upcoming</span>
        <span>{metrics.upcomingCount}</span>
        <span style={{ opacity: 0.68 }}>track phase</span>
        <span>{Math.round(TRACK_BEAT_PHASE_OFFSET_SECONDS * 1000)}ms</span>
        <span style={{ opacity: 0.68 }}>manual offset</span>
        <span>{manualOffsetMs}ms</span>
        <span style={{ opacity: 0.68 }}>obstacle delay</span>
        <span>{obstacleHitDelayMs}ms</span>
        <span style={{ opacity: 0.68 }}>total offset</span>
        <span>{Math.round((gameState.timingOffsetSeconds.current || 0) * 1000)}ms</span>
        <span style={{ opacity: 0.68 }}>playback</span>
        <span>{playbackRate}x</span>
      </div>
      <div style={{ marginTop: '0.7rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', opacity: 0.8 }}>
          <span>Press Window</span>
          <span style={{ color: previewGradeColor, fontWeight: 900 }}>{previewGrade}</span>
        </div>
        <div
          style={{
            position: 'relative',
            height: '18px',
            marginTop: '0.35rem',
            borderRadius: '999px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'linear-gradient(180deg, rgba(15, 22, 34, 0.95), rgba(7, 11, 18, 0.95))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: goodWindowLeft,
              width: goodWindowWidth,
              top: 0,
              bottom: 0,
              background: 'rgba(255, 224, 138, 0.38)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: perfectWindowLeft,
              width: perfectWindowWidth,
              top: 0,
              bottom: 0,
              background: 'rgba(159, 255, 178, 0.75)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: markerLeft,
              top: 0,
              bottom: 0,
              width: '2px',
              background: previewGradeColor,
              boxShadow: `0 0 8px ${previewGradeColor}`,
              transform: 'translateX(-1px)',
            }}
          />
        </div>
        <div style={{ marginTop: '0.28rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem 0.8rem', fontSize: '0.72rem', opacity: 0.78 }}>
          <span>perfect press zone</span>
          <span>{perfectWindowStartMs}ms to {perfectWindowEndMs}ms</span>
          <span>good press zone</span>
          <span>{goodWindowStartMs}ms to {goodWindowEndMs}ms</span>
        </div>
      </div>
      <div style={{ marginTop: '0.6rem', fontSize: '0.72rem', lineHeight: 1.45, opacity: 0.7 }}>
        Marker is your live visual offset. Green band is where a press right now scores `Perfect` after the jump lead is applied.
      </div>
    </div>
  )
}

function ObstacleSpacingDebugHud({ musicRef, visible }) {
  const [snapshot, setSnapshot] = useState({
    currentBeat: 0,
    speed: 0,
    entries: [],
  })

  useEffect(() => {
    if (!visible || !isObstacleSpacingDebug) return

    let animationFrameId = 0
    const tick = () => {
      const currentTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      const currentBeat = currentTime / BEAT_INTERVAL
      const entries = (gameState.obstacleDebug.current || [])
        .filter((entry) => entry.windowEndBeat >= currentBeat - 0.75)
        .slice(0, 12)

      setSnapshot((prev) => {
        const nextSpeed = gameState.speed.current || 0
        const hasSameEntries =
          prev.entries.length === entries.length &&
          prev.entries.every((entry, index) => {
            const nextEntry = entries[index]
            return (
              nextEntry &&
              entry.id === nextEntry.id &&
              entry.lane === nextEntry.lane &&
              entry.requestedLane === nextEntry.requestedLane &&
              entry.z === nextEntry.z &&
              entry.windowStartBeat === nextEntry.windowStartBeat &&
              entry.windowEndBeat === nextEntry.windowEndBeat &&
              entry.conflicts.join(',') === nextEntry.conflicts.join(',')
            )
          })

        if (
          Math.abs(prev.currentBeat - currentBeat) < 0.02 &&
          Math.abs(prev.speed - nextSpeed) < 0.02 &&
          hasSameEntries
        ) {
          return prev
        }

        return {
          currentBeat,
          speed: nextSpeed,
          entries,
        }
      })

      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [musicRef, visible])

  if (!visible || !isObstacleSpacingDebug) return null

  const activeConflictCount = snapshot.entries.filter((entry) => entry.conflicts.length > 0).length

  return (
    <div
      style={{
        position: 'fixed',
        left: '1rem',
        top: '1rem',
        zIndex: 245,
        width: 'min(420px, calc(100vw - 2rem))',
        maxHeight: 'min(70vh, 720px)',
        overflow: 'auto',
        padding: '0.8rem 0.95rem',
        borderRadius: '18px',
        border: '1px solid rgba(255, 154, 102, 0.35)',
        background: 'rgba(20, 10, 8, 0.82)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.32)',
        backdropFilter: 'blur(10px)',
        color: '#fff4eb',
        fontFamily: 'Nunito, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
        Obstacle Spacing
      </div>
      <div style={{ marginTop: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.8rem', fontSize: '0.82rem' }}>
        <span style={{ opacity: 0.68 }}>current beat</span>
        <span>{snapshot.currentBeat.toFixed(2)}</span>
        <span style={{ opacity: 0.68 }}>speed</span>
        <span>{snapshot.speed.toFixed(2)}</span>
        <span style={{ opacity: 0.68 }}>visible rows</span>
        <span>{snapshot.entries.length}</span>
        <span style={{ opacity: 0.68 }}>rows w/ conflicts</span>
        <span style={{ color: activeConflictCount > 0 ? '#ff9c9c' : '#9fffb2', fontWeight: 900 }}>{activeConflictCount}</span>
      </div>
      <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.35rem' }}>
        {snapshot.entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '0.45rem 0.55rem',
              borderRadius: '12px',
              background: entry.conflicts.length > 0 ? 'rgba(140, 30, 24, 0.55)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${entry.conflicts.length > 0 ? 'rgba(255, 130, 120, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.7rem',
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>
                #{entry.id} {entry.type} {entry.lane}
                {entry.remapped ? ` (${entry.requestedLane}->${entry.lane})` : ''}
              </span>
              <span>z {entry.z.toFixed(2)}</span>
            </div>
            <div style={{ opacity: 0.82 }}>
              beat {entry.beatIndex.toFixed(2)} | window {entry.windowStartBeat.toFixed(2)}-{entry.windowEndBeat.toFixed(2)}
            </div>
            {entry.type === 'rail' && (
              <div style={{ opacity: 0.7 }}>
                railLength {entry.railLength.toFixed(2)}
              </div>
            )}
            <div style={{ color: entry.conflicts.length > 0 ? '#ffb1ac' : '#9fffb2' }}>
              conflicts {entry.conflicts.length > 0 ? entry.conflicts.join(', ') : 'none'}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', lineHeight: 1.45, opacity: 0.7 }}>
        Red rows mean the spacing math thinks a rail/log pair overlaps in the same lane. Screenshot this panel when you see a bad spawn.
      </div>
    </div>
  )
}

export default function App() {
  const trailTarget = useRef()
  const musicRef = useRef(null)
  const jumpSfxRef = useRef(null)
  const jump2SfxRef = useRef(null)
  const dieSfxRef = useRef(null)
  const hasStartedMusicRef = useRef(false)
  const [hasStartedGame, setHasStartedGame] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [timingFeedback, setTimingFeedback] = useState({ label: '', id: 0 })
  const [hasConfirmedMusicStart, setHasConfirmedMusicStart] = useState(false)
  const [isCountdownActive, setIsCountdownActive] = useState(false)
  const [countdownText, setCountdownText] = useState('')
  const [countdownAnimationKey, setCountdownAnimationKey] = useState(0)
  const [volume, setVolume] = useState(0.5)
  // Intro-to-toon transition state
  const [useOriginalMaterials, setUseOriginalMaterials] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [snapshotTexture, setSnapshotTexture] = useState(null)
  const transitionProgressRef = useRef(0)
  const shouldCaptureRef = useRef(false)
  const snapshotTextureRef = useRef(null)
  const pendingStartRef = useRef(null)
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()

  const handleVolumePointerDone = useCallback((event) => {
    event.currentTarget.blur()
  }, [])

  const handleReturnToIntro = useCallback(() => {
    hasStartedMusicRef.current = false
    if (musicRef.current) {
      musicRef.current.pause()
      musicRef.current.currentTime = 0
    }

    gameState.gameOver = false
    gameState.speed.current = 0
    gameState.jumping = false
    gameState.pendingJumpTiming.current = null
    gameState.obstacleTargets.current = []
    gameState.upArrowHeld.current = false
    gameState.activeGrind.current = createIdleGrindState()
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.screenShake.current = 0
    gameState.comboEnergy.current = 1
    gameState.timeOfDay.current = 0
    gameState.runDifficultyProgress.current = 0

    transitionProgressRef.current = 0
    shouldCaptureRef.current = false
    snapshotTextureRef.current = null
    pendingStartRef.current = null

    setHasStartedGame(false)
    setIsGameOver(false)
    setHasConfirmedMusicStart(false)
    setIsCountdownActive(false)
    setCountdownText('')
    setUseOriginalMaterials(true)
    setIsTransitioning(false)
    setSnapshotTexture(null)
    setTimingFeedback({ label: '', id: 0 })
  }, [])

  const introPost = useControls('Intro Post Processing', createPostProcessingControls(DEFAULT_INTRO_POST_SETTINGS))
  const gamePost = useControls('Post Processing', createPostProcessingControls(DEFAULT_GAME_POST_SETTINGS))
  const transitionSettings = useControls('Intro Transition', {
    duration: { value: 0.95, min: 0.3, max: 4.5, step: 0.05, label: 'Duration' },
    revealCurve: { value: 0.75, min: 0.2, max: 2.2, step: 0.01, label: 'Curve' },
    thresholdStart: { value: 0.07, min: -0.3, max: 0.3, step: 0.01, label: 'Start' },
    thresholdEnd: { value: 0.77, min: 0.2, max: 1.2, step: 0.01, label: 'End' },
    bandBefore: { value: 0.06, min: 0.005, max: 0.2, step: 0.005, label: 'Edge In' },
    bandAfter: { value: 0.07, min: 0.005, max: 0.2, step: 0.005, label: 'Edge Out' },
    glowInnerOffset: { value: 0.08, min: 0, max: 0.08, step: 0.005, label: 'Glow In' },
    glowOuterOffset: { value: 0.25, min: 0.01, max: 0.25, step: 0.005, label: 'Glow Out' },
    glowIntensity: { value: 0.65, min: 0, max: 2, step: 0.05, label: 'Glow' },
    glowColor: { value: '#3dd5e8', label: 'Color' },
    noiseScaleA: { value: 8.5, min: 1, max: 24, step: 0.5, label: 'Noise A' },
    noiseScaleB: { value: 8.0, min: 1, max: 32, step: 0.5, label: 'Noise B' },
    noiseAmpA: { value: 0.0, min: 0, max: 0.6, step: 0.01, label: 'Noise Amt A' },
    noiseAmpB: { value: 0.18, min: 0, max: 0.4, step: 0.01, label: 'Noise Amt B' },
    replay: button(() => handleReturnToIntro()),
  })
  const { timingOffsetMs, obstacleHitDelayMs, debugPlaybackRate } = useControls('Timing Debug', {
    timingOffsetMs: { value: 0, min: -300, max: 180, step: 1 },
    obstacleHitDelayMs: { value: 0, min: -180, max: 180, step: 1 },
    debugPlaybackRate: {
      value: 1,
      options: { '1x': 1, '0.75x': 0.75, '0.5x': 0.5, '0.25x': 0.25 },
    },
  })

  useEffect(() => {
    const music = createBufferedMusicTransport('/skate-cat-2.mp3')
    musicRef.current = music
    void music.preload().catch(() => { })

    return () => {
      hasStartedMusicRef.current = false
      if (musicRef.current === music) {
        musicRef.current = null
      }
      music.dispose()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (!event.shiftKey || event.key.toLowerCase() !== 'r') return
      if (!hasStartedGame && !isTransitioning) return
      event.preventDefault()
      handleReturnToIntro()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleReturnToIntro, hasStartedGame, isTransitioning])

  useEffect(() => {
    gameState.onGameOver = () => setIsGameOver(true)
  }, [])

  useEffect(() => {
    gameState.timingOffsetSeconds.current = isTimingDebug
      ? TRACK_BEAT_PHASE_OFFSET_SECONDS + timingOffsetMs / 1000
      : AUDIO_VISUAL_SYNC_OFFSET_SECONDS
  }, [timingOffsetMs, isTimingDebug])

  useEffect(() => {
    gameState.obstacleHitDelaySeconds.current = obstacleHitDelayMs / 1000
  }, [obstacleHitDelayMs])

  useEffect(() => {
    const playbackRate = isTimingDebug ? Number(debugPlaybackRate) : 1
    gameState.timeScale.current = playbackRate
    if (musicRef.current) {
      musicRef.current.playbackRate = playbackRate
    }
  }, [debugPlaybackRate, hasStartedGame, isTimingDebug])

  useEffect(() => {
    if (!musicRef.current) return
    if (!hasStartedGame || isGameOver) {
      musicRef.current.pause()
      hasStartedMusicRef.current = false
      setHasConfirmedMusicStart(false)
      setIsCountdownActive(false)
      setCountdownText('')
      return
    }

    if (hasStartedMusicRef.current) {
      musicRef.current.play().catch(() => { })
    }
  }, [hasStartedGame, isGameOver])

  useEffect(() => {
    if (!musicRef.current) return
    musicRef.current.volume = volume * volume
  }, [volume])

  useEffect(() => {
    if (!hasStartedGame || isGameOver || !hasConfirmedMusicStart) {
      return
    }

    let animationFrameId = 0
    let previousStep = -1

    const syncCountdownToMusic = () => {
      const musicTime = getPerceivedMusicTime(musicRef.current?.currentTime || 0)
      const step = Math.floor(musicTime / BEAT_INTERVAL)

      if (step !== previousStep) {
        previousStep = step
        if (step >= 0 && step < COUNTDOWN_STEPS.length) {
          setIsCountdownActive(true)
          setCountdownText(COUNTDOWN_STEPS[step])
          setCountdownAnimationKey((prev) => prev + 1)
        } else if (step >= COUNTDOWN_STEPS.length) {
          setIsCountdownActive(false)
          setCountdownText('')
        }
      }

      animationFrameId = window.requestAnimationFrame(syncCountdownToMusic)
    }

    animationFrameId = window.requestAnimationFrame(syncCountdownToMusic)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [hasConfirmedMusicStart, hasStartedGame, isGameOver])

  const startMusicPlayback = useCallback(async () => {
    const music = musicRef.current
    if (!music) return

    hasStartedMusicRef.current = false
    setHasConfirmedMusicStart(false)
    setIsCountdownActive(false)
    setCountdownText('')

    music.pause()
    music.currentTime = 0
    try {
      await music.play()
      hasStartedMusicRef.current = true
      setHasConfirmedMusicStart(true)
      setIsCountdownActive(true)
      setCountdownText(COUNTDOWN_STEPS[0])
    } catch {
      hasStartedMusicRef.current = false
    }
  }, [])

  const finishStart = useCallback(() => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = 8
    gameState.speedBoostActive = true
    gameState.speedLinesOn = true
    gameState.jumping = false
    gameState.streak.current = 0
    gameState.scoreMultiplier.current = 1
    gameState.pendingJumpTiming.current = null
    gameState.obstacleTargets.current = []
    gameState.upArrowHeld.current = false
    gameState.activeGrind.current = createIdleGrindState()
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.timeScale.current = 1
    gameState.grindCooldownObstacleId.current = 0
    gameState.catHeight.current = 0.05
    gameState.lastScoringEvent.current = { id: 0, points: 0, grade: 'Perfect', multiplier: 1, isRail: false, trickName: '' }
    gameState.comboEnergy.current = 1
    gameState.timeOfDay.current = 0
    gameState.runDifficultyProgress.current = 0
    setIsGameOver(false)
    setHasStartedGame(true)
    setTimingFeedback({ label: '', id: 0 })
    startMusicPlayback()
  }, [startMusicPlayback])

  const handleStart = useCallback(() => {
    transitionProgressRef.current = 0
    setSnapshotTexture(null)
    snapshotTextureRef.current = null
    setIsTransitioning(true)
    shouldCaptureRef.current = true
    pendingStartRef.current = finishStart
  }, [finishStart])

  const handleSceneCaptured = useCallback(() => {
    transitionProgressRef.current = 0
    setSnapshotTexture(snapshotTextureRef.current)
    setUseOriginalMaterials(false)
    if (pendingStartRef.current) {
      pendingStartRef.current()
      pendingStartRef.current = null
    }
  }, [])

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false)
    setSnapshotTexture(null)
  }, [])

  const handleRestart = useCallback(() => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = 8
    gameState.speedBoostActive = true
    gameState.speedLinesOn = true
    gameState.jumping = false
    gameState.streak.current = 0
    gameState.scoreMultiplier.current = 1
    gameState.pendingJumpTiming.current = null
    gameState.obstacleTargets.current = []
    gameState.upArrowHeld.current = false
    gameState.activeGrind.current = createIdleGrindState()
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.timeScale.current = 1
    gameState.grindCooldownObstacleId.current = 0
    gameState.catHeight.current = 0.05
    gameState.lastScoringEvent.current = { id: 0, points: 0, grade: 'Perfect', multiplier: 1, isRail: false, trickName: '' }
    gameState.comboEnergy.current = 1
    gameState.timeOfDay.current = 0
    gameState.runDifficultyProgress.current = 0
    setIsGameOver(false)
    setTimingFeedback({ label: '', id: 0 })
    startMusicPlayback()
  }, [startMusicPlayback])

  const handleJumpTiming = useCallback((label) => {
    setTimingFeedback({ label, id: performance.now() })
  }, [])

  const playJumpSfx = useCallback(() => {
    const jump = jumpSfxRef.current
    const jump2 = jump2SfxRef.current

    if (jump) {
      jump.currentTime = 0
      jump.volume = 0.18
      jump.play().catch(() => { })
    }

    if (jump2) {
      jump2.currentTime = 0
      jump2.volume = 0.18
      jump2.play().catch(() => { })
    }
  }, [])

  const playDieSfx = useCallback(() => {
    const sfx = dieSfxRef.current
    if (!sfx) return
    sfx.currentTime = 0
    sfx.volume = 0.24
    sfx.play().catch(() => { })
  }, [])

  return (
    <>
      {(isLoadingAssets || loadingProgress < 100) && (
        <>
          <style>
            {`@keyframes gameLoadingPulse {
              0% { transform: scale(0.96); opacity: 0.7; }
              50% { transform: scale(1); opacity: 1; }
              100% { transform: scale(0.96); opacity: 0.7; }
            }
            @keyframes loadingBarShine {
              0% { left: -40%; }
              100% { left: 140%; }
            }
            @keyframes loadingSkateBob {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-3px); }
            }`}
          </style>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.2rem',
              background: 'radial-gradient(ellipse at 50% 40%, rgba(40, 50, 85, 0.92), rgba(8, 11, 20, 0.98))',
              color: 'white',
              fontFamily: 'Knewave',
              letterSpacing: '0.04em',
            }}
          >
            <div style={{
              fontSize: 'clamp(2rem, 6vw, 3.2rem)',
              animation: 'gameLoadingPulse 1.2s ease-in-out infinite',
              textShadow: '0 0 30px rgba(255, 107, 53, 0.3), 2px 2px 0 rgba(255, 107, 53, 0.25)',
            }}>
              LOADING
            </div>
            <div style={{
              position: 'relative',
              width: 'clamp(180px, 50vw, 280px)',
              height: '12px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '2px solid rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                inset: '2px',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, #FF6B35, #FF8F5C, #FFD166)',
                width: `${Math.round(loadingProgress)}%`,
                transition: 'width 0.3s ease-out',
                boxShadow: '0 0 12px rgba(255, 107, 53, 0.6)',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  width: '40%',
                  height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  animation: 'loadingBarShine 1.5s ease-in-out infinite',
                }} />
              </div>
            </div>
            <div style={{
              fontSize: '0.85rem',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 800,
              opacity: 0.6,
              letterSpacing: '0.15em',
            }}>
              {Math.round(loadingProgress)}%
            </div>
          </div>
        </>
      )}
      <audio ref={jumpSfxRef} src="/jump.wav" preload="auto" />
      <audio ref={jump2SfxRef} src="/jump2.wav" preload="auto" />
      <audio ref={dieSfxRef} src="/die.wav" preload="auto" />
      {isCountdownActive && (
        <>
          <style>
            {`@keyframes runCountdownPop {
              0% { transform: translate(-50%, 26px) scale(0.52); opacity: 0; }
              30% { transform: translate(-50%, 0px) scale(1.18); opacity: 1; }
              74% { transform: translate(-50%, -3px) scale(1.02); opacity: 1; }
              100% { transform: translate(-50%, -20px) scale(0.8); opacity: 0; }
            }`}
          </style>
          <div
            key={countdownAnimationKey}
            style={{
              position: 'fixed',
              top: '18%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 200,
              fontFamily: 'Knewave',
              fontWeight: 1000,
              fontSize: '4.2rem',
              lineHeight: 1,
              letterSpacing: '0.06em',
              color: '#ffffff',
              textShadow: '0 0 18px rgba(0, 0, 0, 0.5), 0 0 32px rgba(85, 184, 255, 0.5)',
              pointerEvents: 'none',
              animation: 'runCountdownPop 400ms cubic-bezier(0.16, 0.88, 0.34, 1)',
            }}
          >
            {countdownText}
          </div>
        </>
      )}
      <TimingDebugHud
        musicRef={musicRef}
        visible={hasStartedGame && !isGameOver}
        playbackRate={isTimingDebug ? Number(debugPlaybackRate) : 1}
        manualOffsetMs={isTimingDebug ? timingOffsetMs : 0}
        obstacleHitDelayMs={isTimingDebug ? obstacleHitDelayMs : 0}
      />
      <ObstacleSpacingDebugHud
        musicRef={musicRef}
        visible={hasStartedGame && !isGameOver}
      />
      {(hasStartedGame || isTransitioning) && (
        <button
          onClick={handleReturnToIntro}
          style={{
            position: 'fixed',
            right: '1rem',
            bottom: '1rem',
            zIndex: 240,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.7rem 0.95rem',
            borderRadius: '999px',
            border: '2px solid rgba(255, 255, 255, 0.22)',
            background: 'rgba(10, 12, 18, 0.72)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 900,
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.24)',
          }}
        >
          <span>Replay Intro</span>
          <span
            style={{
              padding: '0.18rem 0.42rem',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.63rem',
            }}
          >
            Shift+R
          </span>
        </button>
      )}
      {hasStartedGame && (
        <div
          style={{
            position: 'fixed',
            left: '1rem',
            bottom: '1rem',
            zIndex: 220,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.45rem 0.75rem',
            borderRadius: '999px',
            border: '2px solid rgba(255, 255, 255, 0.18)',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            color: 'rgba(255, 255, 255, 0.7)',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 800,
            fontSize: '0.65rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>
            {volume > 0.6 ? '🔊' : volume > 0.3 ? '🔉' : '🔈'}
          </span>
          <input
            type="range"
            className="skate-slider"
            min="0.1"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={handleVolumePointerDone}
            onKeyUp={handleVolumePointerDone}
            style={{ width: '100px' }}
          />
        </div>
      )}
      <GameHud musicRef={musicRef} visible={hasStartedGame && !isGameOver} timingFeedback={timingFeedback} />
      <GameOverScreen visible={isGameOver} onRestart={handleRestart} />
      <Canvas
        style={{ width: '100vw', height: '100vh' }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        {hasStartedGame && <fog attach="fog" args={['#c4d4b8', 55, 130]} />}

        <CameraRig started={hasStartedGame} />
        {hasStartedGame && <DayNightController isRunning={!isGameOver} />}

        {hasStartedGame && <Ground />}
        {hasStartedGame && <Background />}
        {hasStartedGame && <Sky />}
        {!hasStartedGame && <IntroScene onStart={handleStart} disabled={isTransitioning} />}
        {hasStartedGame && <color attach="background" args={['#000000']} />}
        {/* SkateCat is always mounted (pre-loaded) but hidden during the intro screen */}
        <group visible={hasStartedGame}>
          <SkateCat
            trailTargetRef={trailTarget}
            controlsEnabled={hasStartedGame && !isGameOver && !isCountdownActive}
            useOriginalMaterials={useOriginalMaterials}
            musicRef={musicRef}
            onJumpTiming={handleJumpTiming}
            onJumpSfx={playJumpSfx}
          />
        </group>
        {hasStartedGame && (
          <>
            <Obstacles
              musicRef={musicRef}
              isRunning={!isGameOver}
              canCollide={!isCountdownActive}
              onLogHit={playDieSfx}
            />
            <SpeedLines />
            <KickflipSparks />
            <DustTrail />
            <AmbientParticles />
          </>
        )}
        <TransitionAnimator
          progressRef={transitionProgressRef}
          isTransitioning={isTransitioning}
          duration={transitionSettings.duration}
          onComplete={handleTransitionComplete}
        />
        <PostEffects
          introSettings={introPost}
          gameSettings={gamePost}
          snapshotTexture={snapshotTexture}
          transitionSettings={transitionSettings}
          transitionProgressRef={transitionProgressRef}
          isTransitioning={isTransitioning}
          hasStartedGame={hasStartedGame}
          shouldCaptureRef={shouldCaptureRef}
          snapshotTextureRef={snapshotTextureRef}
          onCaptured={handleSceneCaptured}
        />
      </Canvas>
    </>
  )
}
