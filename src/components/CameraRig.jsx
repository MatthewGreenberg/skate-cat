import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState } from '../store'

const INTRO_ZOOM_OUT = 2.5
const INTRO_HEIGHT_EXTRA = 1.0
const INTRO_LERP_SPEED = 3.5

export default function CameraRig({ started = false }) {
  const { camera } = useThree()
  const currentZoom = useRef(0)
  const jumpZoom = useRef(0)
  const shakeTime = useRef(0)
  const introZoom = useRef(INTRO_ZOOM_OUT)
  const introHeight = useRef(INTRO_HEIGHT_EXTRA)

  const { posX, posY, posZ, lookX, lookY, lookZ, kickflipZoom, kickflipLerp, kickflipAngleX, kickflipAngleY } = useControls('Camera', {
    posX: { value: 1.9, min: -10, max: 10, step: 0.1 },
    posY: { value: 2, min: 0, max: 10, step: 0.1 },
    posZ: { value: -0.7, min: -10, max: 15, step: 0.1 },
    lookX: { value: -3.9, min: -10, max: 10, step: 0.1 },
    lookY: { value: -2.9, min: -5, max: 5, step: 0.1 },
    lookZ: { value: -2.5, min: -20, max: 10, step: 0.1 },
    kickflipZoom: { value: 1, min: 0, max: 2, step: 0.05 },
    kickflipLerp: { value: 3.0, min: 1, max: 20, step: 0.5 },
    kickflipAngleX: { value: 0.45, min: -1, max: 1, step: 0.05 },
    kickflipAngleY: { value: 0.25, min: -1, max: 1, step: 0.05 },
  })

  useFrame((_, delta) => {
    // Intro cinematic zoom
    const introTarget = started ? 0 : 1
    introZoom.current = THREE.MathUtils.lerp(introZoom.current, introTarget * INTRO_ZOOM_OUT, delta * INTRO_LERP_SPEED)
    introHeight.current = THREE.MathUtils.lerp(introHeight.current, introTarget * INTRO_HEIGHT_EXTRA, delta * INTRO_LERP_SPEED)

    // Calculate zoom-out based on speed above base
    const speedExtra = Math.max(0, gameState.speed.current - gameState.baseSpeed)
    const targetZoom = speedExtra * 0.08 // pull back proportionally
    currentZoom.current = THREE.MathUtils.lerp(currentZoom.current, targetZoom, delta * 5)

    // Jump zoom-out
    const jumpTarget = gameState.jumping ? kickflipZoom : 0
    jumpZoom.current = THREE.MathUtils.lerp(jumpZoom.current, jumpTarget, delta * kickflipLerp)

    // Screen shake
    if (gameState.screenShake.current > 0) {
      gameState.screenShake.current = Math.max(0, gameState.screenShake.current - delta)
      shakeTime.current += delta * 40
    }
    const shakeIntensity = gameState.screenShake.current * 0.15
    const shakeX = Math.sin(shakeTime.current * 1.1) * shakeIntensity
    const shakeY = Math.cos(shakeTime.current * 1.7) * shakeIntensity

    const z = currentZoom.current + jumpZoom.current + introZoom.current
    camera.position.set(
      posX + jumpZoom.current * kickflipAngleX + shakeX,
      posY + jumpZoom.current * kickflipAngleY + shakeY + introHeight.current,
      posZ + z
    )
    camera.lookAt(lookX, lookY, lookZ)
  })

  return null
}
