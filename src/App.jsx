import { memo, useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import { useProgress, StatsGl, useDetectGPU } from '@react-three/drei'
import IntroScene from './components/IntroScene'
import CameraRig from './components/CameraRig'
import GameHud from './components/GameHud'
import GameWorld, { GameWorldWarmup } from './components/GameWorld'
import PostEffects, { TransitionAnimator } from './components/PostEffects'
import SceneCapture from './components/SceneCapture'
import {
  createPostProcessingControls,
  DEFAULT_INTRO_POST_SETTINGS,
  DEFAULT_GAME_POST_SETTINGS,
} from './lib/postProcessing'
import TimingDebugHud from './components/TimingDebugHud'
import ObstacleSpacingDebugHud from './components/ObstacleSpacingDebugHud'
import { createBufferedMusicTransport } from './audioTransport'
import {
  buildRunSummary,
  gameState,
  createAccuracyStats,
  createEmptyScoringEvent,
  createIdleGrindState,
  createIdleGrindSparkState,
  emitHudScoreChange,
  getTargetRunSpeed,
  isObstacleSpacingDebug,
  isTimingDebug,
  MAX_RUN_LIVES,
  qualityMode,
  resetObstacleTargets,
  debugControlsEnabled,
} from './store'
import { useOptionalControls } from './lib/debugControls'
import {
  AUDIO_VISUAL_SYNC_OFFSET_SECONDS,
  BEAT_INTERVAL,
  getPerceivedMusicTime,
  TRACK_BEAT_PHASE_OFFSET_SECONDS,
} from './rhythm'

const COUNTDOWN_STEPS = ['1', '2', '3', 'GO!']
const AUTO_DPR = [1, 1.25]
const HIGH_DPR = [1, 2]
const QUIET_DPR = [1, 1]
const PHASE_INTRO = 'intro'
const PHASE_LAUNCHING = 'launching'
const PHASE_RUNNING = 'running'
const PHASE_END_GLITCH = 'endGlitch'
const PHASE_RETURNING = 'returning'
const PHASE_RESULTS = 'results'
const CAPTURE_MODE_LAUNCH = 'launch'
const CAPTURE_MODE_RETURN = 'return'
const RETURN_SCREEN_TITLE = 'title'
const RETURN_SCREEN_SUMMARY = 'summary'
const END_GLITCH_DURATION_MS = 900

const SceneCanvas = memo(function SceneCanvas({
  phase,
  transitionCaptureMode,
  hasCompletedBootReveal,
  canvasDpr,
  showGameWorld,
  isTransitioning,
  transitionDirection,
  runActive,
  transitionProgressRef,
  introDisabled,
  onStart,
  shouldMountGameWorld,
  sceneActive,
  isGameOver,
  isCountdownActive,
  useOriginalMaterials,
  trailTargetRef,
  musicRef,
  onJumpSfx,
  onLogHit,
  isWarmingGameWorld,
  onGameWorldPrimed,
  transitionSettings,
  onTransitionComplete,
  introPost,
  gamePost,
  transitionSnapshotTextureRef,
  capturedTransitionTexture,
  shouldCaptureSceneRef,
  onSceneCaptured,
  foliageSegmentCount,
  introScreenMode,
  introSummary,
  introButtonLabel,
  gpuTier,
  chromaticSpike,
  cameraMode,
  onDismissIntroScreen,
  showIntroDismissButton,
}) {
  return (
    <Canvas
      dpr={canvasDpr}
      style={{
        width: '100vw',
        height: '100vh',
        opacity: hasCompletedBootReveal ? 1 : 0,
      }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      shadows={{ type: (gpuTier?.tier ?? 3) <= 1 ? THREE.BasicShadowMap : THREE.PCFShadowMap }}
    >
      {debugControlsEnabled && <StatsGl />}
      <SceneCapture
        shouldCaptureRef={shouldCaptureSceneRef}
        snapshotTextureRef={transitionSnapshotTextureRef}
        onCaptured={onSceneCaptured}
      />
      <CameraRig
        runActive={runActive}
        showGameWorld={showGameWorld}
        isTransitioning={isTransitioning}
        transitionProgressRef={transitionProgressRef}
        transitionDirection={transitionDirection}
        cameraMode={cameraMode}
      />
      {!showGameWorld && phase !== PHASE_LAUNCHING && (
        <IntroScene
          onStart={onStart}
          onDismiss={onDismissIntroScreen}
          disabled={introDisabled}
          buttonLabel={introButtonLabel}
          screenMode={introScreenMode}
          summary={introSummary}
          showDismissButton={showIntroDismissButton}
        />
      )}
      {shouldMountGameWorld && (
        <GameWorld
          visible={showGameWorld}
          sceneActive={sceneActive}
          runActive={runActive}
          isGameOver={isGameOver}
          isCountdownActive={isCountdownActive}
          isTransitioning={isTransitioning}
          useOriginalMaterials={useOriginalMaterials}
          freezeMotion={phase === PHASE_END_GLITCH || transitionCaptureMode === CAPTURE_MODE_RETURN || phase === PHASE_RETURNING}
          trailTargetRef={trailTargetRef}
          musicRef={musicRef}
          onJumpSfx={onJumpSfx}
          onLogHit={onLogHit}
          foliageSegmentCount={foliageSegmentCount}
        />
      )}
      {shouldMountGameWorld && (
        <GameWorldWarmup
          active={isWarmingGameWorld}
          onComplete={onGameWorldPrimed}
        />
      )}
      <TransitionAnimator
        progressRef={transitionProgressRef}
        isTransitioning={isTransitioning}
        duration={transitionDirection === 'reverse' ? transitionSettings.reverseDuration : transitionSettings.duration}
        onComplete={onTransitionComplete}
      />
      <PostEffects
        introSettings={introPost}
        gameSettings={gamePost}
        transitionSettings={transitionSettings}
        transitionProgressRef={transitionProgressRef}
        isTransitioning={isTransitioning}
        transitionDirection={transitionDirection}
        showGameWorld={showGameWorld}
        runActive={runActive}
        capturedTexture={capturedTransitionTexture}
        gpuTier={gpuTier}
        chromaticSpike={chromaticSpike}
      />
    </Canvas>
  )
})

export default function App() {
  const trailTarget = useRef()
  const musicRef = useRef(null)
  const jumpSfxRef = useRef(null)
  const jump2SfxRef = useRef(null)
  const dieSfxRef = useRef(null)
  const hasStartedMusicRef = useRef(false)
  const handleSongCompleteRef = useRef(() => { })
  const endGlitchTimeoutRef = useRef(0)
  const shouldCaptureSceneRef = useRef(false)
  const transitionSnapshotTextureRef = useRef(null)
  const transitionCaptureModeRef = useRef(null)
  const [capturedTransitionTexture, setCapturedTransitionTexture] = useState(null)
  const [phase, setPhase] = useState(PHASE_INTRO)
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [transitionCaptureMode, setTransitionCaptureMode] = useState(null)
  const [returnScreenMode, setReturnScreenMode] = useState(RETURN_SCREEN_SUMMARY)
  const [isEndingLocked, setIsEndingLocked] = useState(false)
  const [isGameWorldPrimed, setIsGameWorldPrimed] = useState(false)
  const [showDeathFullscreen, setShowDeathFullscreen] = useState(false)
  const [hasCompletedBootReveal, setHasCompletedBootReveal] = useState(false)
  const [hasConfirmedMusicStart, setHasConfirmedMusicStart] = useState(false)
  const [isCountdownActive, setIsCountdownActive] = useState(false)
  const [countdownText, setCountdownText] = useState('')
  const [countdownAnimationKey, setCountdownAnimationKey] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const [useOriginalMaterials] = useState(false)
  const transitionProgressRef = useRef(0)
  const returnFreezeDurationRef = useRef(0.2)
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()
  const isAssetLoadComplete = !isLoadingAssets && loadingProgress >= 100
  const showLoadingOverlay = !hasCompletedBootReveal
  const isPreReturnGlitching = phase === PHASE_END_GLITCH
  const isTransitioning = phase === PHASE_LAUNCHING || phase === PHASE_RETURNING
  const isTransitionBusy = transitionCaptureMode !== null || isTransitioning || isPreReturnGlitching
  const runActive = phase === PHASE_RUNNING && !isEndingLocked
  const showGameWorld = (
    phase === PHASE_END_GLITCH ||
    phase === PHASE_LAUNCHING ||
    phase === PHASE_RUNNING ||
    transitionCaptureMode === CAPTURE_MODE_RETURN
  )
  const shouldMountGameWorld = isAssetLoadComplete || isGameWorldPrimed || phase !== PHASE_INTRO || transitionCaptureMode === CAPTURE_MODE_RETURN
  const isWarmingGameWorld = isAssetLoadComplete && !isGameWorldPrimed
  const sceneActive = phase === PHASE_LAUNCHING || (phase === PHASE_RUNNING && !isEndingLocked)
  const isGameOver = isEndingLocked || isPreReturnGlitching || phase === PHASE_RETURNING || phase === PHASE_RESULTS
  const gpuTier = useDetectGPU()
  // GPU-aware quality: URL param overrides auto-detection
  const effectiveQuality = qualityMode !== 'auto'
    ? qualityMode
    : gpuTier.tier === 0 ? 'quiet'
      : gpuTier.tier === 1 ? 'quiet'
        : gpuTier.tier === 2 ? 'auto'
          : 'high'
  const canvasDpr = effectiveQuality === 'high' ? HIGH_DPR : effectiveQuality === 'quiet' ? QUIET_DPR : AUTO_DPR
  const foliageSegmentCount = effectiveQuality === 'quiet' ? 1 : 2
  const currentRunSummary = gameState.lastRunSummary.current
  const currentOutcome = currentRunSummary?.outcome ?? null
  const isReturnScreenActive = phase === PHASE_RETURNING || phase === PHASE_RESULTS
  const introScreenMode = isReturnScreenActive ? returnScreenMode : RETURN_SCREEN_TITLE
  const introButtonLabel = introScreenMode === RETURN_SCREEN_SUMMARY ? 'PLAY AGAIN' : 'PRESS START'
  const introSummary = introScreenMode === RETURN_SCREEN_SUMMARY ? currentRunSummary : null
  const chromaticSpike = isPreReturnGlitching ? 1 : 0
  const cameraMode = isReturnScreenActive
    ? introScreenMode === RETURN_SCREEN_SUMMARY
      ? currentOutcome === 'failed'
        ? showDeathFullscreen ? 'death' : 'intro'
        : 'results'
      : 'intro'
    : 'intro'
  const canDismissDeathFullscreen = (
    phase === PHASE_RESULTS &&
    introScreenMode === RETURN_SCREEN_SUMMARY &&
    currentOutcome === 'failed' &&
    showDeathFullscreen
  )

  const handleVolumePointerDone = useCallback((event) => {
    event.currentTarget.blur()
  }, [])

  const resetRunState = useCallback(({ speed = 0, speedLinesOn = false, speedBoostActive = false } = {}) => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.progressScore = 0
    gameState.speed.current = speed
    gameState.speedBoostActive = speedBoostActive
    gameState.speedLinesOn = speedLinesOn
    gameState.jumping = false
    gameState.streak.current = 0
    gameState.scoreMultiplier.current = 1
    gameState.remainingLives.current = MAX_RUN_LIVES
    gameState.groundSpinCount.current = 0
    gameState.railCount.current = 0
    gameState.bestStreak.current = 0
    gameState.accuracyStats.current = createAccuracyStats()
    gameState.pendingJumpTiming.current = null
    resetObstacleTargets()
    gameState.upArrowHeld.current = false
    gameState.activeGrind.current = createIdleGrindState()
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.timeScale.current = 1
    gameState.grindCooldownObstacleId.current = 0
    gameState.catHeight.current = 0.05
    gameState.lastScoringEvent.current = createEmptyScoringEvent()
    gameState.screenShake.current = 0
    gameState.comboEnergy.current = 1
    gameState.timeOfDay.current = 0
    gameState.runDifficultyProgress.current = 0
    gameState.phaseSpeedBonus.current = 0
    gameState.lastFailReason.current = ''
    gameState.tutorialPrompt.current = ''
    gameState.runPhase.current = 'early'
    gameState.phaseAnnouncement.current = ''
    gameState.lastRunSummary.current = null
    emitHudScoreChange()
  }, [])

  const clearPlaybackState = useCallback(() => {
    hasStartedMusicRef.current = false
    if (musicRef.current) {
      musicRef.current.pause()
    }
    setHasConfirmedMusicStart(false)
    setIsCountdownActive(false)
    setCountdownText('')
  }, [])

  const queueReturnToIntro = useCallback(({ summary = null, screenMode = RETURN_SCREEN_SUMMARY } = {}) => {
    if (phase !== PHASE_RUNNING || isGameOver || isTransitionBusy || isEndingLocked) return

    setReturnScreenMode(screenMode)
    gameState.lastRunSummary.current = screenMode === RETURN_SCREEN_SUMMARY ? summary : null
    transitionProgressRef.current = 0
    setTransitionDirection('reverse')
    setIsEndingLocked(true)
    setShowDeathFullscreen(screenMode === RETURN_SCREEN_SUMMARY && summary?.outcome === 'failed')
    clearPlaybackState()

    window.clearTimeout(endGlitchTimeoutRef.current)
    if (screenMode === RETURN_SCREEN_SUMMARY && summary?.outcome === 'failed') {
      setPhase(PHASE_END_GLITCH)
      endGlitchTimeoutRef.current = window.setTimeout(() => {
        shouldCaptureSceneRef.current = true
        transitionCaptureModeRef.current = CAPTURE_MODE_RETURN
        setTransitionCaptureMode(CAPTURE_MODE_RETURN)
      }, END_GLITCH_DURATION_MS)
      return
    }

    const returnFreezeDurationMs = Math.max(0, returnFreezeDurationRef.current * 1000)
    if (returnFreezeDurationMs > 0) {
      endGlitchTimeoutRef.current = window.setTimeout(() => {
        shouldCaptureSceneRef.current = true
        transitionCaptureModeRef.current = CAPTURE_MODE_RETURN
        setTransitionCaptureMode(CAPTURE_MODE_RETURN)
      }, returnFreezeDurationMs)
      return
    }

    shouldCaptureSceneRef.current = true
    transitionCaptureModeRef.current = CAPTURE_MODE_RETURN
    setTransitionCaptureMode(CAPTURE_MODE_RETURN)
  }, [clearPlaybackState, isEndingLocked, isGameOver, isTransitionBusy, phase])

  const handleReturnToIntro = useCallback(() => {
    window.clearTimeout(endGlitchTimeoutRef.current)
    clearPlaybackState()
    shouldCaptureSceneRef.current = false
    transitionCaptureModeRef.current = null
    setTransitionCaptureMode(null)
    setCapturedTransitionTexture(null)
    if (musicRef.current) {
      musicRef.current.currentTime = 0
    }

    resetRunState()

    transitionProgressRef.current = 0
    setTransitionDirection('forward')
    setReturnScreenMode(RETURN_SCREEN_SUMMARY)
    setIsEndingLocked(false)
    setShowDeathFullscreen(false)
    setPhase(PHASE_INTRO)
  }, [clearPlaybackState, resetRunState])

  useEffect(() => () => {
    window.clearTimeout(endGlitchTimeoutRef.current)
  }, [])

  const introPost = useOptionalControls(
    'Intro',
    { 'Post Processing': folder(createPostProcessingControls(DEFAULT_INTRO_POST_SETTINGS)) }
  )
  const gamePost = useOptionalControls(
    'Game',
    { 'Post Processing': folder(createPostProcessingControls(DEFAULT_GAME_POST_SETTINGS), { collapsed: true }) }
  )
  const transitionSettings = useOptionalControls('Intro', {
    Transition: folder({
      duration: { value: 2.4, min: 0.3, max: 4.5, step: 0.05, label: 'Duration' },
      revealCurve: { value: 0.86, min: 0.2, max: 2.2, step: 0.01, label: 'Curve' },
      thresholdStart: { value: 0.12, min: -0.3, max: 0.3, step: 0.01, label: 'Start' },
      thresholdEnd: { value: 0.97, min: 0.2, max: 1.2, step: 0.01, label: 'End' },
      bandBefore: { value: 0.01, min: 0.005, max: 0.2, step: 0.005, label: 'Edge In' },
      bandAfter: { value: 0.2, min: 0.005, max: 0.2, step: 0.005, label: 'Edge Out' },
      glowInnerOffset: { value: 0.08, min: 0, max: 0.08, step: 0.005, label: 'Glow In' },
      glowOuterOffset: { value: 0.25, min: 0.01, max: 0.25, step: 0.005, label: 'Glow Out' },
      glowIntensity: { value: 0.65, min: 0, max: 2, step: 0.05, label: 'Glow' },
      glowColor: { value: '#3dd5e8', label: 'Color' },
      noiseScaleA: { value: 8.5, min: 1, max: 24, step: 0.5, label: 'Noise A' },
      noiseScaleB: { value: 8.0, min: 1, max: 32, step: 0.5, label: 'Noise B' },
      noiseAmpA: { value: 0.0, min: 0, max: 0.6, step: 0.01, label: 'Noise Amt A' },
      noiseAmpB: { value: 0.18, min: 0, max: 0.4, step: 0.01, label: 'Noise Amt B' },
      diffuseSpread: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Diffuse Spread' },
      dollyAmount: { value: 0.4, min: 0, max: 0.8, step: 0.01, label: 'Dolly' },
      dollyStart: { value: 0.2, min: 0, max: 0.2, step: 0.005, label: 'Dolly Start' },
      flashStrength: { value: 1, min: 0, max: 1, step: 0.05, label: 'Flash' },
    }),
    'Return Transition': folder({
      reverseDuration: { value: 1.50, min: 0.1, max: 4.5, step: 0.05, label: 'Duration' },
      returnFreezeDuration: { value: 0.2, min: 0, max: 2, step: 0.01, label: 'Freeze Hold' },
      returnGlowColor: { value: '#3dd5e8', label: 'Glow Color' },
      returnGlowIntensity: { value: 0.85, min: 0, max: 3, step: 0.05, label: 'Glow Intensity' },
      returnRevealCurve: { value: 2.05, min: 0.2, max: 2.8, step: 0.01, label: 'Curve' },
      returnThresholdStart: { value: 0.12, min: -0.3, max: 0.3, step: 0.01, label: 'Start' },
      returnThresholdEnd: { value: 0.97, min: 0.2, max: 1.2, step: 0.01, label: 'End' },
      returnBandBefore: { value: 0.02, min: 0.005, max: 0.2, step: 0.005, label: 'Edge In' },
      returnBandAfter: { value: 0.16, min: 0.005, max: 0.3, step: 0.005, label: 'Edge Out' },
      returnGlowInnerOffset: { value: 0.04, min: 0, max: 0.12, step: 0.005, label: 'Glow In' },
      returnGlowOuterOffset: { value: 0.14, min: 0.01, max: 0.3, step: 0.005, label: 'Glow Out' },
      returnDiffuseSpread: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Diffuse Spread' },
      returnFlashStrength: { value: 0.6, min: 0, max: 1, step: 0.05, label: 'Flash' },
    }),
  })
  const { timingOffsetMs, obstacleHitDelayMs, debugPlaybackRate } = useOptionalControls('Debug', {
    'Timing Debug': folder({
      timingOffsetMs: { value: 0, min: -300, max: 180, step: 1 },
      obstacleHitDelayMs: { value: 0, min: -180, max: 180, step: 1 },
      debugPlaybackRate: {
        value: 1,
        options: { '1x': 1, '0.75x': 0.75, '0.5x': 0.5, '0.25x': 0.25 },
      },
    }, { collapsed: true }),
  }, [])

  useEffect(() => {
    returnFreezeDurationRef.current = transitionSettings.returnFreezeDuration
  }, [transitionSettings.returnFreezeDuration])

  useEffect(() => {
    const music = createBufferedMusicTransport('/skate-cat-2.mp3')
    music.onEnded = () => handleSongCompleteRef.current()
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
    if (
      hasCompletedBootReveal ||
      !isGameWorldPrimed ||
      phase !== PHASE_INTRO ||
      isTransitionBusy
    ) {
      return
    }

    let revealFrameA = 0
    let revealFrameB = 0
    revealFrameA = window.requestAnimationFrame(() => {
      revealFrameB = window.requestAnimationFrame(() => {
        setHasCompletedBootReveal(true)
      })
    })

    return () => {
      window.cancelAnimationFrame(revealFrameA)
      window.cancelAnimationFrame(revealFrameB)
    }
  }, [hasCompletedBootReveal, isGameWorldPrimed, isTransitionBusy, phase])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (canDismissDeathFullscreen && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        setShowDeathFullscreen(false)
        return
      }

      const isResetShortcut = (
        event.key.toLowerCase() === 'r' &&
        (event.metaKey || event.ctrlKey || event.shiftKey)
      )
      if (!isResetShortcut) return

      if (isTransitionBusy || phase === PHASE_RESULTS) {
        event.preventDefault()
        handleReturnToIntro()
        return
      }

      if (!runActive) return

      event.preventDefault()
      queueReturnToIntro({ screenMode: RETURN_SCREEN_TITLE })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canDismissDeathFullscreen, handleReturnToIntro, isTransitionBusy, phase, queueReturnToIntro, runActive])

  useEffect(() => {
    gameState.onGameOver = (payload = {}) => {
      if (payload.reason) {
        gameState.lastFailReason.current = payload.reason
      }
      const summary = payload.summary || buildRunSummary({ outcome: payload.outcome || 'failed' })
      queueReturnToIntro({ summary, screenMode: RETURN_SCREEN_SUMMARY })
    }

    return () => {
      if (gameState.onGameOver) {
        gameState.onGameOver = null
      }
    }
  }, [queueReturnToIntro])

  useEffect(() => {
    gameState.timingOffsetSeconds.current = isTimingDebug
      ? TRACK_BEAT_PHASE_OFFSET_SECONDS + timingOffsetMs / 1000
      : AUDIO_VISUAL_SYNC_OFFSET_SECONDS
  }, [timingOffsetMs])

  useEffect(() => {
    gameState.obstacleHitDelaySeconds.current = obstacleHitDelayMs / 1000
  }, [obstacleHitDelayMs])

  useEffect(() => {
    const playbackRate = isTimingDebug ? Number(debugPlaybackRate) : 1
    gameState.timeScale.current = playbackRate
    if (musicRef.current) {
      musicRef.current.playbackRate = playbackRate
    }
  }, [debugPlaybackRate, phase])

  useEffect(() => {
    if (!musicRef.current) return
    if ((phase !== PHASE_RUNNING && phase !== PHASE_LAUNCHING) || isGameOver) {
      musicRef.current.pause()
      hasStartedMusicRef.current = false
      return
    }

    if (hasStartedMusicRef.current) {
      musicRef.current.play().catch(() => { })
    }
  }, [isGameOver, phase])

  useEffect(() => {
    if (!musicRef.current) return
    musicRef.current.volume = volume * volume
  }, [volume])

  useEffect(() => {
    if ((!runActive && !isTransitioning) || isGameOver || !hasConfirmedMusicStart) {
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
  }, [hasConfirmedMusicStart, isGameOver, isTransitioning, runActive])

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

  const activateRun = useCallback(() => {
    gameState.speed.current = getTargetRunSpeed()
    gameState.speedBoostActive = false
    gameState.speedLinesOn = true
    setIsEndingLocked(false)
    setPhase(PHASE_RUNNING)
  }, [])

  const handleGameWorldPrimed = useCallback(() => {
    setIsGameWorldPrimed(true)
  }, [])

  const handleStart = useCallback(() => {
    if (!isGameWorldPrimed || isTransitionBusy) return

    resetRunState({ speed: getTargetRunSpeed(), speedLinesOn: true })
    transitionProgressRef.current = 0
    setIsEndingLocked(false)
    setCapturedTransitionTexture(null)
    setTransitionDirection('forward')
    shouldCaptureSceneRef.current = true
    transitionCaptureModeRef.current = CAPTURE_MODE_LAUNCH
    setTransitionCaptureMode(CAPTURE_MODE_LAUNCH)
  }, [isGameWorldPrimed, isTransitionBusy, resetRunState])

  const handleSceneCaptured = useCallback((sceneTexture) => {
    const captureMode = transitionCaptureModeRef.current
    setCapturedTransitionTexture(sceneTexture)
    transitionCaptureModeRef.current = null
    setTransitionCaptureMode(null)

    if (captureMode === CAPTURE_MODE_LAUNCH) {
      setPhase(PHASE_LAUNCHING)
      startMusicPlayback()
      return
    }

    if (captureMode === CAPTURE_MODE_RETURN) {
      setPhase(PHASE_RETURNING)
    }
  }, [startMusicPlayback])

  const handleTransitionComplete = useCallback(() => {
    if (transitionDirection === 'reverse') {
      if (returnScreenMode === RETURN_SCREEN_TITLE) {
        handleReturnToIntro()
        return
      }
      setPhase(PHASE_RESULTS)
      setIsEndingLocked(false)
      return
    }

    activateRun()
  }, [activateRun, handleReturnToIntro, returnScreenMode, transitionDirection])

  const handleSongComplete = useCallback(() => {
    queueReturnToIntro({
      summary: buildRunSummary({ outcome: 'complete' }),
      screenMode: RETURN_SCREEN_SUMMARY,
    })
  }, [queueReturnToIntro])

  useEffect(() => {
    handleSongCompleteRef.current = handleSongComplete
  }, [handleSongComplete])

  const handleRestart = useCallback(() => {
    resetRunState({ speed: getTargetRunSpeed(), speedLinesOn: true })
    transitionProgressRef.current = 0
    setCapturedTransitionTexture(null)
    setTransitionDirection('forward')
    setIsEndingLocked(false)
    setShowDeathFullscreen(false)
    setPhase(PHASE_INTRO)
    gameState.lastRunSummary.current = null
    shouldCaptureSceneRef.current = true
    transitionCaptureModeRef.current = CAPTURE_MODE_LAUNCH
    setTransitionCaptureMode(CAPTURE_MODE_LAUNCH)
  }, [resetRunState])

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

  const loadingLabel = isAssetLoadComplete ? 'WARMING UP' : 'LOADING'
  const introDisabled = !isGameWorldPrimed || isTransitionBusy || phase === PHASE_RETURNING

  return (
    <>
      {showLoadingOverlay && (
        <>
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
              {loadingLabel}
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
      {isTimingDebug && (
        <TimingDebugHud
          musicRef={musicRef}
          visible={runActive && !isGameOver}
          playbackRate={Number(debugPlaybackRate)}
          manualOffsetMs={timingOffsetMs}
          obstacleHitDelayMs={obstacleHitDelayMs}
        />
      )}
      {isObstacleSpacingDebug && (
        <ObstacleSpacingDebugHud
          musicRef={musicRef}
          visible={runActive && !isGameOver}
        />
      )}
      {(runActive || phase === PHASE_LAUNCHING) && (
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
      {runActive && (
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
      <GameHud musicRef={musicRef} visible={runActive && !isGameOver} />
      <SceneCanvas
        phase={phase}
        transitionCaptureMode={transitionCaptureMode}
        hasCompletedBootReveal={hasCompletedBootReveal}
        canvasDpr={canvasDpr}
        showGameWorld={showGameWorld}
        isTransitioning={isTransitioning}
        transitionDirection={transitionDirection}
        runActive={runActive}
        transitionProgressRef={transitionProgressRef}
        introDisabled={introDisabled}
        onStart={phase === PHASE_RESULTS ? handleRestart : handleStart}
        shouldMountGameWorld={shouldMountGameWorld}
        sceneActive={sceneActive}
        isGameOver={isGameOver}
        isCountdownActive={isCountdownActive}
        useOriginalMaterials={useOriginalMaterials}
        trailTargetRef={trailTarget}
        musicRef={musicRef}
        onJumpSfx={playJumpSfx}
        onLogHit={playDieSfx}
        isWarmingGameWorld={isWarmingGameWorld}
        onGameWorldPrimed={handleGameWorldPrimed}
        transitionSettings={transitionSettings}
        onTransitionComplete={handleTransitionComplete}
        introPost={introPost}
        gamePost={gamePost}
        transitionSnapshotTextureRef={transitionSnapshotTextureRef}
        capturedTransitionTexture={capturedTransitionTexture}
        shouldCaptureSceneRef={shouldCaptureSceneRef}
        onSceneCaptured={handleSceneCaptured}
        foliageSegmentCount={foliageSegmentCount}
        introScreenMode={introScreenMode}
        introSummary={introSummary}
        introButtonLabel={phase === PHASE_RESULTS ? 'PLAY AGAIN' : introButtonLabel}
        gpuTier={gpuTier}
        chromaticSpike={chromaticSpike}
        cameraMode={cameraMode}
        onDismissIntroScreen={() => setShowDeathFullscreen(false)}
        showIntroDismissButton={canDismissDeathFullscreen}
      />
    </>
  )
}
