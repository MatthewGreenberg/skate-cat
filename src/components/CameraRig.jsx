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
const REVERSE_INTRO_DOLLY_DISTANCE = 2.2
const FAILED_SUMMARY_DOLLY_DISTANCE = 0.7
const LEADERBOARD_DOLLY_DISTANCE = 1.15
const LEADERBOARD_LOOK_Y_OFFSET = 0.12
const INTRO_MOUSE_YAW_MAX = THREE.MathUtils.degToRad(4.5)
const INTRO_MOUSE_PITCH_SHIFT = 0.32
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
const _vecJ = new THREE.Vector3()
const _vecK = new THREE.Vector3()
const _vecL = new THREE.Vector3()
const _vecM = new THREE.Vector3()
const _vecN = new THREE.Vector3()
const _vecO = new THREE.Vector3()
const _vecP = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _responsiveViewDir = new THREE.Vector3()
const _responsiveIntroPos = new THREE.Vector3()
const _responsiveIntroLook = new THREE.Vector3()
const _responsiveResultsPos = new THREE.Vector3()
const _responsiveResultsLook = new THREE.Vector3()
const _responsiveFailedPos = new THREE.Vector3()
const _responsiveFailedLook = new THREE.Vector3()
const _responsiveLeaderboardPos = new THREE.Vector3()
const _responsiveLeaderboardLook = new THREE.Vector3()

function applyCameraPose(targetCamera, position, lookAt, fov) {
  if (!targetCamera) return

  targetCamera.position.copy(position)
  if (Math.abs(targetCamera.fov - fov) > 0.001) {
    targetCamera.fov = fov
    targetCamera.updateProjectionMatrix()
  }
  targetCamera.lookAt(lookAt)
}

function getResponsiveMix(size) {
  const width = size?.width ?? 0
  const height = size?.height ?? 0
  const aspect = height > 0 ? width / height : 1
  const shortSide = Math.min(width, height)
  const aspectMix = THREE.MathUtils.clamp((1.45 - aspect) / (1.45 - 0.9), 0, 1)
  const sizeMix = THREE.MathUtils.clamp((900 - shortSide) / (900 - 600), 0, 1)
  const isLandscape = width > height
  // Narrow-tall landscape viewport (phone held sideways): short side 320–500px.
  const mobileLandscapeMix = isLandscape && shortSide > 0 && shortSide <= 500
    ? THREE.MathUtils.clamp((500 - shortSide) / (500 - 320), 0, 1)
    : 0
  return {
    mix: Math.max(aspectMix, sizeMix),
    mobileLandscapeMix,
  }
}

function getResponsiveIntroFraming(
  basePos,
  baseLook,
  baseFov,
  cameraMode,
  responsiveMix,
  mobileLandscapeMix,
  positionTarget,
  lookTarget,
  mobileOverride
) {
  positionTarget.copy(basePos)
  lookTarget.copy(baseLook)

  if (cameraMode === 'death' || (responsiveMix <= 0 && mobileLandscapeMix <= 0)) {
    return baseFov
  }

  let backOffset = 0
  let posYOffset = 0
  let posXOffset = 0
  let lookYOffset = 0
  let fovOffset = 0
  let mobileBackOffset = 0
  let mobileFovOffset = 0

  if (cameraMode === 'intro') {
    backOffset = 0.85
    posYOffset = 0.12
    posXOffset = -0.08
    lookYOffset = 0.04
    fovOffset = 4
    mobileBackOffset = -0.6
    mobileFovOffset = -4
  } else if (cameraMode === 'results') {
    backOffset = 0.55
    posYOffset = 0.08
    fovOffset = 3
    mobileBackOffset = 0.3
    mobileFovOffset = 2
  } else if (cameraMode === 'failed') {
    backOffset = 0.45
    posYOffset = 0.06
    fovOffset = 2
    mobileBackOffset = 0.25
    mobileFovOffset = 2
  } else if (cameraMode === 'leaderboard') {
    backOffset = 0.55
    posYOffset = 0.08
    fovOffset = 3
    mobileBackOffset = 0.3
    mobileFovOffset = 2
  }

  let mobileLookX = 0
  let mobileLookY = 0
  let mobileLookZ = 0

  if (mobileOverride) {
    if (typeof mobileOverride.back === 'number') mobileBackOffset = mobileOverride.back
    if (typeof mobileOverride.fov === 'number') mobileFovOffset = mobileOverride.fov
    if (typeof mobileOverride.lookX === 'number') mobileLookX = mobileOverride.lookX
    if (typeof mobileOverride.lookY === 'number') mobileLookY = mobileOverride.lookY
    if (typeof mobileOverride.lookZ === 'number') mobileLookZ = mobileOverride.lookZ
  }

  _responsiveViewDir.copy(basePos).sub(baseLook)
  if (_responsiveViewDir.lengthSq() > 1e-6) {
    _responsiveViewDir.normalize()
  } else {
    _responsiveViewDir.set(0, 0, 1)
  }

  positionTarget.addScaledVector(
    _responsiveViewDir,
    backOffset * responsiveMix + mobileBackOffset * mobileLandscapeMix
  )
  positionTarget.y += posYOffset * responsiveMix
  positionTarget.x += posXOffset * responsiveMix
  lookTarget.y += lookYOffset * responsiveMix
  lookTarget.x += mobileLookX * mobileLandscapeMix
  lookTarget.y += mobileLookY * mobileLandscapeMix
  lookTarget.z += mobileLookZ * mobileLandscapeMix

  return baseFov + fovOffset * responsiveMix + mobileFovOffset * mobileLandscapeMix
}

export default function CameraRig({
  runActive = false,
  showGameWorld = false,
  isTransitioning = false,
  transitionProgressRef,
  transitionDirection = 'forward',
  cameraMode = 'intro',
}) {
  const { camera, size } = useThree()
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
    }, { collapsed: true }),
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
      resultsCamX: { value: 0.51, min: -5, max: 5, step: 0.1 },
      resultsCamY: { value: 1.12, min: -2, max: 5, step: 0.1 },
      resultsCamZ: { value: 1.26, min: -5, max: 10, step: 0.1 },
      resultsLookX: { value: 0.3, min: -5, max: 5, step: 0.1 },
      resultsLookY: { value: 0.92, min: -2, max: 5, step: 0.1 },
      resultsLookZ: { value: -1.6, min: -5, max: 5, step: 0.1 },
    }, { collapsed: true }),
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
    }, { collapsed: true }),
  }, [])

  const {
    introMobileBack,
    introMobileFov,
    introMobileLookX,
    introMobileLookY,
    introMobileLookZ,
    resultsMobileBack,
    resultsMobileFov,
    resultsMobileLookX,
    resultsMobileLookY,
    resultsMobileLookZ,
    failedMobileBack,
    failedMobileFov,
    failedMobileLookX,
    failedMobileLookY,
    failedMobileLookZ,
    leaderboardMobileBack,
    leaderboardMobileFov,
    leaderboardMobileLookX,
    leaderboardMobileLookY,
    leaderboardMobileLookZ,
  } = useOptionalControls('Intro', {
    'Mobile Landscape': folder({
      introMobileBack: { value: -2.8, min: -3, max: 3, step: 0.05 },
      introMobileFov: { value: -4, min: -20, max: 20, step: 0.5 },
      introMobileLookX: { value: 0, min: -2, max: 2, step: 0.02 },
      introMobileLookY: { value: 0.7, min: -2, max: 2, step: 0.02 },
      introMobileLookZ: { value: 0, min: -2, max: 2, step: 0.02 },
      resultsMobileBack: { value: -1.6, min: -3, max: 3, step: 0.05 },
      resultsMobileFov: { value: -3, min: -20, max: 20, step: 0.5 },
      resultsMobileLookX: { value: 0.06, min: -2, max: 2, step: 0.02 },
      resultsMobileLookY: { value: 0.36, min: -2, max: 2, step: 0.02 },
      resultsMobileLookZ: { value: 0, min: -2, max: 2, step: 0.02 },
      failedMobileBack: { value: 0.25, min: -3, max: 3, step: 0.05 },
      failedMobileFov: { value: 2, min: -20, max: 20, step: 0.5 },
      failedMobileLookX: { value: 0, min: -2, max: 2, step: 0.02 },
      failedMobileLookY: { value: 0, min: -2, max: 2, step: 0.02 },
      failedMobileLookZ: { value: 0, min: -2, max: 2, step: 0.02 },
      leaderboardMobileBack: { value: -1.6, min: -3, max: 3, step: 0.05 },
      leaderboardMobileFov: { value: -3, min: -20, max: 20, step: 0.5 },
      leaderboardMobileLookX: { value: 0.06, min: -2, max: 2, step: 0.02 },
      leaderboardMobileLookY: { value: 0.36, min: -2, max: 2, step: 0.02 },
      leaderboardMobileLookZ: { value: 0, min: -2, max: 2, step: 0.02 },
    }, { collapsed: true }),
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

  const {
    mobileFovExtra,
    mobilePullbackZ,
    mobilePullbackY,
    mobileLookOffsetX,
    mobileLookOffsetY,
    mobileLookOffsetZ,
  } = useOptionalControls('Game', {
    'Mobile Landscape': folder({
      mobileFovExtra: { value: 0.0, min: 0, max: 20, step: 0.5 },
      mobilePullbackZ: { value: 0.7, min: -2, max: 6, step: 0.1 },
      mobilePullbackY: { value: -0.7, min: -2, max: 3, step: 0.05 },
      mobileLookOffsetX: { value: -1.8, min: -5, max: 5, step: 0.05 },
      mobileLookOffsetY: { value: -0.9, min: -5, max: 5, step: 0.05 },
      mobileLookOffsetZ: { value: 0.55, min: -5, max: 5, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  useFrame((state, rawDelta) => {
    // Clamp delta to prevent camera overshoot after tab-away (large accumulated delta)
    const delta = Math.min(rawDelta, 0.1)
    const gameDelta = getGameDelta(delta)
    const { mix: responsiveMix, mobileLandscapeMix } = getResponsiveMix(size)
    const targetIntroPos = _vecA.set(introCamX, introCamY, introCamZ)
    const targetIntroLook = _vecB.set(introLookX, introLookY, introLookZ)
    const targetResultsPos = _vecC.set(resultsCamX, resultsCamY, resultsCamZ)
    const targetResultsLook = _vecD.set(resultsLookX, resultsLookY, resultsLookZ)
    const deathTargetPos = _vecE.set(deathCamX, deathCamY, deathCamZ)
    const deathTargetLook = _vecF.set(deathLookX, deathLookY, deathLookZ)
    const responsiveIntroFov = getResponsiveIntroFraming(
      targetIntroPos,
      targetIntroLook,
      INTRO_FOV,
      'intro',
      responsiveMix,
      mobileLandscapeMix,
      _responsiveIntroPos,
      _responsiveIntroLook,
      {
        back: introMobileBack,
        fov: introMobileFov,
        lookX: introMobileLookX,
        lookY: introMobileLookY,
        lookZ: introMobileLookZ,
      }
    )
    const failedTargetLook = _vecK.copy(targetIntroLook)
    const failedTargetPos = _vecJ
      .copy(targetIntroPos)
      .addScaledVector(
        _vecH.copy(failedTargetLook).sub(targetIntroPos).normalize(),
        FAILED_SUMMARY_DOLLY_DISTANCE
      )
    const responsiveResultsFov = getResponsiveIntroFraming(
      targetResultsPos,
      targetResultsLook,
      INTRO_FOV,
      'results',
      responsiveMix,
      mobileLandscapeMix,
      _responsiveResultsPos,
      _responsiveResultsLook,
      {
        back: resultsMobileBack,
        fov: resultsMobileFov,
        lookX: resultsMobileLookX,
        lookY: resultsMobileLookY,
        lookZ: resultsMobileLookZ,
      }
    )
    const responsiveFailedFov = getResponsiveIntroFraming(
      failedTargetPos,
      failedTargetLook,
      INTRO_FOV,
      'failed',
      responsiveMix,
      mobileLandscapeMix,
      _responsiveFailedPos,
      _responsiveFailedLook,
      {
        back: failedMobileBack,
        fov: failedMobileFov,
        lookX: failedMobileLookX,
        lookY: failedMobileLookY,
        lookZ: failedMobileLookZ,
      }
    )
    const leaderboardTargetLook = _vecL.copy(targetIntroLook)
    leaderboardTargetLook.y += LEADERBOARD_LOOK_Y_OFFSET
    const leaderboardTargetPos = _vecM
      .copy(targetIntroPos)
      .addScaledVector(_vecI.copy(leaderboardTargetLook).sub(targetIntroPos).normalize(), LEADERBOARD_DOLLY_DISTANCE)
    const responsiveLeaderboardFov = getResponsiveIntroFraming(
      leaderboardTargetPos,
      leaderboardTargetLook,
      INTRO_FOV,
      'leaderboard',
      responsiveMix,
      mobileLandscapeMix,
      _responsiveLeaderboardPos,
      _responsiveLeaderboardLook,
      {
        back: leaderboardMobileBack,
        fov: leaderboardMobileFov,
        lookX: leaderboardMobileLookX,
        lookY: leaderboardMobileLookY,
        lookZ: leaderboardMobileLookZ,
      }
    )
    const idleTargetPos = cameraMode === 'death'
      ? deathTargetPos
      : cameraMode === 'leaderboard'
        ? _responsiveLeaderboardPos
        : cameraMode === 'failed'
          ? _responsiveFailedPos
          : cameraMode === 'results'
            ? _responsiveResultsPos
            : _responsiveIntroPos
    const idleTargetLook = cameraMode === 'death'
      ? deathTargetLook
      : cameraMode === 'leaderboard'
        ? _responsiveLeaderboardLook
        : cameraMode === 'failed'
          ? _responsiveFailedLook
          : cameraMode === 'results'
            ? _responsiveResultsLook
            : _responsiveIntroLook
    const idleTargetFov = cameraMode === 'death'
      ? deathFov
      : cameraMode === 'leaderboard'
        ? responsiveLeaderboardFov
        : cameraMode === 'failed'
          ? responsiveFailedFov
          : cameraMode === 'results'
            ? responsiveResultsFov
            : responsiveIntroFov
    const reverseTargetPos = cameraMode === 'death' ? _responsiveIntroPos : idleTargetPos
    const reverseTargetLook = cameraMode === 'death' ? _responsiveIntroLook : idleTargetLook
    const reverseTargetFov = cameraMode === 'death' ? responsiveIntroFov : idleTargetFov
    const shouldUseReverseIntroStartShot = transitionDirection === 'reverse' && cameraMode === 'failed'
    const reverseIntroStartPos = _vecN
      .copy(_responsiveFailedPos)
      .addScaledVector(
        _vecI.copy(_responsiveFailedPos).sub(_responsiveFailedLook).normalize(),
        REVERSE_INTRO_DOLLY_DISTANCE
      )

    if (isTransitioning && !wasTransitioning.current) {
      if (shouldUseReverseIntroStartShot) {
        // Failed reverse reveals should stay centered on the TV and dolly straight into the summary framing.
        posAtCapture.current.copy(reverseIntroStartPos)
        lookAtCapture.current.copy(_responsiveFailedLook)
        fovAtCapture.current = responsiveFailedFov
      } else {
        posAtCapture.current.copy(camera.position)
        lookAtCapture.current.copy(camLook.current)
        fovAtCapture.current = camera.fov
      }
    }
    wasTransitioning.current = isTransitioning

    const mobileGameFov = GAME_FOV + mobileFovExtra * mobileLandscapeMix
    const mobileGameOffsetY = mobilePullbackY * mobileLandscapeMix
    const mobileGameOffsetZ = mobilePullbackZ * mobileLandscapeMix
    const mobileGameLookX = mobileLookOffsetX * mobileLandscapeMix
    const mobileGameLookY = mobileLookOffsetY * mobileLandscapeMix
    const mobileGameLookZ = mobileLookOffsetZ * mobileLandscapeMix

    if (isTransitioning) {
      const transitionProgress = transitionProgressRef?.current ?? 0
      const t = transitionEase(transitionProgress)
      const isFailedReverseDolly = transitionDirection === 'reverse' && cameraMode === 'failed'
      const targetFov = transitionDirection === 'reverse' ? reverseTargetFov : mobileGameFov
      const nextFov = isFailedReverseDolly
        ? responsiveFailedFov
        : THREE.MathUtils.lerp(fovAtCapture.current, targetFov, t)
      const gameTargetPos = _vecO.set(posX, posY + mobileGameOffsetY, posZ + mobileGameOffsetZ)
      const gameTargetLook = _vecP.set(
        lookX + mobileGameLookX,
        lookY + mobileGameLookY,
        lookZ + mobileGameLookZ
      )

      camPos.current.lerpVectors(posAtCapture.current, transitionDirection === 'reverse' ? reverseTargetPos : gameTargetPos, t)
      if (isFailedReverseDolly) {
        camLook.current.copy(_responsiveFailedLook)
      } else {
        camLook.current.lerpVectors(lookAtCapture.current, transitionDirection === 'reverse' ? reverseTargetLook : gameTargetLook, t)
      }
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
        camPos.current.set(posX, posY + mobileGameOffsetY, posZ + mobileGameOffsetZ)
        camLook.current.set(lookX + mobileGameLookX, lookY + mobileGameLookY, lookZ + mobileGameLookZ)
        applyCameraPose(camera, camPos.current, camLook.current, mobileGameFov)
      } else {
        const baseMouseScale = cameraMode === 'intro' ? 1 : cameraMode === 'failed' || cameraMode === 'leaderboard' ? 0 : 0.35
        const mouseScale = cameraMode === 'intro'
          ? baseMouseScale * (1 - responsiveMix * 0.55)
          : baseMouseScale
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
      posY + jumpZoom.current * kickflipAngleY + shakeY + mobileGameOffsetY,
      posZ + z + mobileGameOffsetZ
    )
    const targetLook = _vecB.set(
      lookX + mobileGameLookX,
      lookY + mobileGameLookY,
      lookZ + mobileGameLookZ
    )
    const targetFov = mobileGameFov
    const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, gameDelta * 5)

    camPos.current.lerp(targetPos, gameDelta * INTRO_LERP_SPEED)
    camLook.current.lerp(targetLook, gameDelta * INTRO_LERP_SPEED)
    applyCameraPose(camera, camPos.current, camLook.current, nextFov)
  })

  return null
}
