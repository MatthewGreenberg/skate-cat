import { useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
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
import GameHud from './components/GameHud'
import { EffectComposer, Bloom, SMAA, ChromaticAberration, BrightnessContrast, HueSaturation } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useControls } from 'leva'
import { gameState } from './store'
import { BEAT_INTERVAL } from './rhythm'

const COUNTDOWN_STEPS = ['1', '2', '3', 'GO!']

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
  const [isCountdownActive, setIsCountdownActive] = useState(false)
  const [countdownText, setCountdownText] = useState('')
  const [countdownAnimationKey, setCountdownAnimationKey] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const { active: isLoadingAssets, progress: loadingProgress } = useProgress()

  const {
    bloomIntensity, bloomThreshold, bloomSmoothing,
    caOffset,
    brightness, contrast, hue, saturation,
  } = useControls('Post Processing', {
    bloomIntensity: { value: 2.1, min: 0, max: 10, step: 0.1 },
    bloomThreshold: { value: 0.35, min: 0, max: 1, step: 0.05 },
    bloomSmoothing: { value: 0.1, min: 0, max: 1, step: 0.05 },
    caOffset: { value: 0.0005, min: 0, max: 0.01, step: 0.0001 },
    brightness: { value: 0.0, min: -0.3, max: 0.3, step: 0.01 },
    contrast: { value: 0.1, min: -0.5, max: 0.5, step: 0.01 },
    hue: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    saturation: { value: 0.15, min: -1, max: 1, step: 0.01 },
  })

  useEffect(() => {
    gameState.onGameOver = () => setIsGameOver(true)
  }, [])

  useEffect(() => {
    if (!musicRef.current) return
    if (!hasStartedGame || isGameOver) {
      musicRef.current.pause()
      return
    }

    if (hasStartedMusicRef.current) {
      musicRef.current.play().catch(() => { })
    }
  }, [hasStartedGame, isGameOver])

  useEffect(() => {
    if (!musicRef.current) return
    musicRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    if (!hasStartedGame || isGameOver) {
      return
    }

    let animationFrameId = 0
    let previousStep = -1

    const syncCountdownToMusic = () => {
      const musicTime = musicRef.current?.currentTime || 0
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
  }, [hasStartedGame, isGameOver])

  const handleStart = useCallback(() => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = 8
    gameState.speedBoostActive = true
    gameState.speedLinesOn = true
    gameState.jumping = false
    gameState.streak.current = 0
    setIsGameOver(false)
    setHasStartedGame(true)
    setTimingFeedback({ label: '', id: 0 })
    setIsCountdownActive(true)
    setCountdownText(COUNTDOWN_STEPS[0])
    setCountdownAnimationKey((prev) => prev + 1)

    if (musicRef.current) {
      musicRef.current.currentTime = 0
      musicRef.current.play().then(() => {
        hasStartedMusicRef.current = true
      }).catch(() => { })
    }
  }, [])

  const handleRestart = useCallback(() => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = 8
    gameState.speedBoostActive = true
    gameState.speedLinesOn = true
    gameState.jumping = false
    gameState.streak.current = 0
    if (musicRef.current) {
      musicRef.current.currentTime = 0
      musicRef.current.play().then(() => {
        hasStartedMusicRef.current = true
      }).catch(() => { })
    }
    setIsGameOver(false)
    setTimingFeedback({ label: '', id: 0 })
    setIsCountdownActive(true)
    setCountdownText(COUNTDOWN_STEPS[0])
    setCountdownAnimationKey((prev) => prev + 1)
  }, [])

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
              gap: '0.9rem',
              background: 'radial-gradient(circle at center, rgba(35, 44, 78, 0.85), rgba(8, 11, 20, 0.95))',
              color: 'white',
              fontFamily: 'Knewave',
              letterSpacing: '0.04em',
            }}
          >
            <div style={{ fontSize: '3rem', animation: 'gameLoadingPulse 1s ease-in-out infinite' }}>
              LOADING...
            </div>
            <div style={{ fontSize: '1.2rem', opacity: 0.92 }}>
              {Math.round(loadingProgress)}%
            </div>
          </div>
        </>
      )}
      <audio ref={musicRef} src="/song.m4a" preload="auto" />
      <audio ref={jumpSfxRef} src="/jump.wav" preload="auto" />
      <audio ref={jump2SfxRef} src="/jump2.wav" preload="auto" />
      <audio ref={dieSfxRef} src="/die.wav" preload="auto" />
      {!hasStartedGame && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
          fontFamily: 'Knewave',
          color: 'white',
          gap: '1rem',
        }}>
          <h1 style={{ margin: 0, fontSize: '6.5rem' }}>Skate Cat</h1>
          <button
            onClick={handleStart}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.1rem',
              fontFamily: 'Knewave',
              background: '#FF6B35',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 4px 15px rgba(255,107,53,0.4)',
            }}
          >
            Start Run
          </button>
        </div>
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
      {hasStartedGame && (
        <div
          style={{
            position: 'fixed',
            left: '1rem',
            bottom: '1rem',
            zIndex: 220,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.55rem 0.85rem',
            borderRadius: '999px',
            border: '2px solid rgba(255, 255, 255, 0.65)',
            background: 'rgba(0, 0, 0, 0.35)',
            color: '#fff',
            fontFamily: 'Knewave',
            letterSpacing: '0.03em',
          }}
        >
          <span>VOLUME</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: '130px', cursor: 'pointer' }}
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
        <fog attach="fog" args={['#c8d8c0', 50, 140]} />

        <CameraRig started={hasStartedGame} />

        <ambientLight color="#f2f7ff" intensity={0.22} />
        <directionalLight
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
        <hemisphereLight args={['#b7dbff', '#78a24f', 0.55]} />

        <Ground />
        <Background />
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
        <EffectComposer multisampling={0}>
          {/* <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={[caOffset, caOffset]}
          /> */}
          <Bloom
            intensity={hasStartedGame ? bloomIntensity : 3.4}
            luminanceThreshold={bloomThreshold}
            luminanceSmoothing={bloomSmoothing}
            mipmapBlur
          />
          <BrightnessContrast brightness={brightness} contrast={contrast} />
          <HueSaturation hue={hue} saturation={saturation} />
        </EffectComposer>
      </Canvas>
    </>
  )
}
