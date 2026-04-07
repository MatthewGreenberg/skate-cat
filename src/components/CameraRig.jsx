import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import { gameState, getGameDelta } from '../store'
import { useOptionalControls } from '../lib/debugControls'

const INTRO_LERP_SPEED = 2.5
const INTRO_FOV = 43
const GAME_FOV = 75
const DEATH_FOV = 46
const REVERSE_INTRO_ENTRY_BLEND = 0.4
const INTRO_MOUSE_YAW_MAX = THREE.MathUtils.degToRad(4.5)
const INTRO_MOUSE_PITCH_SHIFT = 0.14
const INTRO_MOUSE_YAW_RESPONSE = 5
const INTRO_MOUSE_LOOK_SHIFT = 0.18

function transitionEase(t) {
  return 1 - (1 - t) * (1 - t)
}

const _vecA = new THREE.Vector3()
const _vecB = new THREE.Vector3()
const _vecC = new THREE.Vector3()
const _vecD = new THREE.Vector3()
const _vecE = new THREE.Vector3()
const _vecF = new THREE.Vector3()
const _vecG = new THREE.Vector3()
const _vecH = new THREE.Vector3()
const _vecI = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
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
  transitionDirection = 'forward',
  cameraMode = 'intro',
}) {
  const { camera } = useThree()
  const currentZoom = useRef(0)
  const jumpZoom = useRef(0)
  const shakeTime = useRef(0)
  const introYaw = useRef(0)

  const posAtCapture = useRef(new THREE.Vector3())
  const lookAtCapture = useRef(new THREE.Vector3())
  const fovAtCapture = useRef(INTRO_FOV)
  const wasTransitioning = useRef(false)

  const { introCamX, introCamY, introCamZ, introLookX, introLookY, introLookZ } = useOptionalControls('Intro', {
    Camera: folder({
      introCamX: { value: 0.6, min: -5, max: 5, step: 0.1 },
      introCamY: { value: 1.2, min: -2, max: 5, step: 0.1 },
      introCamZ: { value: 2.4, min: -5, max: 10, step: 0.1 },
      introLookX: { value: 0.3, min: -5, max: 5, step: 0.1 },
      introLookY: { value: 0.8, min: -2, max: 5, step: 0.1 },
      introLookZ: { value: -1.6, min: -5, max: 5, step: 0.1 },
    }),
  }, [])

  const {
    resultsCamX,
    resultsCamY,
    resultsCamZ,
    resultsLookX,
    resultsLookY,
    resultsLookZ,
  } = useOptionalControls('Intro', {
    'Results Camera': folder({
      resultsCamX: { value: 0.52, min: -5, max: 5, step: 0.1 },
      resultsCamY: { value: 1.08, min: -2, max: 5, step: 0.1 },
      resultsCamZ: { value: 1.55, min: -5, max: 10, step: 0.1 },
      resultsLookX: { value: 0.36, min: -5, max: 5, step: 0.1 },
      resultsLookY: { value: 0.88, min: -2, max: 5, step: 0.1 },
      resultsLookZ: { value: -1.22, min: -5, max: 5, step: 0.1 },
    }),
  }, [])

  const {
    deathCamX,
    deathCamY,
    deathCamZ,
    deathLookX,
    deathLookY,
    deathLookZ,
    deathFov,
  } = useOptionalControls('Intro', {
    'Death Camera': folder({
      deathCamX: { value: 0.48, min: -5, max: 5, step: 0.01 },
      deathCamY: { value: 1.1, min: -2, max: 5, step: 0.01 },
      deathCamZ: { value: 1.2, min: -5, max: 10, step: 0.01 },
      deathLookX: { value: 0.38, min: -5, max: 5, step: 0.01 },
      deathLookY: { value: 0.9, min: -2, max: 5, step: 0.01 },
      deathLookZ: { value: -1.2, min: -5, max: 5, step: 0.01 },
      deathFov: { value: DEATH_FOV, min: 20, max: 60, step: 0.5 },
    }),
  }, [])

  const camPos = useRef(new THREE.Vector3(introCamX, introCamY, introCamZ))
  const camLook = useRef(new THREE.Vector3(introLookX, introLookY, introLookZ))

  const { posX, posY, posZ, lookX, lookY, lookZ, kickflipZoom, kickflipLerp, kickflipAngleX, kickflipAngleY } = useOptionalControls('Game', {
    Camera: folder({
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
    }, { collapsed: true }),
  }, [])

  useFrame((state, delta) => {
    const gameDelta = getGameDelta(delta)
    const targetIntroPos = _vecA.set(introCamX, introCamY, introCamZ)
    const targetIntroLook = _vecB.set(introLookX, introLookY, introLookZ)
    const targetResultsPos = _vecC.set(resultsCamX, resultsCamY, resultsCamZ)
    const targetResultsLook = _vecD.set(resultsLookX, resultsLookY, resultsLookZ)
    const deathTargetPos = _vecE.set(deathCamX, deathCamY, deathCamZ)
    const deathTargetLook = _vecF.set(deathLookX, deathLookY, deathLookZ)
    const idleTargetPos = cameraMode === 'death'
      ? deathTargetPos
      : cameraMode === 'results'
        ? targetResultsPos
        : targetIntroPos
    const idleTargetLook = cameraMode === 'death'
      ? deathTargetLook
      : cameraMode === 'results'
        ? targetResultsLook
        : targetIntroLook
    const idleTargetFov = cameraMode === 'death' ? deathFov : INTRO_FOV
    const reverseTargetPos = cameraMode === 'death' ? targetIntroPos : idleTargetPos
    const reverseTargetLook = cameraMode === 'death' ? targetIntroLook : idleTargetLook
    const reverseTargetFov = cameraMode === 'death' ? INTRO_FOV : idleTargetFov
    const shouldBiasReverseEntry = transitionDirection === 'reverse' && cameraMode === 'intro'

    if (isTransitioning && !wasTransitioning.current) {
      if (shouldBiasReverseEntry) {
        // Start the intro reveal closer to the TV front, but leave enough travel for a visible pan during the wipe.
        posAtCapture.current.lerpVectors(camera.position, reverseTargetPos, REVERSE_INTRO_ENTRY_BLEND)
        lookAtCapture.current.lerpVectors(camLook.current, reverseTargetLook, REVERSE_INTRO_ENTRY_BLEND)
        fovAtCapture.current = THREE.MathUtils.lerp(camera.fov, reverseTargetFov, REVERSE_INTRO_ENTRY_BLEND)
      } else {
        posAtCapture.current.copy(camera.position)
        lookAtCapture.current.copy(camLook.current)
        fovAtCapture.current = camera.fov
      }
    }
    wasTransitioning.current = isTransitioning

    if (isTransitioning) {
      const transitionProgress = transitionProgressRef?.current ?? 0
      const t = transitionEase(transitionProgress)
      const targetFov = transitionDirection === 'reverse' ? reverseTargetFov : GAME_FOV
      const nextFov = THREE.MathUtils.lerp(fovAtCapture.current, targetFov, t)
      const gameTargetPos = _vecA.set(posX, posY, posZ)
      const gameTargetLook = _vecB.set(lookX, lookY, lookZ)

      camPos.current.lerpVectors(posAtCapture.current, transitionDirection === 'reverse' ? reverseTargetPos : gameTargetPos, t)
      camLook.current.lerpVectors(lookAtCapture.current, transitionDirection === 'reverse' ? reverseTargetLook : gameTargetLook, t)
      applyCameraPose(camera, camPos.current, camLook.current, nextFov)
      return
    }

    if (!runActive) {
      currentZoom.current = 0
      jumpZoom.current = 0
      shakeTime.current = 0
      gameState.screenShake.current = 0

      if (showGameWorld) {
        introYaw.current = THREE.MathUtils.lerp(introYaw.current, 0, gameDelta * INTRO_MOUSE_YAW_RESPONSE)
        camPos.current.set(posX, posY, posZ)
        camLook.current.set(lookX, lookY, lookZ)
        applyCameraPose(camera, camPos.current, camLook.current, GAME_FOV)
      } else {
        const mouseScale = cameraMode === 'intro' ? 1 : 0.35
        const introYawTarget = state.pointer.x * INTRO_MOUSE_YAW_MAX * mouseScale
        const introPitchTarget = state.pointer.y * INTRO_MOUSE_PITCH_SHIFT * mouseScale
        introYaw.current = THREE.MathUtils.lerp(
          introYaw.current,
          introYawTarget,
          gameDelta * INTRO_MOUSE_YAW_RESPONSE
        )

        const interactiveTargetPos = _vecG
          .copy(idleTargetPos)
          .sub(idleTargetLook)
          .applyAxisAngle(_worldUp, introYaw.current)
          .add(idleTargetLook)
        const interactiveTargetLook = _vecH.copy(idleTargetLook).add(
          _vecI.set(
            introYaw.current * INTRO_MOUSE_LOOK_SHIFT,
            introPitchTarget,
            0
          )
        )

        camPos.current.lerp(interactiveTargetPos, gameDelta * INTRO_LERP_SPEED)
        camLook.current.lerp(interactiveTargetLook, gameDelta * INTRO_LERP_SPEED)
        const nextFov = THREE.MathUtils.lerp(camera.fov, idleTargetFov, gameDelta * INTRO_LERP_SPEED)
        applyCameraPose(camera, camPos.current, camLook.current, nextFov)
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
