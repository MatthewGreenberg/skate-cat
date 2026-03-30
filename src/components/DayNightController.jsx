import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  gameState,
  DAY_NIGHT_CYCLE_SPEED,
  getNightFactor,
  getNightContrastOffset,
  getSunsetFactor,
  getSunriseFactor,
  qualityMode,
  lerpDayNightColor,
} from '../store'
import { useOptionalControls } from '../lib/debugControls'

export default function DayNightController({ isRunning }) {
  const dirLightRef = useRef()
  const ambientRef = useRef()
  const hemiRef = useRef()
  const { scene } = useThree()
  const shadowMapSize = qualityMode === 'high' ? 1024 : qualityMode === 'quiet' ? 256 : 512
  const { timeOfDay, paused } = useOptionalControls('Day/Night', {
    timeOfDay: { value: 0, min: 0, max: 1, step: 0.01 },
    paused: false,
  }, [])

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
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
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
