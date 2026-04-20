import { Suspense, memo, useRef, useState, useCallback, useEffect, useMemo } from 'react'
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
import CinematicLetterbox from './components/CinematicLetterbox'
import RotationPrompt from './components/RotationPrompt'
import TutorialOverlay from './components/TutorialOverlay'
import { hasCompletedTutorial, markTutorialCompleted } from './lib/tutorialStorage'
import useOrientation from './hooks/useOrientation'
import {
  createIntroOverlayControls,
  createPostProcessingControls,
  DEFAULT_INTRO_OVERLAY_SETTINGS,
  DEFAULT_INTRO_POST_SETTINGS,
  DEFAULT_GAME_POST_SETTINGS,
} from './lib/postProcessing'
import { createRenderProfile } from './lib/renderProfile'
import TimingDebugHud from './components/TimingDebugHud'
import ObstacleSpacingDebugHud from './components/ObstacleSpacingDebugHud'
import { createSharedAudioSession } from './audioSession'
import { createBufferedMusicTransport } from './audioTransport'
import { createSfxPlayer } from './sfxPlayer'
import {
  buildRunSummary,
  gameState,
  createAccuracyStats,
  createPerformanceStats,
  createEmptyScoringEvent,
  createIdleGrindState,
  createIdleGrindSparkState,
  emitHudScoreChange,
  getTargetRunSpeed,
  isObstacleSpacingDebug,
  isTimingDebug,
  MAX_RUN_LIVES,
  qualityMode,
  isSafari,
  resetExtraCatLoadState,
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
import { fetchLeaderboards, isHighScore, submitScore } from './lib/leaderboard'

const COUNTDOWN_STEPS = ['1', '2', '3', 'GO!']
const BOOT_PHASE_LOADING = 'loading'
const BOOT_PHASE_PRIMING = 'priming'
const BOOT_PHASE_REVEALING = 'revealing'
const BOOT_PHASE_ATTRACT = 'attract'
const START_PHASE_IDLE = 'idle'
const START_PHASE_ARMING = 'arming'
const START_PHASE_LAUNCHING = 'launching'
const PHASE_INTRO = 'intro'
const PHASE_TUTORIAL = 'tutorial'
const PHASE_LAUNCHING = 'launching'
const PHASE_RUNNING = 'running'
const PHASE_END_GLITCH = 'endGlitch'
const PHASE_RETURNING = 'returning'
const PHASE_RESULTS = 'results'
const CAPTURE_MODE_LAUNCH = 'launch'
const CAPTURE_MODE_RETURN = 'return'
const RETURN_SCREEN_TITLE = 'title'
const RETURN_SCREEN_SUMMARY = 'summary'
const END_GLITCH_DURATION_MS = 700
const LOADING_PHASE_MIN_MS = 950
const PRIMING_PHASE_MIN_MS = 700
const BOOT_REVEAL_DURATION_MS = 1100
const BOOT_ATTRACT_SETTLE_MS = 480
const START_CONFIRM_MS = 220
const FAILED_RETURN_DURATION_SECONDS = 1.6
const MAIN_MUSIC_VOLUME = 0.5

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

function shouldUseSafariGameplayContactShadows() {
  return isSafari
}

function BootOverlay({
  visible,
  opacity,
  phase,
  progress,
  statusLabel,
  detailLabel,
}) {
  if (!visible && opacity <= 0.001) return null

  const isSafari = shouldUseSafariGameplayContactShadows()
  const showProgress = phase === BOOT_PHASE_LOADING || phase === BOOT_PHASE_PRIMING
  const roundedProgress = Math.round(progress)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1.25rem, 3vw, 2.5rem)',
        opacity,
        pointerEvents: opacity > 0.15 ? 'auto' : 'none',
        transition: phase === BOOT_PHASE_REVEALING ? 'none' : 'opacity 240ms ease-out',
        background: isSafari
          ? 'linear-gradient(180deg, rgba(5, 6, 14, 0.97), rgba(4, 4, 10, 0.99))'
          : `
            radial-gradient(circle at 50% 18%, rgba(255, 188, 116, 0.18), transparent 36%),
            radial-gradient(circle at 50% 120%, rgba(80, 220, 255, 0.16), transparent 40%),
            linear-gradient(180deg, rgba(5, 6, 14, 0.86), rgba(4, 4, 10, 0.96))
          `,
        backdropFilter: isSafari ? 'none' : 'blur(16px)',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'Knewave',
            fontSize: 'clamp(2.2rem, 7vw, 4rem)',
            letterSpacing: '0.05em',
            color: '#fff7d5',
            textShadow: '0 0 30px rgba(255, 209, 102, 0.2)',
          }}
        >
          Skate Cat
        </div>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '14px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '2px auto 2px 2px',
              width: `${clamp01(progress / 100) * 100}%`,
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #7cf7ff, #ffd166 55%, #ff8db3)',
              boxShadow: '0 0 20px rgba(124, 247, 255, 0.35)',
              transition: 'width 140ms ease-out',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: '32%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)',
                animation: 'loadingBarShine 1.2s linear infinite',
              }}
            />
          </div>
        </div>

        <div
          style={{
            fontFamily: 'Nunito, sans-serif',
            color: 'rgba(255,255,255,0.8)',
            fontSize: '0.78rem',
            fontWeight: 900,
            letterSpacing: '0.18em',
          }}
        >
          {showProgress ? `${roundedProgress}% · ${statusLabel}` : statusLabel}
        </div>

        <div
          style={{
            maxWidth: '34rem',
            fontFamily: 'Nunito, sans-serif',
            color: 'rgba(255,255,255,0.52)',
            fontSize: '0.8rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}
        >
          {detailLabel}
        </div>
      </div>
    </div>
  )
}

const SceneCanvas = memo(function SceneCanvas({
  phase,
  transitionCaptureMode,
  bootVisualMix,
  canvasDpr,
  showGameWorld,
  isTransitioning,
  transitionDirection,
  runActive,
  transitionProgressRef,
  showIntroOverlay,
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
  onPlopSfx,
  isWarmingGameWorld,
  onGameWorldPrimed,
  transitionSettings,
  onTransitionComplete,
  introPost,
  introOverlaySettings,
  gamePost,
  transitionSnapshotTextureRef,
  capturedTransitionTexture,
  shouldCaptureSceneRef,
  onSceneCaptured,
  foliageSegmentCount,
  introScreenMode,
  introSummary,
  introButtonLabel,
  introInstructionLabel,
  gpuTier,
  quality,
  gameplayShadowMode,
  chromaticSpike,
  cameraMode,
  onDismissIntroScreen,
  showIntroDismissButton,
  bootStatusLabel,
  bootDisplayedProgress,
  bootReady,
  highScore,
  leaderboards,
  leaderboardTab,
  initialsEntry,
  onAction,
  reverseTransitionDuration,
  renderProfile,
}) {
  const statsParentRef = useRef(null)

  return (
    <>
      {debugControlsEnabled && (
        <div
          ref={statsParentRef}
          style={{
            position: 'fixed',
            top: '0.75rem',
            left: '0.75rem',
            zIndex: 1400,
          }}
        />
      )}
      <Canvas
        dpr={canvasDpr}
        style={{
          width: '100vw',
          height: '100vh',
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          powerPreference: 'high-performance',
          antialias: renderProfile.antialias,
        }}
        shadows={renderProfile.useShadowMaps ? { type: renderProfile.shadowType } : false}
      >
        {debugControlsEnabled && <StatsGl parent={statsParentRef} />}
        <SceneCapture
          shouldCaptureRef={shouldCaptureSceneRef}
          snapshotTextureRef={transitionSnapshotTextureRef}
          onCaptured={onSceneCaptured}
          skipCapture={renderProfile.skipSceneCapture}
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
            onAction={onAction}
            quality={quality}
            disabled={introDisabled}
            buttonLabel={introButtonLabel}
            instructionLabel={introInstructionLabel}
            screenMode={introScreenMode}
            summary={introSummary}
            showDismissButton={showIntroDismissButton}
            bootVisualMix={bootVisualMix}
            bootStatusLabel={bootStatusLabel}
            bootProgress={bootDisplayedProgress}
            bootReady={bootReady}
            highScore={highScore}
            leaderboards={leaderboards}
            leaderboardTab={leaderboardTab}
            initialsEntry={initialsEntry}
            renderProfile={renderProfile}
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
            quality={quality}
            trailTargetRef={trailTargetRef}
            musicRef={musicRef}
            onJumpSfx={onJumpSfx}
            onLogHit={onLogHit}
            onPlopSfx={onPlopSfx}
            foliageSegmentCount={foliageSegmentCount}
            shadowMode={gameplayShadowMode}
            renderProfile={renderProfile}
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
          duration={transitionDirection === 'reverse' ? reverseTransitionDuration : transitionSettings.duration}
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
          showIntroOverlay={showIntroOverlay}
          runActive={runActive}
          capturedTexture={capturedTransitionTexture}
          gpuTier={gpuTier}
          quality={quality}
          chromaticSpike={chromaticSpike}
          introOverlaySettings={introOverlaySettings}
          renderProfile={renderProfile}
          introScreenMode={introScreenMode}
        />
      </Canvas>
    </>
  )
})

export default function App() {
  const trailTarget = useRef()
  const audioSessionRef = useRef(null)
  const musicRef = useRef(null)
  const sfxPlayerRef = useRef(null)
  const hasStartedMusicRef = useRef(false)
  const pendingLaunchActivationRef = useRef(false)
  const lifecyclePauseRef = useRef(false)
  const handleSongCompleteRef = useRef(() => { })
  const endGlitchTimeoutRef = useRef(0)
  const startArmingTimeoutRef = useRef(0)
  const bootPhaseEnteredAtRef = useRef(0)
  const shouldCaptureSceneRef = useRef(false)
  const transitionSnapshotTextureRef = useRef(null)
  const transitionCaptureModeRef = useRef(null)
  const tutorialAutoStartRef = useRef(false)
  const [capturedTransitionTexture, setCapturedTransitionTexture] = useState(null)
  const [phase, setPhase] = useState(PHASE_INTRO)
  const [bootPhase, setBootPhase] = useState(BOOT_PHASE_LOADING)
  const [bootVisualMix, setBootVisualMix] = useState(0)
  const [displayedBootProgress, setDisplayedBootProgress] = useState(0)
  const [musicLoadState, setMusicLoadState] = useState('pending')
  const [hasSettledAttractScreen, setHasSettledAttractScreen] = useState(false)
  const [startPhase, setStartPhase] = useState(START_PHASE_IDLE)
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [transitionCaptureMode, setTransitionCaptureMode] = useState(null)
  const [returnScreenMode, setReturnScreenMode] = useState(RETURN_SCREEN_SUMMARY)
  const [leaderboards, setLeaderboards] = useState({ daily: [], weekly: [], alltime: [] })
  const [leaderboardTab, setLeaderboardTab] = useState('daily')
  useEffect(() => {
    let cancelled = false
    fetchLeaderboards().then(boards => {
      if (!cancelled) setLeaderboards(boards)
    })
    return () => { cancelled = true }
  }, [])
  const [initialsEntry, setInitialsEntry] = useState(null)
  const [tvScreenOverride, setTvScreenOverride] = useState(null)
  const [needsTutorial, setNeedsTutorial] = useState(() => !hasCompletedTutorial())
  const [isEndingLocked, setIsEndingLocked] = useState(false)
  const [isGameWorldPrimed, setIsGameWorldPrimed] = useState(false)
  const [showDeathFullscreen, setShowDeathFullscreen] = useState(false)
  const [audioStartFailure, setAudioStartFailure] = useState(false)
  const [hasConfirmedMusicStart, setHasConfirmedMusicStart] = useState(false)
  const [isCountdownActive, setIsCountdownActive] = useState(false)
  const [countdownText, setCountdownText] = useState('')
  const [countdownAnimationKey, setCountdownAnimationKey] = useState(0)
  const [useOriginalMaterials] = useState(false)
  const transitionProgressRef = useRef(0)
  const returnFreezeDurationRef = useRef(0.2)
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()
  const { isTouchDevice, shouldBlock: orientationBlocked } = useOrientation()
  const isAssetLoadComplete = !isLoadingAssets && loadingProgress >= 100
  const isMusicReady = musicLoadState === 'ready'
  const isMusicLoadSettled = musicLoadState !== 'pending'
  const showBootOverlay = bootPhase !== BOOT_PHASE_ATTRACT || bootVisualMix < 0.999
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
  const detectedQuality = gpuTier.tier === 0 ? 'quiet'
    : gpuTier.tier === 1 ? 'quiet'
      : gpuTier.tier === 2 ? 'auto'
        : 'high'
  // GPU-aware quality: URL param overrides auto-detection.
  const effectiveQuality = qualityMode !== 'auto'
    ? qualityMode
    : detectedQuality
  const renderProfile = useMemo(() => createRenderProfile({
    qualityMode,
    effectiveQuality,
    gpuTier,
    isTouchDevice,
    isSafari,
  }), [effectiveQuality, gpuTier, isTouchDevice])
  const canvasDpr = renderProfile.canvasDpr
  const foliageSegmentCount = renderProfile.foliageSegmentCount
  const gameplayShadowMode = renderProfile.shadowMode
  const currentRunSummary = gameState.lastRunSummary.current
  const currentOutcome = currentRunSummary?.outcome ?? null
  const isReturnScreenActive = phase === PHASE_RETURNING || phase === PHASE_RESULTS
  const bootProgressTarget = (
    (isAssetLoadComplete ? 72 : clamp01(loadingProgress / 100) * 72) +
    (isGameWorldPrimed ? 18 : 0) +
    (isMusicLoadSettled ? 10 : 0)
  )
  const introStartEnabled = (
    phase === PHASE_INTRO &&
    bootPhase === BOOT_PHASE_ATTRACT &&
    hasSettledAttractScreen &&
    isGameWorldPrimed &&
    isMusicReady &&
    !isTransitionBusy &&
    startPhase === START_PHASE_IDLE &&
    !tvScreenOverride
  )
  const introScreenMode = tvScreenOverride ?? (isReturnScreenActive ? returnScreenMode : RETURN_SCREEN_TITLE)
  const showAudioRetryPrompt = audioStartFailure && introScreenMode === RETURN_SCREEN_TITLE && !isReturnScreenActive
  const highScore = leaderboards.alltime.length > 0 ? leaderboards.alltime[0].score : 0
  const introButtonLabel = startPhase !== START_PHASE_IDLE
    ? 'STARTING RUN'
    : showAudioRetryPrompt
      ? 'TAP AGAIN'
      : introScreenMode === 'leaderboard' ? 'BACK'
        : introScreenMode === 'initials' ? 'OK'
          : introScreenMode === RETURN_SCREEN_SUMMARY ? 'PLAY AGAIN' : 'PRESS START'
  const introSummary = introScreenMode === RETURN_SCREEN_SUMMARY ? currentRunSummary : null
  const chromaticSpike = isPreReturnGlitching ? 1 : 0
  const shouldUseDeathCamera = (
    isPreReturnGlitching &&
    introScreenMode === RETURN_SCREEN_SUMMARY &&
    currentOutcome === 'failed' &&
    showDeathFullscreen
  )
  const cameraMode = shouldUseDeathCamera
    ? 'death'
    : introScreenMode === 'leaderboard' || introScreenMode === 'initials'
      ? 'leaderboard'
      : isReturnScreenActive && introScreenMode === RETURN_SCREEN_SUMMARY && currentOutcome === 'failed'
        ? 'failed'
        : isReturnScreenActive && introScreenMode === RETURN_SCREEN_SUMMARY && currentOutcome !== 'failed'
          ? 'results'
          : 'intro'
  const canDismissResultsSummary = (
    phase === PHASE_RESULTS &&
    introScreenMode === RETURN_SCREEN_SUMMARY
  )
  const bootOverlayOpacity = bootPhase === BOOT_PHASE_REVEALING ? 1 - bootVisualMix : bootPhase === BOOT_PHASE_ATTRACT ? 0 : 1
  const bootStatusLabel = bootPhase === BOOT_PHASE_LOADING
    ? 'LOADING CARTRIDGE'
    : bootPhase === BOOT_PHASE_PRIMING
      ? 'SYNCING STAGE'
      : bootPhase === BOOT_PHASE_REVEALING
        ? 'POWERING CRT ROOM'
        : showAudioRetryPrompt && isMusicReady
          ? 'TAP AGAIN'
          : isMusicReady
            ? 'PRESS START'
            : 'AUDIO DECK OFFLINE'
  const bootStatusDetail = bootPhase === BOOT_PHASE_LOADING
    ? 'Streaming room assets and preparing the attract scene.'
    : bootPhase === BOOT_PHASE_PRIMING
      ? isMusicLoadSettled
        ? isMusicReady
          ? 'Stage geometry and audio transport are locked in.'
          : 'Video is ready, but the audio deck failed to lock.'
        : 'Warming gameplay systems and locking the music transport.'
      : bootPhase === BOOT_PHASE_REVEALING
        ? 'Handing off from platform boot to the in-world cabinet.'
        : showAudioRetryPrompt && isMusicReady
          ? 'Audio needs one more tap before Web Audio unlocks on this device.'
          : isMusicReady
            ? 'Cabinet is live. Space or Enter drops you in.'
            : 'Title is up, but start remains locked until audio is available.'
  const introInstructionLabel = startPhase === START_PHASE_ARMING
    ? 'SPINNING UP STAGE'
    : startPhase === START_PHASE_LAUNCHING
      ? 'DROPPING IN'
      : showAudioRetryPrompt
        ? 'TAP AGAIN TO ENABLE AUDIO'
        : introScreenMode === RETURN_SCREEN_SUMMARY
          ? (isTouchDevice ? '' : 'SPACE / ENTER TO PLAY AGAIN')
          : isMusicReady
            ? (isTouchDevice ? '' : 'SPACE / ENTER TO SHRED')
            : 'AUDIO DECK OFFLINE'
  const introDisabled = tvScreenOverride
    ? false
    : isReturnScreenActive
      ? isTransitionBusy || phase === PHASE_RETURNING || startPhase !== START_PHASE_IDLE
      : !introStartEnabled
  const showIntroOverlay = phase === PHASE_INTRO || phase === PHASE_RESULTS

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
    gameState.performanceStats.current = createPerformanceStats()
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
    resetExtraCatLoadState()
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

  const createHighScoreEntry = useCallback((summary) => ({
    initials: ['A', 'A', 'A'],
    cursorPos: 0,
    score: summary.totalScore,
    rank: summary.rank,
  }), [])

  const queueReturnToIntro = useCallback(({ summary = null, screenMode = RETURN_SCREEN_SUMMARY } = {}) => {
    if (phase !== PHASE_RUNNING || isGameOver || isTransitionBusy || isEndingLocked) return

    const shouldShowHighScoreEntry = (
      screenMode === RETURN_SCREEN_SUMMARY &&
      summary &&
      isHighScore(summary.totalScore, leaderboards.daily)
    )

    setReturnScreenMode(screenMode)
    gameState.lastRunSummary.current = screenMode === RETURN_SCREEN_SUMMARY ? summary : null
    setTvScreenOverride(shouldShowHighScoreEntry ? 'initials' : null)
    setInitialsEntry(shouldShowHighScoreEntry ? createHighScoreEntry(summary) : null)
    transitionProgressRef.current = 0
    setTransitionDirection('reverse')
    setIsEndingLocked(true)
    setShowDeathFullscreen(screenMode === RETURN_SCREEN_SUMMARY && summary?.outcome === 'failed')
    resetExtraCatLoadState()
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
  }, [clearPlaybackState, createHighScoreEntry, isEndingLocked, isGameOver, isTransitionBusy, leaderboards, phase])

  const handleReturnToIntro = useCallback(() => {
    window.clearTimeout(endGlitchTimeoutRef.current)
    window.clearTimeout(startArmingTimeoutRef.current)
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
    setStartPhase(START_PHASE_IDLE)
    setPhase(PHASE_INTRO)
  }, [clearPlaybackState, resetRunState])

  useEffect(() => () => {
    window.clearTimeout(endGlitchTimeoutRef.current)
    window.clearTimeout(startArmingTimeoutRef.current)
  }, [])

  const introPost = useOptionalControls(
    'Intro',
    { 'Post Processing': folder(createPostProcessingControls(DEFAULT_INTRO_POST_SETTINGS), { collapsed: true }) }
  )
  const introOverlaySettings = useOptionalControls(
    'Intro',
    { 'Screen Overlay': folder(createIntroOverlayControls(DEFAULT_INTRO_OVERLAY_SETTINGS), { collapsed: true }) }
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
    }, { collapsed: true }),
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
    }, { collapsed: true }),
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
  const reverseTransitionDuration = (
    currentOutcome === 'failed'
      ? FAILED_RETURN_DURATION_SECONDS
      : transitionSettings.reverseDuration
  )

  useEffect(() => {
    returnFreezeDurationRef.current = transitionSettings.returnFreezeDuration
  }, [transitionSettings.returnFreezeDuration])

  useEffect(() => {
    let cancelled = false
    const session = createSharedAudioSession()
    audioSessionRef.current = session
    const music = createBufferedMusicTransport('/audio/music/skate-cat-2.mp3', { session })
    music.volume = MAIN_MUSIC_VOLUME
    music.onEnded = () => handleSongCompleteRef.current()
    musicRef.current = music
    void music.preload()
      .then(() => {
        if (!cancelled) {
          setMusicLoadState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMusicLoadState('failed')
        }
      })

    const sfx = createSfxPlayer({
      jump: '/audio/sfx/jump.wav',
      jump2: '/audio/sfx/jump2.wav',
      die: '/audio/sfx/die.wav',
      click: '/audio/sfx/click.wav',
      plop: '/audio/sfx/plop.wav',
      changeChannel: '/audio/sfx/change-channel.wav',
    }, { session })
    sfxPlayerRef.current = sfx
    void sfx.preload()

    return () => {
      cancelled = true
      hasStartedMusicRef.current = false
      pendingLaunchActivationRef.current = false
      lifecyclePauseRef.current = false
      if (audioSessionRef.current === session) {
        audioSessionRef.current = null
      }
      if (musicRef.current === music) {
        musicRef.current = null
      }
      music.dispose()
      if (sfxPlayerRef.current === sfx) {
        sfxPlayerRef.current = null
      }
      sfx.dispose()
      session.dispose()
    }
  }, [])

  useEffect(() => {
    bootPhaseEnteredAtRef.current = performance.now()

    if (bootPhase === BOOT_PHASE_REVEALING) {
      let animationFrameId = 0
      const startedAt = performance.now()

      const animateReveal = () => {
        const elapsed = performance.now() - startedAt
        const progress = clamp01(elapsed / BOOT_REVEAL_DURATION_MS)
        setBootVisualMix(progress)

        if (progress >= 1) {
          setBootPhase(BOOT_PHASE_ATTRACT)
          return
        }

        animationFrameId = window.requestAnimationFrame(animateReveal)
      }

      animationFrameId = window.requestAnimationFrame(animateReveal)
      return () => window.cancelAnimationFrame(animationFrameId)
    }

    if (bootPhase === BOOT_PHASE_ATTRACT) {
      const settleTimeout = window.setTimeout(() => {
        setHasSettledAttractScreen(true)
      }, BOOT_ATTRACT_SETTLE_MS)
      return () => window.clearTimeout(settleTimeout)
    }

    return undefined
  }, [bootPhase])

  useEffect(() => {
    if (bootPhase !== BOOT_PHASE_LOADING || !isAssetLoadComplete) return undefined

    const elapsed = performance.now() - bootPhaseEnteredAtRef.current
    const timeout = window.setTimeout(() => {
      setBootPhase(BOOT_PHASE_PRIMING)
    }, Math.max(0, LOADING_PHASE_MIN_MS - elapsed))

    return () => window.clearTimeout(timeout)
  }, [bootPhase, isAssetLoadComplete])

  useEffect(() => {
    if (
      bootPhase !== BOOT_PHASE_PRIMING ||
      !isAssetLoadComplete ||
      !isGameWorldPrimed ||
      !isMusicLoadSettled
    ) {
      return undefined
    }

    const elapsed = performance.now() - bootPhaseEnteredAtRef.current
    const timeout = window.setTimeout(() => {
      setBootPhase(BOOT_PHASE_REVEALING)
    }, Math.max(0, PRIMING_PHASE_MIN_MS - elapsed))

    return () => window.clearTimeout(timeout)
  }, [bootPhase, isAssetLoadComplete, isGameWorldPrimed, isMusicLoadSettled])

  useEffect(() => {
    if (bootPhase === BOOT_PHASE_ATTRACT && displayedBootProgress >= 99.5) return undefined

    const intervalId = window.setInterval(() => {
      setDisplayedBootProgress((current) => {
        const target = bootPhase === BOOT_PHASE_REVEALING || bootPhase === BOOT_PHASE_ATTRACT
          ? 100
          : bootProgressTarget
        const delta = target - current
        if (Math.abs(delta) < 0.3) return target
        return current + delta * (bootPhase === BOOT_PHASE_LOADING ? 0.14 : 0.18)
      })
    }, 50)

    return () => window.clearInterval(intervalId)
  }, [bootPhase, bootProgressTarget, displayedBootProgress])

  useEffect(() => {
    if (!debugControlsEnabled) return undefined

    const onKeyDown = (event) => {
      if (event.repeat) return
      if (canDismissResultsSummary && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        setShowDeathFullscreen(false)
        setReturnScreenMode(RETURN_SCREEN_TITLE)
        return
      }

      const isResetShortcut = (
        event.key.toLowerCase() === 'r' &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
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
  }, [canDismissResultsSummary, handleReturnToIntro, isTransitionBusy, phase, queueReturnToIntro, runActive])

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
      musicRef.current.play().catch(() => {
        hasStartedMusicRef.current = false
        setAudioStartFailure(true)
      })
    }
  }, [isGameOver, phase])

  const pauseStateRef = useRef({ active: false, savedTimeScale: 1 })

  useEffect(() => {
    const pauseState = pauseStateRef.current
    if (orientationBlocked && !pauseState.active) {
      pauseState.active = true
      pauseState.savedTimeScale = gameState.timeScale.current ?? 1
      gameState.timeScale.current = 0
      gameState.paused = true
      if (musicRef.current && !musicRef.current.paused) {
        musicRef.current.pause()
      }
    } else if (!orientationBlocked && pauseState.active) {
      pauseState.active = false
      gameState.timeScale.current = pauseState.savedTimeScale
      gameState.paused = false
      if (
        musicRef.current
        && hasStartedMusicRef.current
        && !isGameOver
        && (phase === PHASE_RUNNING || phase === PHASE_LAUNCHING)
      ) {
        musicRef.current.play().catch(() => {
          hasStartedMusicRef.current = false
          setAudioStartFailure(true)
        })
      }
    }
  }, [orientationBlocked, phase, isGameOver])

  useEffect(() => {
    const session = audioSessionRef.current
    if (!session) return undefined

    const resumeAudioFromLifecycle = () => {
      void session.resumeFromLifecycle()
        .then(() => {
          if (
            lifecyclePauseRef.current &&
            musicRef.current &&
            hasStartedMusicRef.current &&
            !orientationBlocked &&
            !isGameOver &&
            (phase === PHASE_RUNNING || phase === PHASE_LAUNCHING)
          ) {
            lifecyclePauseRef.current = false
            return musicRef.current.play().catch(() => {
              hasStartedMusicRef.current = false
              setAudioStartFailure(true)
            })
          }

          lifecyclePauseRef.current = false
          return null
        })
        .catch(() => {
          setAudioStartFailure(true)
        })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (musicRef.current && hasStartedMusicRef.current && !musicRef.current.paused) {
          musicRef.current.pause()
          lifecyclePauseRef.current = true
        }
        return
      }

      resumeAudioFromLifecycle()
    }

    const handlePageShow = () => {
      resumeAudioFromLifecycle()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [isGameOver, orientationBlocked, phase])

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

  const activateRun = useCallback(() => {
    pendingLaunchActivationRef.current = false
    gameState.speed.current = getTargetRunSpeed()
    gameState.speedBoostActive = false
    gameState.speedLinesOn = true
    setAudioStartFailure(false)
    setIsEndingLocked(false)
    setStartPhase(START_PHASE_IDLE)
    setPhase(PHASE_RUNNING)
  }, [])

  const startMusicPlayback = useCallback(async () => {
    const music = musicRef.current
    const session = audioSessionRef.current
    if (!music) return false

    hasStartedMusicRef.current = false
    setHasConfirmedMusicStart(false)
    setIsCountdownActive(false)
    setCountdownText('')
    setAudioStartFailure(false)

    music.pause()
    music.currentTime = 0
    try {
      await session?.resumeFromLifecycle()
      await music.play()
      void sfxPlayerRef.current?.prepare()
      hasStartedMusicRef.current = true
      setHasConfirmedMusicStart(true)
      setIsCountdownActive(true)
      setCountdownText(COUNTDOWN_STEPS[0])
      if (pendingLaunchActivationRef.current) {
        activateRun()
      }
      return true
    } catch {
      hasStartedMusicRef.current = false
      pendingLaunchActivationRef.current = false
      setStartPhase(START_PHASE_IDLE)
      setAudioStartFailure(true)
      return false
    }
  }, [activateRun])

  const prepareRunForLaunch = useCallback(() => {
    pendingLaunchActivationRef.current = false
    resetRunState({ speed: getTargetRunSpeed(), speedLinesOn: true })
    setAudioStartFailure(false)
    setIsEndingLocked(false)
    setShowDeathFullscreen(false)
    gameState.lastRunSummary.current = null
    setTvScreenOverride(null)
    setInitialsEntry(null)
  }, [resetRunState])

  const handleGameWorldPrimed = useCallback(() => {
    setIsGameWorldPrimed(true)
  }, [])

  const startLaunchTransition = useCallback(() => {
    transitionProgressRef.current = 0
    setCapturedTransitionTexture(null)
    setTransitionDirection('forward')
    shouldCaptureSceneRef.current = true
    transitionCaptureModeRef.current = CAPTURE_MODE_LAUNCH
    setTransitionCaptureMode(CAPTURE_MODE_LAUNCH)
  }, [])

  const queueLaunchStart = useCallback((launchAction) => {
    if (startPhase !== START_PHASE_IDLE || isTransitionBusy) return

    // iOS unlocks Web Audio only during a user gesture. queueLaunchStart runs
    // directly in the tap handler; startMusicPlayback runs later after a
    // setTimeout + scene capture, past the gesture window.
    pendingLaunchActivationRef.current = false
    setAudioStartFailure(false)
    void audioSessionRef.current?.unlockFromGesture().catch(() => {
      setAudioStartFailure(true)
    })
    void sfxPlayerRef.current?.prepare()
    musicRef.current?.prepare()

    window.clearTimeout(startArmingTimeoutRef.current)
    setStartPhase(START_PHASE_ARMING)
    startArmingTimeoutRef.current = window.setTimeout(() => {
      setStartPhase(START_PHASE_LAUNCHING)
      launchAction()
    }, START_CONFIRM_MS)
  }, [isTransitionBusy, startPhase])

  const handleStart = useCallback(() => {
    if (!introStartEnabled) return
    if (needsTutorial && !isReturnScreenActive) {
      tutorialAutoStartRef.current = true
      setPhase(PHASE_TUTORIAL)
      return
    }
    queueLaunchStart(startLaunchTransition)
  }, [introStartEnabled, needsTutorial, isReturnScreenActive, queueLaunchStart, startLaunchTransition])

  const handleTutorialSkip = useCallback(() => {
    tutorialAutoStartRef.current = false
    markTutorialCompleted()
    setNeedsTutorial(false)
    setPhase(PHASE_INTRO)
  }, [])

  const handleTutorialComplete = useCallback(({ fromGesture = false } = {}) => {
    const shouldAutoStart = tutorialAutoStartRef.current
    tutorialAutoStartRef.current = false
    markTutorialCompleted()
    setNeedsTutorial(false)
    setPhase(PHASE_INTRO)
    if (shouldAutoStart && (!isTouchDevice || fromGesture)) {
      queueLaunchStart(startLaunchTransition)
    }
  }, [isTouchDevice, queueLaunchStart, startLaunchTransition])

  const handleSceneCaptured = useCallback((sceneTexture) => {
    const captureMode = transitionCaptureModeRef.current
    setCapturedTransitionTexture(sceneTexture)
    transitionCaptureModeRef.current = null
    setTransitionCaptureMode(null)

    if (captureMode === CAPTURE_MODE_LAUNCH) {
      prepareRunForLaunch()
      setPhase(PHASE_LAUNCHING)
      void startMusicPlayback().then((didStart) => {
        if (didStart) return
        transitionProgressRef.current = 0
        setCapturedTransitionTexture(null)
        setPhase(PHASE_INTRO)
      })
      return
    }

    if (captureMode === CAPTURE_MODE_RETURN) {
      setPhase(PHASE_RETURNING)
    }
  }, [prepareRunForLaunch, startMusicPlayback])

  const handleTransitionComplete = useCallback(() => {
    if (transitionDirection === 'reverse') {
      if (returnScreenMode === RETURN_SCREEN_TITLE) {
        handleReturnToIntro()
        return
      }

      setStartPhase(START_PHASE_IDLE)
      setPhase(PHASE_RESULTS)
      setIsEndingLocked(false)
      return
    }

    if (!hasStartedMusicRef.current) {
      pendingLaunchActivationRef.current = true
      return
    }

    activateRun()
  }, [
    activateRun,
    handleReturnToIntro,
    returnScreenMode,
    transitionDirection,
  ])

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
    queueLaunchStart(startLaunchTransition)
  }, [queueLaunchStart, startLaunchTransition])

  // Leaderboard: set screen mode directly (TvScreen handles the smooth CRT transition)
  const flipToScreen = useCallback((targetMode) => {
    sfxPlayerRef.current?.play('changeChannel', 0.5)
    setTvScreenOverride(targetMode)
  }, [])

  const handleTvAction = useCallback((action, payload) => {
    if (action === 'highscores') {
      flipToScreen('leaderboard')
      return
    }
    if (action === 'tutorial') {
      tutorialAutoStartRef.current = false
      setPhase(PHASE_TUTORIAL)
      return
    }
    if (action === 'back') {
      flipToScreen(null)
      return
    }
    if (action === 'letterUp') {
      setInitialsEntry(prev => {
        if (!prev) return prev
        const next = [...prev.initials]
        const code = next[prev.cursorPos].charCodeAt(0)
        next[prev.cursorPos] = String.fromCharCode(code >= 90 ? 65 : code + 1) // A-Z wrap
        return { ...prev, initials: next }
      })
      return
    }
    if (action === 'letterDown') {
      setInitialsEntry(prev => {
        if (!prev) return prev
        const next = [...prev.initials]
        const code = next[prev.cursorPos].charCodeAt(0)
        next[prev.cursorPos] = String.fromCharCode(code <= 65 ? 90 : code - 1)
        return { ...prev, initials: next }
      })
      return
    }
    if (action === 'cursorLeft') {
      setInitialsEntry(prev => prev ? { ...prev, cursorPos: Math.max(0, prev.cursorPos - 1) } : prev)
      return
    }
    if (action === 'cursorRight') {
      setInitialsEntry(prev => prev ? { ...prev, cursorPos: Math.min(2, prev.cursorPos + 1) } : prev)
      return
    }
    if (action === 'letterDirect') {
      setInitialsEntry(prev => {
        if (!prev) return prev
        const next = [...prev.initials]
        next[prev.cursorPos] = payload
        return { ...prev, initials: next, cursorPos: Math.min(2, prev.cursorPos + 1) }
      })
      return
    }
    if (action === 'slotSelect') {
      setInitialsEntry(prev => prev ? { ...prev, cursorPos: Math.max(0, Math.min(2, payload)) } : prev)
      return
    }
    if (action === 'confirmInitials') {
      if (!initialsEntry) return
      submitScore(
        initialsEntry.initials.join(''),
        initialsEntry.score,
        initialsEntry.rank,
      ).then(setLeaderboards)
      setInitialsEntry(null)
      setTvScreenOverride(null)
      setReturnScreenMode(RETURN_SCREEN_SUMMARY)
      return
    }
    if (action === 'selectLeaderboardTab') {
      if (payload === 'daily' || payload === 'weekly' || payload === 'alltime') {
        setLeaderboardTab(payload)
      }
      return
    }
    if (action === 'cycleLeaderboardTab') {
      const order = ['daily', 'weekly', 'alltime']
      setLeaderboardTab(prev => {
        const idx = Math.max(0, order.indexOf(prev))
        const delta = payload === -1 ? -1 : 1
        return order[(idx + delta + order.length) % order.length]
      })
      return
    }
  }, [initialsEntry, flipToScreen])

  const playJumpSfx = useCallback(() => {
    const player = sfxPlayerRef.current
    if (!player) return
    player.play('jump', 0.18)
    player.play('jump2', 0.18)
  }, [])

  const playDieSfx = useCallback(() => {
    sfxPlayerRef.current?.play('die', 0.24)
  }, [])

  const playPlopSfx = useCallback(() => {
    sfxPlayerRef.current?.play('plop', 0.5)
  }, [])

  const suppressClickSfxRef = useRef(false)
  useEffect(() => {
    suppressClickSfxRef.current = isTouchDevice && runActive
  }, [isTouchDevice, runActive])

  useEffect(() => {
    const handleGlobalClick = () => {
      if (suppressClickSfxRef.current) return
      sfxPlayerRef.current?.play('click', 0.25)
    }
    window.addEventListener('pointerdown', handleGlobalClick)
    return () => {
      window.removeEventListener('pointerdown', handleGlobalClick)
    }
  }, [])

  return (
    <>
      <BootOverlay
        visible={showBootOverlay}
        opacity={bootOverlayOpacity}
        phase={bootPhase}
        progress={displayedBootProgress}
        statusLabel={bootStatusLabel}
        detailLabel={bootStatusDetail}
      />
      <CinematicLetterbox
        active={
          !isTouchDevice
          && bootPhase === BOOT_PHASE_ATTRACT
          && cameraMode === 'intro'
          && (phase === PHASE_INTRO || phase === PHASE_RESULTS)
        }
      />
      <RotationPrompt shouldBlock={orientationBlocked} />
      <TutorialOverlay
        active={phase === PHASE_TUTORIAL}
        isTouchDevice={isTouchDevice}
        onSkip={handleTutorialSkip}
        onComplete={handleTutorialComplete}
      />
      {isTouchDevice && introScreenMode === 'initials' && initialsEntry && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.2rem)',
            zIndex: 1400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            pointerEvents: 'none',
          }}
        >
          <input
            autoFocus
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={3}
            value={initialsEntry.initials.join('')}
            placeholder="TAP TO TYPE"
            onChange={(e) => {
              const cleaned = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
              const next = ['A', 'A', 'A']
              for (let i = 0; i < cleaned.length; i++) next[i] = cleaned[i]
              setInitialsEntry(prev => prev ? {
                ...prev,
                initials: next,
                cursorPos: Math.min(2, cleaned.length),
              } : prev)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
                handleTvAction('confirmInitials')
              }
            }}
            style={{
              width: 'min(70%, 260px)',
              fontFamily: 'Knewave, cursive',
              fontSize: '2.2rem',
              textAlign: 'center',
              letterSpacing: '0.45rem',
              textTransform: 'uppercase',
              padding: '0.5rem 0.75rem',
              borderRadius: '14px',
              border: '2px solid rgba(124, 247, 255, 0.75)',
              background: 'rgba(18, 10, 34, 0.92)',
              color: '#ffffff',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(124, 247, 255, 0.35)',
              outline: 'none',
              pointerEvents: 'auto',
            }}
          />
          <button
            type="button"
            onClick={() => handleTvAction('confirmInitials')}
            style={{
              fontFamily: 'Knewave, cursive',
              fontSize: '1.3rem',
              letterSpacing: '0.08em',
              padding: '0.55rem 1.8rem',
              borderRadius: '999px',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              background: 'linear-gradient(180deg, #ff9ab3 0%, #ff3d6b 100%)',
              color: '#ffffff',
              textShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
              boxShadow: '0 6px 16px rgba(255, 61, 107, 0.45)',
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
          >
            SUBMIT
          </button>
        </div>
      )}
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
      {debugControlsEnabled && (runActive || phase === PHASE_LAUNCHING) && (
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
      <GameHud musicRef={musicRef} visible={runActive && !isGameOver} isTouchDevice={isTouchDevice} />
      <Suspense fallback={null}>
        <SceneCanvas
          phase={phase}
          bootPhase={bootPhase}
          transitionCaptureMode={transitionCaptureMode}
          bootVisualMix={bootVisualMix}
          canvasDpr={canvasDpr}
          showGameWorld={showGameWorld}
          isTransitioning={isTransitioning}
          transitionDirection={transitionDirection}
          runActive={runActive}
          transitionProgressRef={transitionProgressRef}
          showIntroOverlay={showIntroOverlay}
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
          onPlopSfx={playPlopSfx}
          isWarmingGameWorld={isWarmingGameWorld}
          onGameWorldPrimed={handleGameWorldPrimed}
          transitionSettings={transitionSettings}
          onTransitionComplete={handleTransitionComplete}
          introPost={introPost}
          introOverlaySettings={introOverlaySettings}
          gamePost={gamePost}
          transitionSnapshotTextureRef={transitionSnapshotTextureRef}
          capturedTransitionTexture={capturedTransitionTexture}
          shouldCaptureSceneRef={shouldCaptureSceneRef}
          onSceneCaptured={handleSceneCaptured}
          foliageSegmentCount={foliageSegmentCount}
          introScreenMode={introScreenMode}
          introSummary={introSummary}
          introButtonLabel={introButtonLabel}
          introInstructionLabel={introInstructionLabel}
          gpuTier={gpuTier}
          quality={effectiveQuality}
          gameplayShadowMode={gameplayShadowMode}
          chromaticSpike={chromaticSpike}
          cameraMode={cameraMode}
          onDismissIntroScreen={() => {
            setShowDeathFullscreen(false)
            setReturnScreenMode(RETURN_SCREEN_TITLE)
          }}
          showIntroDismissButton={canDismissResultsSummary}
          bootStatusLabel={bootStatusLabel}
          bootDisplayedProgress={displayedBootProgress}
          bootReady={isAssetLoadComplete && isGameWorldPrimed && isMusicReady}
          highScore={highScore}
          leaderboards={leaderboards}
          leaderboardTab={leaderboardTab}
          initialsEntry={initialsEntry}
          onAction={handleTvAction}
          reverseTransitionDuration={reverseTransitionDuration}
          renderProfile={renderProfile}
        />
      </Suspense>
    </>
  )
}
