import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState, getGameDelta } from '../store'
import { useOptionalControls } from '../lib/debugControls'

const INTRO_LERP_SPEED = 2.5
const INTRO_FOV = 43
const GAME_FOV = 75

function transitionEase(t) {
  return 1 - (1 - t) * (1 - t)
}

const _vecA = new THREE.Vector3()
const _vecB = new THREE.Vector3()
function applyCameraPose(targetCamera, position, lookAt, fov) {
  if (!targetCamera) return

  targetCamera.position.copy(position)
  if (Math.abs(targetCamera.fov - fov) > 0.001) {
    targetCamera.fov = fov
    targetCamera.updateProjectionMatrix()
  }
  targetCamera.lookAt(lookAt)
}

export default function CameraRig({
  runActive = false,
  showGameWorld = false,
  isTransitioning = false,
  transitionProgressRef,
}) {
  const { camera } = useThree()
  const currentZoom = useRef(0)
  const jumpZoom = useRef(0)
  const shakeTime = useRef(0)

  const posAtCapture = useRef(new THREE.Vector3())
  const lookAtCapture = useRef(new THREE.Vector3())
  const fovAtCapture = useRef(INTRO_FOV)
  const wasTransitioning = useRef(false)

  const { introCamX, introCamY, introCamZ, introLookX, introLookY, introLookZ } = useOptionalControls('Intro Scene Camera', {
    introCamX: { value: 0.15, min: -5, max: 5, step: 0.1 },
    introCamY: { value: 1.05, min: -2, max: 5, step: 0.1 },
    introCamZ: { value: 3.6, min: -5, max: 10, step: 0.1 },
    introLookX: { value: 0.35, min: -5, max: 5, step: 0.1 },
    introLookY: { value: 0.8, min: -2, max: 5, step: 0.1 },
    introLookZ: { value: -1.0, min: -5, max: 5, step: 0.1 },
  }, [])

  const camPos = useRef(new THREE.Vector3(introCamX, introCamY, introCamZ))
  const camLook = useRef(new THREE.Vector3(introLookX, introLookY, introLookZ))

  const { posX, posY, posZ, lookX, lookY, lookZ, kickflipZoom, kickflipLerp, kickflipAngleX, kickflipAngleY } = useOptionalControls('Camera', {
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
  }, [])

  useFrame((_, delta) => {
    const gameDelta = getGameDelta(delta)

    if (isTransitioning && !wasTransitioning.current) {
      posAtCapture.current.copy(camPos.current)
      lookAtCapture.current.copy(camLook.current)
      fovAtCapture.current = camera.fov
    }
    wasTransitioning.current = isTransitioning

    if (isTransitioning) {
      const t = transitionEase(transitionProgressRef?.current ?? 0)
      const nextFov = THREE.MathUtils.lerp(fovAtCapture.current, GAME_FOV, t)

      _vecA.set(posX, posY, posZ)
      camPos.current.lerpVectors(posAtCapture.current, _vecA, t)
      _vecB.set(lookX, lookY, lookZ)
      camLook.current.lerpVectors(lookAtCapture.current, _vecB, t)
      applyCameraPose(camera, camPos.current, camLook.current, nextFov)
      return
    }

    if (!runActive) {
      currentZoom.current = 0
      jumpZoom.current = 0
      shakeTime.current = 0
      gameState.screenShake.current = 0

      if (showGameWorld) {
        camPos.current.set(posX, posY, posZ)
        camLook.current.set(lookX, lookY, lookZ)
        applyCameraPose(camera, camPos.current, camLook.current, GAME_FOV)
      } else {
        camPos.current.set(introCamX, introCamY, introCamZ)
        camLook.current.set(introLookX, introLookY, introLookZ)
        applyCameraPose(camera, camPos.current, camLook.current, INTRO_FOV)
      }
      return
    }

    const speedExtra = Math.max(0, gameState.speed.current - gameState.baseSpeed)
    const targetZoom = speedExtra * 0.08
    currentZoom.current = THREE.MathUtils.lerp(currentZoom.current, targetZoom, gameDelta * 5)

    const jumpTarget = gameState.jumping ? kickflipZoom : 0
    jumpZoom.current = THREE.MathUtils.lerp(jumpZoom.current, jumpTarget, gameDelta * kickflipLerp)

    if (gameState.screenShake.current > 0) {
      gameState.screenShake.current = Math.max(0, gameState.screenShake.current - gameDelta)
      shakeTime.current += gameDelta * 40
    }
    const shakeIntensity = gameState.screenShake.current * 0.15
    const shakeX = Math.sin(shakeTime.current * 1.1) * shakeIntensity
    const shakeY = Math.cos(shakeTime.current * 1.7) * shakeIntensity

    const z = currentZoom.current + jumpZoom.current
    const targetPos = _vecA.set(
      posX + jumpZoom.current * kickflipAngleX + shakeX,
      posY + jumpZoom.current * kickflipAngleY + shakeY,
      posZ + z
    )
    const targetLook = _vecB.set(lookX, lookY, lookZ)
    const targetFov = GAME_FOV
    const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, gameDelta * 5)

    camPos.current.lerp(targetPos, gameDelta * INTRO_LERP_SPEED)
    camLook.current.lerp(targetLook, gameDelta * INTRO_LERP_SPEED)
    applyCameraPose(camera, camPos.current, camLook.current, nextFov)
  })

  return null
}
