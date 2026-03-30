import { memo, useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useProgress } from '@react-three/drei'
import IntroScene from './components/IntroScene'
import CameraRig from './components/CameraRig'
import GameOverScreen from './components/GameOverScreen'
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
  gameState,
  createIdleGrindState,
  createIdleGrindSparkState,
  emitHudScoreChange,
  isObstacleSpacingDebug,
  isTimingDebug,
  qualityMode,
  resetObstacleTargets,
} from './store'
import { useOptionalControls } from './lib/debugControls'
import {
  AUDIO_VISUAL_SYNC_OFFSET_SECONDS,
  BEAT_INTERVAL,
  getPerceivedMusicTime,
  TRACK_BEAT_PHASE_OFFSET_SECONDS,
} from './rhythm'

const COUNTDOWN_STEPS = ['1', '2', '3', 'GO!']
const EMPTY_SCORING_EVENT = { id: 0, points: 0, grade: 'Perfect', multiplier: 1, isRail: false, trickName: '' }
const AUTO_DPR = [1, 1.25]
const HIGH_DPR = [1, 2]
const QUIET_DPR = [1, 1]

const SceneCanvas = memo(function SceneCanvas({
  hasCompletedBootReveal,
  canvasDpr,
  showGameWorld,
  isTransitioning,
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
  onJumpTiming,
  onJumpSfx,
  onLogHit,
  isWarmingGameWorld,
  onGameWorldPrimed,
  transitionSettings,
  onTransitionComplete,
  introPost,
  gamePost,
  introSnapshotTextureRef,
  capturedIntroTexture,
  shouldCaptureIntroRef,
  onIntroCaptured,
  foliageSegmentCount,
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
      shadows={{ type: qualityMode === 'quiet' ? THREE.BasicShadowMap : THREE.PCFShadowMap }}
    >
      <SceneCapture
        shouldCaptureRef={shouldCaptureIntroRef}
        snapshotTextureRef={introSnapshotTextureRef}
        onCaptured={onIntroCaptured}
      />
      <CameraRig
        runActive={runActive}
        showGameWorld={showGameWorld}
        isTransitioning={isTransitioning}
        transitionProgressRef={transitionProgressRef}
      />
      {!showGameWorld && !isTransitioning && (
        <IntroScene
          onStart={onStart}
          disabled={introDisabled}
          buttonLabel="PRESS START"
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
          trailTargetRef={trailTargetRef}
          musicRef={musicRef}
          onJumpTiming={onJumpTiming}
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
        duration={transitionSettings.duration}
        onComplete={onTransitionComplete}
      />
      <PostEffects
        introSettings={introPost}
        gameSettings={gamePost}
        transitionSettings={transitionSettings}
        transitionProgressRef={transitionProgressRef}
        isTransitioning={isTransitioning}
        showGameWorld={showGameWorld}
        runActive={runActive}
        introTexture={capturedIntroTexture}
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
  const shouldCaptureIntroRef = useRef(false)
  const introSnapshotTextureRef = useRef(null)
  const hasQueuedWarmupRef = useRef(false)
  const [capturedIntroTexture, setCapturedIntroTexture] = useState(null)
  const [showGameWorld, setShowGameWorld] = useState(false)
  const [runActive, setRunActive] = useState(false)
  const [isGameWorldPrimed, setIsGameWorldPrimed] = useState(false)
  const [hasCompletedBootReveal, setHasCompletedBootReveal] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [timingFeedback, setTimingFeedback] = useState({ label: '', id: 0 })
  const [hasConfirmedMusicStart, setHasConfirmedMusicStart] = useState(false)
  const [isCountdownActive, setIsCountdownActive] = useState(false)
  const [countdownText, setCountdownText] = useState('')
  const [countdownAnimationKey, setCountdownAnimationKey] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const [useOriginalMaterials, setUseOriginalMaterials] = useState(true)
  const [isTransitionCapturePending, setIsTransitionCapturePending] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const transitionProgressRef = useRef(0)
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()
  const isAssetLoadComplete = !isLoadingAssets && loadingProgress >= 100
  const showLoadingOverlay = !hasCompletedBootReveal
  const shouldMountGameWorld = isAssetLoadComplete || isGameWorldPrimed || showGameWorld || runActive || isTransitioning
  const isWarmingGameWorld = showGameWorld && !isGameWorldPrimed && !runActive && !isTransitioning
  const sceneActive = runActive || isTransitioning
  const isTransitionBusy = isTransitionCapturePending || isTransitioning
  const canvasDpr = qualityMode === 'high' ? HIGH_DPR : qualityMode === 'quiet' ? QUIET_DPR : AUTO_DPR
  const foliageSegmentCount = qualityMode === 'quiet' ? 1 : 2

  const handleVolumePointerDone = useCallback((event) => {
    event.currentTarget.blur()
  }, [])

  const resetRunState = useCallback(({ speed = 0, speedLinesOn = false } = {}) => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = speed
    gameState.speedBoostActive = speed > 0
    gameState.speedLinesOn = speedLinesOn
    gameState.jumping = false
    gameState.streak.current = 0
    gameState.scoreMultiplier.current = 1
    gameState.pendingJumpTiming.current = null
    resetObstacleTargets()
    gameState.upArrowHeld.current = false
    gameState.activeGrind.current = createIdleGrindState()
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.timeScale.current = 1
    gameState.grindCooldownObstacleId.current = 0
    gameState.catHeight.current = 0.05
    gameState.lastScoringEvent.current = EMPTY_SCORING_EVENT
    gameState.screenShake.current = 0
    gameState.comboEnergy.current = 1
    gameState.timeOfDay.current = 0
    gameState.runDifficultyProgress.current = 0
    emitHudScoreChange()
  }, [])

  const handleReturnToIntro = useCallback(() => {
    hasStartedMusicRef.current = false
    shouldCaptureIntroRef.current = false
    setCapturedIntroTexture(null)
    if (musicRef.current) {
      musicRef.current.pause()
      musicRef.current.currentTime = 0
    }

    resetRunState()

    transitionProgressRef.current = 0
    setRunActive(false)
    setShowGameWorld(false)
    setIsGameOver(false)
    setHasConfirmedMusicStart(false)
    setIsCountdownActive(false)
    setCountdownText('')
    setIsTransitionCapturePending(false)
    setIsTransitioning(false)
    setTimingFeedback({ label: '', id: 0 })
  }, [resetRunState])

  const introPost = useOptionalControls(
    'Intro Post Processing',
    createPostProcessingControls(DEFAULT_INTRO_POST_SETTINGS)
  )
  const gamePost = useOptionalControls(
    'Post Processing',
    createPostProcessingControls(DEFAULT_GAME_POST_SETTINGS)
  )
  const transitionSettings = useOptionalControls('Intro Transition', {
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
  })
  const { timingOffsetMs, obstacleHitDelayMs, debugPlaybackRate } = useOptionalControls('Timing Debug', {
    timingOffsetMs: { value: 0, min: -300, max: 180, step: 1 },
    obstacleHitDelayMs: { value: 0, min: -180, max: 180, step: 1 },
    debugPlaybackRate: {
      value: 1,
      options: { '1x': 1, '0.75x': 0.75, '0.5x': 0.5, '0.25x': 0.25 },
    },
  }, [])

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
    if (!isAssetLoadComplete || isGameWorldPrimed || hasQueuedWarmupRef.current) return

    hasQueuedWarmupRef.current = true
    setUseOriginalMaterials(false)
    setShowGameWorld(true)
  }, [isAssetLoadComplete, isGameWorldPrimed])

  useEffect(() => {
    if (
      hasCompletedBootReveal ||
      !isGameWorldPrimed ||
      showGameWorld ||
      isTransitioning
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
  }, [hasCompletedBootReveal, isGameWorldPrimed, isTransitioning, showGameWorld])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (!event.shiftKey || event.key.toLowerCase() !== 'r') return
      if (!runActive && !isTransitionBusy) return
      event.preventDefault()
      handleReturnToIntro()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleReturnToIntro, isTransitionBusy, runActive])

  useEffect(() => {
    gameState.onGameOver = () => setIsGameOver(true)
  }, [])

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
  }, [debugPlaybackRate, runActive])

  useEffect(() => {
    if (!musicRef.current) return
    if (!runActive || isGameOver) {
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
  }, [isGameOver, runActive])

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
    gameState.speed.current = 8
    gameState.speedBoostActive = true
    gameState.speedLinesOn = true
    setIsGameOver(false)
    setRunActive(true)
    setTimingFeedback({ label: '', id: 0 })
  }, [])

  const handleGameWorldPrimed = useCallback(() => {
    setIsGameWorldPrimed(true)
    setShowGameWorld(false)
  }, [])

  const handleStart = useCallback(() => {
    if (!isGameWorldPrimed || isTransitionBusy) return

    resetRunState({ speed: 8, speedLinesOn: false })
    transitionProgressRef.current = 0
    setRunActive(false)
    setIsGameOver(false)
    setUseOriginalMaterials(false)
    setTimingFeedback({ label: '', id: 0 })
    shouldCaptureIntroRef.current = true
    setIsTransitionCapturePending(true)
  }, [isGameWorldPrimed, isTransitionBusy, resetRunState])

  const handleIntroCaptured = useCallback((introTexture) => {
    setCapturedIntroTexture(introTexture)
    setIsTransitionCapturePending(false)
    setShowGameWorld(true)
    setIsTransitioning(true)
    startMusicPlayback()
  }, [startMusicPlayback])

  const handleTransitionComplete = useCallback(() => {
    setIsTransitioning(false)
    activateRun()
  }, [activateRun])

  const handleRestart = useCallback(() => {
    resetRunState({ speed: 8, speedLinesOn: true })
    setIsGameOver(false)
    setRunActive(true)
    setShowGameWorld(true)
    setUseOriginalMaterials(false)
    setTimingFeedback({ label: '', id: 0 })
    startMusicPlayback()
  }, [resetRunState, startMusicPlayback])

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

  const loadingLabel = isAssetLoadComplete ? 'WARMING UP' : 'LOADING'
  const introDisabled = !isGameWorldPrimed || isTransitionBusy

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
      {(runActive || isTransitioning) && (
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
      <GameHud musicRef={musicRef} visible={runActive && !isGameOver} timingFeedback={timingFeedback} />
      <GameOverScreen visible={isGameOver} onRestart={handleRestart} />
      <SceneCanvas
        hasCompletedBootReveal={hasCompletedBootReveal}
        canvasDpr={canvasDpr}
        showGameWorld={showGameWorld}
        isTransitioning={isTransitioning}
        runActive={runActive}
        transitionProgressRef={transitionProgressRef}
        introDisabled={introDisabled}
        onStart={handleStart}
        shouldMountGameWorld={shouldMountGameWorld}
        sceneActive={sceneActive}
        isGameOver={isGameOver}
        isCountdownActive={isCountdownActive}
        useOriginalMaterials={useOriginalMaterials}
        trailTargetRef={trailTarget}
        musicRef={musicRef}
        onJumpTiming={handleJumpTiming}
        onJumpSfx={playJumpSfx}
        onLogHit={playDieSfx}
        isWarmingGameWorld={isWarmingGameWorld}
        onGameWorldPrimed={handleGameWorldPrimed}
        transitionSettings={transitionSettings}
        onTransitionComplete={handleTransitionComplete}
        introPost={introPost}
        gamePost={gamePost}
        introSnapshotTextureRef={introSnapshotTextureRef}
        capturedIntroTexture={capturedIntroTexture}
        shouldCaptureIntroRef={shouldCaptureIntroRef}
        onIntroCaptured={handleIntroCaptured}
        foliageSegmentCount={foliageSegmentCount}
      />
    </>
  )
}
