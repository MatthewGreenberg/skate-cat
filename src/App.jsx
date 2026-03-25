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
import IntroRainbow from './components/IntroRainbow'
import GameHud from './components/GameHud'
import { EffectComposer, BrightnessContrast, HueSaturation } from '@react-three/postprocessing'
import { BloomEffect } from 'postprocessing'
import { useControls } from 'leva'
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

// Reusable temp color for DayNightController
const _tmpColor = new THREE.Color()
const NIGHT_BLOOM_INTENSITY = 4.3

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
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

function PostEffects({ bloomIntensity, bloomThreshold, bloomSmoothing, brightness, contrast, hue, saturation }) {
  const bloom = useMemo(() => new BloomEffect({
    intensity: bloomIntensity,
    luminanceThreshold: bloomThreshold,
    luminanceSmoothing: bloomSmoothing,
    mipmapBlur: true,
  }), [])

  useEffect(() => {
    bloom.luminanceMaterial.threshold = bloomThreshold
    bloom.luminanceMaterial.smoothing = bloomSmoothing
  }, [bloom, bloomThreshold, bloomSmoothing])

  useFrame(() => {
    const nightFactor = getNightFactor(gameState.timeOfDay.current)
    bloom.intensity = THREE.MathUtils.lerp(bloomIntensity, NIGHT_BLOOM_INTENSITY, nightFactor)
    bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(bloomThreshold, 0, nightFactor)
  })

  return (
    <EffectComposer multisampling={0}>
      <primitive object={bloom} />
      <BrightnessContrast brightness={brightness} contrast={contrast} />
      <HueSaturation hue={hue} saturation={saturation} />
    </EffectComposer>
  )
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
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()

  const handleVolumePointerDone = useCallback((event) => {
    event.currentTarget.blur()
  }, [])

  const {
    bloomIntensity, bloomThreshold, bloomSmoothing,
    brightness, contrast, hue, saturation,
  } = useControls('Post Processing', {
    bloomIntensity: { value: 2.1, min: 0, max: 10, step: 0.1 },
    bloomThreshold: { value: 0.35, min: 0, max: 1, step: 0.05 },
    bloomSmoothing: { value: 0.1, min: 0, max: 1, step: 0.05 },
    brightness: { value: 0.0, min: -0.3, max: 0.3, step: 0.01 },
    contrast: { value: 0.1, min: -0.5, max: 0.5, step: 0.01 },
    hue: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    saturation: { value: 0.15, min: -1, max: 1, step: 0.01 },
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

  const handleStart = useCallback(() => {
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
      {!hasStartedGame && !isLoadingAssets && loadingProgress >= 100 && (
        <>
          <style>
            {`@keyframes introTitleDrop {
              0% { transform: translateY(-60px) rotate(-6deg) scale(0.7); opacity: 0; }
              50% { transform: translateY(8px) rotate(-2.5deg) scale(1.05); opacity: 1; }
              70% { transform: translateY(-3px) rotate(-3deg) scale(0.98); }
              100% { transform: translateY(0) rotate(-3deg) scale(1); opacity: 1; }
            }
            @keyframes introSubSpring {
              0% { transform: translateY(18px); opacity: 0; }
              60% { transform: translateY(-2px); opacity: 1; }
              100% { transform: translateY(0); opacity: 1; }
            }
            @keyframes introBtnPop {
              0% { transform: scale(0); opacity: 0; }
              60% { transform: scale(1.12); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes introBtnGlow {
              0%, 100% { box-shadow: 0 6px 20px rgba(255, 107, 53, 0.5), 0 0 0 0 rgba(255, 107, 53, 0); }
              50% { box-shadow: 0 8px 30px rgba(255, 107, 53, 0.7), 0 0 0 6px rgba(255, 107, 53, 0.12); }
            }
            @keyframes introHintFade {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
            .intro-start-btn {
              transition: transform 0.18s cubic-bezier(0.33, 1, 0.68, 1), background 0.18s ease;
            }
            .intro-start-btn:hover {
              background: linear-gradient(135deg, #FF8F5C, #FF5722);
              transform: scale(1.08);
            }
            .intro-start-btn:active {
              transform: scale(0.96);
            }
            .intro-start-btn:focus-visible {
              outline: 3px solid rgba(255, 255, 255, 0.8);
              outline-offset: 3px;
            }
            @media (prefers-reduced-motion: reduce) {
              .intro-start-btn,
              .intro-start-btn:hover,
              .intro-start-btn:active { transition: none; transform: none; }
              * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
            }`}
          </style>
          <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 999,
            fontFamily: 'Knewave',
            color: 'white',
          }}>
            <h1 style={{
              margin: 0,
              fontSize: 'clamp(3.5rem, 10vw, 7.5rem)',
              lineHeight: 1,
              letterSpacing: '0.04em',
              transform: 'rotate(-3deg)',
              textShadow: `
                3px 3px 0 #FF6B35,
                6px 6px 0 rgba(255, 107, 53, 0.4),
                0 0 40px rgba(255, 107, 53, 0.3),
                0 0 80px rgba(255, 175, 72, 0.15)
              `,
              animation: 'introTitleDrop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
              pointerEvents: 'none',
            }}>
              Skate Cat
            </h1>
            <div style={{
              marginTop: '0.4rem',
              fontSize: 'clamp(0.9rem, 2.5vw, 1.3rem)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              opacity: 0,
              color: 'rgba(255, 255, 255, 0.75)',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
              animation: 'introSubSpring 0.55s cubic-bezier(0.33, 1, 0.68, 1) 0.4s both',
              pointerEvents: 'none',
            }}>
              Kick &#x2022; Flip &#x2022; Repeat
            </div>
            <button
              className="intro-start-btn"
              onClick={handleStart}
              style={{
                marginTop: '2rem',
                padding: '1rem 3rem',
                fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
                fontFamily: 'Knewave',
                letterSpacing: '0.08em',
                background: 'linear-gradient(135deg, #FF6B35, #FF8F5C)',
                color: 'white',
                border: '3px solid rgba(255, 255, 255, 0.35)',
                borderRadius: '60px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                boxShadow: '0 6px 20px rgba(255, 107, 53, 0.5)',
                animation: 'introBtnPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.6s both, introBtnGlow 3s ease-in-out 1.5s infinite',
              }}
            >
              Start Run
            </button>
            <div style={{
              marginTop: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.45)',
              textShadow: '0 1px 6px rgba(0, 0, 0, 0.3)',
              animation: 'introHintFade 3s ease-in-out 1.2s infinite both',
              pointerEvents: 'none',
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.6rem',
                height: '1.6rem',
                borderRadius: '5px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.08)',
                fontSize: '0.85rem',
                fontFamily: 'Knewave',
                color: 'rgba(255, 255, 255, 0.6)',
              }}>&#x2191;</span>
              jump / grind
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '3rem',
                height: '1.6rem',
                borderRadius: '5px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.08)',
                fontSize: '0.85rem',
                fontFamily: 'Knewave',
                color: 'rgba(255, 255, 255, 0.6)',
              }}>&#x2190; / &#x2193;</span>
              airborne 360
            </div>
          </div>
        </>
      )}
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
        <fog attach="fog" args={['#c4d4b8', 55, 130]} />

        <CameraRig started={hasStartedGame} />
        <DayNightController isRunning={hasStartedGame && !isGameOver} />

        <Ground />
        <Background />
        <Sky />
        <IntroRainbow visible={!hasStartedGame} />
        <SkateCat
          trailTargetRef={trailTarget}
          controlsEnabled={hasStartedGame && !isGameOver && !isCountdownActive}
          hasStartedGame={hasStartedGame}
          musicRef={musicRef}
          onJumpTiming={handleJumpTiming}
          onJumpSfx={playJumpSfx}
        />
        <Obstacles
          musicRef={musicRef}
          isRunning={hasStartedGame && !isGameOver}
          canCollide={!isCountdownActive}
          onLogHit={playDieSfx}
        />
        <SpeedLines />
        <KickflipSparks />
        <DustTrail />
        <AmbientParticles />
        <PostEffects
          bloomIntensity={bloomIntensity}
          bloomThreshold={bloomThreshold}
          bloomSmoothing={bloomSmoothing}
          brightness={brightness}
          contrast={contrast}
          hue={hue}
          saturation={saturation}
        />
      </Canvas>
    </>
  )
}
