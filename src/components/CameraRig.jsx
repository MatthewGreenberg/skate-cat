import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState, getGameDelta } from '../store'

// Tight intro camera (close-up on cat)
const INTRO_CAM = { x: 1.0, y: 0.8, z: 1.2 }
const INTRO_LOOK = { x: 0.5, y: 0.2, z: 0 }
const INTRO_LERP_SPEED = 2.5

export default function CameraRig({ started = false }) {
  const { camera } = useThree()
  const currentZoom = useRef(0)
  const jumpZoom = useRef(0)
  const shakeTime = useRef(0)
  const camPos = useRef(new THREE.Vector3(INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z))
  const camLook = useRef(new THREE.Vector3(INTRO_LOOK.x, INTRO_LOOK.y, INTRO_LOOK.z))

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
    const gameDelta = getGameDelta(delta)
    // Calculate zoom-out based on speed above base
    const speedExtra = Math.max(0, gameState.speed.current - gameState.baseSpeed)
    const targetZoom = speedExtra * 0.08
    currentZoom.current = THREE.MathUtils.lerp(currentZoom.current, targetZoom, gameDelta * 5)

    // Jump zoom-out
    const jumpTarget = gameState.jumping ? kickflipZoom : 0
    jumpZoom.current = THREE.MathUtils.lerp(jumpZoom.current, jumpTarget, gameDelta * kickflipLerp)

    // Screen shake
    if (gameState.screenShake.current > 0) {
      gameState.screenShake.current = Math.max(0, gameState.screenShake.current - gameDelta)
      shakeTime.current += gameDelta * 40
    }
    const shakeIntensity = gameState.screenShake.current * 0.15
    const shakeX = Math.sin(shakeTime.current * 1.1) * shakeIntensity
    const shakeY = Math.cos(shakeTime.current * 1.7) * shakeIntensity

    // Target position/lookAt
    const z = currentZoom.current + jumpZoom.current
    const targetPos = started
      ? new THREE.Vector3(
          posX + jumpZoom.current * kickflipAngleX + shakeX,
          posY + jumpZoom.current * kickflipAngleY + shakeY,
          posZ + z
        )
      : new THREE.Vector3(INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z)

    const targetLook = started
      ? new THREE.Vector3(lookX, lookY, lookZ)
      : new THREE.Vector3(INTRO_LOOK.x, INTRO_LOOK.y, INTRO_LOOK.z)

    const lerpSpeed = started ? INTRO_LERP_SPEED : 10 // snap fast on intro, smooth transition out
    camPos.current.lerp(targetPos, gameDelta * lerpSpeed)
    camLook.current.lerp(targetLook, gameDelta * lerpSpeed)

    camera.position.copy(camPos.current)
    camera.lookAt(camLook.current)
  })

  return null
}
