import { useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Sky from './components/Sky'
import Ground from './components/Ground'
import SkateCat from './components/SkateCat'
import SpeedLines from './components/SpeedLines'
import Obstacles from './components/Obstacles'
import CameraRig from './components/CameraRig'
import GameOverScreen from './components/GameOverScreen'
import KickflipSparks from './components/KickflipSparks'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useControls } from 'leva'
import { gameState } from './store'

export default function App() {
  const trailTarget = useRef()
  const [isGameOver, setIsGameOver] = useState(false)

  const { bloomIntensity, bloomThreshold, bloomSmoothing, vignetteOffset, vignetteDarkness } = useControls('Post Processing', {
    bloomIntensity: { value: 1.5, min: 0, max: 5, step: 0.1 },
    bloomThreshold: { value: 0.2, min: 0, max: 1, step: 0.05 },
    bloomSmoothing: { value: 0.9, min: 0, max: 1, step: 0.05 },
    vignetteOffset: { value: 0.3, min: 0, max: 1, step: 0.05 },
    vignetteDarkness: { value: 0.4, min: 0, max: 1, step: 0.05 },
  })

  useEffect(() => {
    gameState.onGameOver = () => setIsGameOver(true)
  }, [])

  const handleRestart = useCallback(() => {
    gameState.gameOver = false
    gameState.score = 0
    gameState.speed.current = gameState.baseSpeed
    gameState.jumping = false
    setIsGameOver(false)
  }, [])

  return (
    <>
      <GameOverScreen visible={isGameOver} onRestart={handleRestart} />
      <Canvas
        style={{ width: '100vw', height: '100vh' }}
        gl={{ toneMapping: 0 }}
      >
        <CameraRig />
        <Sky />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />
        <hemisphereLight args={['#87CEEB', '#7EC850', 0.4]} />
        <Ground />
        <SkateCat trailTargetRef={trailTarget} />
        <Obstacles />
        <SpeedLines />
        <KickflipSparks />
        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={bloomThreshold}
            luminanceSmoothing={bloomSmoothing}
            mipmapBlur
          />
          <Vignette offset={vignetteOffset} darkness={vignetteDarkness} />
        </EffectComposer>
      </Canvas>
    </>
  )
}
