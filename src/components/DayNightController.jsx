import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import {
  gameState,
  DAY_NIGHT_CYCLE_SPEED,
  MAX_EXTRA_CAT_COUNT,
  emitHudScoreChange,
  getNightFactor,
  getNightContrastOffset,
  getSunsetFactor,
  getSunriseFactor,
  lerpDayNightColor,
} from '../store'
import { useOptionalControls } from '../lib/debugControls'

const EXTRA_CAT_SPEED_BONUS = 0.45
const NEW_CAT_WARNING_TIME_OF_DAY = 0.82
const DAY_RETURN_TIME_OF_DAY = 0.9

function didCrossTimeOfDayThreshold(previousTimeOfDay, nextTimeOfDay, threshold) {
  if (previousTimeOfDay <= nextTimeOfDay) {
    return previousTimeOfDay < threshold && nextTimeOfDay >= threshold
  }

  return previousTimeOfDay < threshold || nextTimeOfDay >= threshold
}

export default function DayNightController({ isRunning, quality = 'auto', shadowMode = 'map' }) {
  const dirLightRef = useRef()
  const ambientRef = useRef()
  const hemiRef = useRef()
  const previousTimeOfDayRef = useRef(gameState.timeOfDay.current || 0)
  const { scene } = useThree()
  const shadowMapSize = shadowMode === 'hybrid'
    ? 512
    : quality === 'high'
      ? 1024
      : quality === 'quiet'
        ? 256
        : 512
  const shadowRadius = shadowMode === 'hybrid' ? 1.5 : 1
  const useShadowMap = shadowMode === 'map' || shadowMode === 'hybrid'
  const { timeOfDay, paused } = useOptionalControls('Game', {
    'Day/Night': folder({
      timeOfDay: { value: 0, min: 0, max: 1, step: 0.01 },
      paused: false,
    }, { collapsed: true }),
  }, [])

  useFrame((_, delta) => {
    const previousTimeOfDay = previousTimeOfDayRef.current
    let nextTimeOfDay = gameState.timeOfDay.current

    // Cycle timeOfDay only while the run is active (or use leva override when paused)
    if (paused) {
      nextTimeOfDay = timeOfDay
    } else if (isRunning) {
      nextTimeOfDay = (previousTimeOfDay + delta * DAY_NIGHT_CYCLE_SPEED) % 1

      const currentExtraCatCount = gameState.extraCatCount.current || 0
      const canSpawnExtraCat = currentExtraCatCount < MAX_EXTRA_CAT_COUNT
      const shouldWarnForNewCat = (
        canSpawnExtraCat &&
        !gameState.pendingCatDrop.current &&
        didCrossTimeOfDayThreshold(previousTimeOfDay, nextTimeOfDay, NEW_CAT_WARNING_TIME_OF_DAY)
      )
      const shouldDropNewCat = (
        canSpawnExtraCat &&
        gameState.pendingCatDrop.current &&
        didCrossTimeOfDayThreshold(previousTimeOfDay, nextTimeOfDay, DAY_RETURN_TIME_OF_DAY)
      )

      if (shouldWarnForNewCat) {
        gameState.pendingCatDrop.current = true
        gameState.phaseAnnouncement.current = 'NEW CAT'
        emitHudScoreChange()
      }

      if (shouldDropNewCat) {
        const nextExtraCatCount = Math.min(currentExtraCatCount + 1, MAX_EXTRA_CAT_COUNT)
        gameState.pendingCatDrop.current = false
        gameState.extraCatCount.current = nextExtraCatCount
        gameState.loadLevel.current = nextExtraCatCount
        gameState.stackSpeedBonus.current = EXTRA_CAT_SPEED_BONUS * nextExtraCatCount
        gameState.phaseAnnouncement.current = 'EXTRA CAT'
        emitHudScoreChange()
      }
    }
    gameState.timeOfDay.current = nextTimeOfDay
    previousTimeOfDayRef.current = nextTimeOfDay

    const nightFactor = getNightFactor(nextTimeOfDay)
    const sunriseFactor = getSunriseFactor(nextTimeOfDay)
    const sunsetFactor = getSunsetFactor(nextTimeOfDay)
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
    gameState.nightContrast.current = getNightContrastOffset(nextTimeOfDay)
  })

  return (
    <>
      <ambientLight ref={ambientRef} color="#f2f7ff" intensity={0.22} />
      <directionalLight
        ref={dirLightRef}
        position={[5, 10, 3]}
        color="#ffe6bf"
        intensity={1.65}
        castShadow={useShadowMap}
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
        shadow-radius={shadowRadius}
      />
      <hemisphereLight ref={hemiRef} args={['#b7dbff', '#78a24f', 0.55]} />
    </>
  )
}
