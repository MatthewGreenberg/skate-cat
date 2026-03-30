import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createIdleGrindSparkState, createIdleGrindState, emitHudScoreChange, gameState, getGameDelta, getTargetRunSpeed, SPEED_RESPONSE } from '../store'
import {
  getNearestScheduledTarget,
  getPerceivedMusicTime,
  getTimingGradeFromOffset,
  INPUT_TIMING_COMPENSATION_SECONDS,
} from '../rhythm'

// --- Animation State Machine ---
//
//   idle -> jumping -> landing -> idle
//   idle -> grinding (via grindEntry) -> grindExit -> landing -> idle
//   idle -> spinning -> idle
//   any  -> death (hop off -> walk away)
//
// Overlays (applied on top of base state):
//   - powerslide: amount 0-1, active during grind
//   - squash-and-stretch: on landing
//   - board landing recoil: on landing
//   - spin: full cat rotation in 0.29s

// --- Constants ---
const JUMP_HEIGHT = 1.2
const JUMP_DURATION = 0.34
const JUMP_TAKEOFF_HEADSTART = 1 / 120
const KICKFLIP_ROTATIONS = 1
const SPIN_DURATION = 0.29
const SPIN_INPUT_BUFFER_DURATION = 0.14
const GROUND_SPIN_POINTS = 1
const CAT_LATERAL_TRACKING = 0.32
const CAT_LATERAL_LIMIT = 0.14
const CAT_GROUNDED_LERP = 4.5
const RAIL_JUMP_HEIGHT = 1.65
const GRIND_GROUP_HEIGHT = 0.44
const GRIND_ALIGN_LERP = 10
const GRIND_BOB_HEIGHT = 0.012
const GRIND_PITCH_X = -0.02
const GRIND_ENTRY_DURATION = 0.16
const GRIND_ENTRY_FLOAT = 0.04
const GRIND_CONTACT_FLASH_DECAY = 5.2
const GRIND_BALANCE_SWAY_Z = 0.045
const GRIND_BALANCE_PITCH_X = 0.018
const GRIND_BALANCE_BOB_Y = 0.014
const GRIND_CAT_BALANCE_X = 0.016
const GRIND_CAT_BALANCE_Y = 0.012
const GRIND_CAT_BALANCE_YAW = 0.05
const GRIND_CAT_BALANCE_LEAN = 0.07
const POWERSLIDE_ENTER_LERP = 9
const POWERSLIDE_BOARD_YAW = 0.82
const POWERSLIDE_GROUP_LEAN_Z = 0.18
const POWERSLIDE_GROUP_PITCH_X = 0.02
const POWERSLIDE_CAT_LEAN_Z = -0.22
const POWERSLIDE_CAT_TURN_Y = 0.18
const POWERSLIDE_CAT_OFFSET_X = 0.035
const POWERSLIDE_CAT_CROUCH = 0.045
const BOARD_LANDING_RECOIL_DURATION = 0.26
const BOARD_LANDING_DIP = 0.032
const BOARD_LANDING_PITCH = 0.12
const DEATH_IMPACT_RECOIL_Z = 0.28
const DEATH_IMPACT_RECOIL_PITCH = -0.2
const DEATH_IMPACT_RECOIL_ROLL = 0.06
const DEATH_HOP_HEIGHT = 0.6
const DEATH_HOP_DURATION = 0.4
const DEATH_WALK_SPEED = 1.2
const DEATH_WALK_BOB_SPEED = 8
const DEATH_WALK_BOB_HEIGHT = 0.06
const SQUASH_DURATION = 0.4
const HOP_ON_DURATION = 0.4
const HOP_ON_HEIGHT = 0.8
const ENTRANCE_DROP_DURATION = 0.55
const ENTRANCE_DROP_HEIGHT = 3.5
const ENTRANCE_SPIN_ROTATIONS = 1
const JUMP_KEY_CODES = new Set(['ArrowUp', 'Space', 'KeyW', 'KeyD'])
const SPIN_KEY_CODES = new Set(['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS'])

const _grindSparkLocal = new THREE.Vector3()
const _grindSparkWorld = new THREE.Vector3()

/**
 * Core cat animation hook. Owns all animation state and drives
 * the main useFrame loop for movement, jumping, grinding, death, etc.
 */
export default function useCatAnimation({
  groupRef,
  boardRef,
  catRef,
  grindLightRef,
  catModelRef,
  blinkStateRef,
  musicRef,
  controlsEnabled,
  onJumpTiming,
  onJumpSfx,
  catRotX,
  catRotY,
  catRotZ,
  isTransitioning,
}) {
  // --- State refs ---
  const jumpState = useRef({
    active: false, time: 0, direction: 1,
    startX: 0, targetX: 0, startY: 0.05, endY: 0.05,
    arcHeight: JUMP_HEIGHT, doesFlip: true,
    canSpinTrick: false, didSpinTrick: false,
  })
  const squashState = useRef({ active: false, time: 0 })
  const boardLandingState = useRef({ active: false, time: 0, roll: 0, strength: 1 })
  const introState = useRef({ phase: 'done', time: 0 })
  const entranceTriggered = useRef(false)
  const deathState = useRef({ active: false, time: 0 })
  const spinState = useRef({ active: false, time: 0 })
  const spinInputBuffer = useRef(0)
  const powerslideState = useRef({ amount: 0, direction: 1 })
  const grindContactState = useRef({ flash: 0, motionTime: 0 })
  const grindEntryState = useRef({
    active: false, time: 0, obstacleId: 0,
    startX: 0, startY: 0.05,
    startRotX: 0, startRotZ: 0,
    startBoardYaw: 0, startBoardRoll: 0,
  })
  const heldJumpKeys = useRef(new Set())
  const wasGameOver = useRef(false)
  const wasGrinding = useRef(false)

  // --- Helper functions ---
  const getDesiredRoadOffset = (targetX = 0) =>
    THREE.MathUtils.clamp(targetX * CAT_LATERAL_TRACKING, -CAT_LATERAL_LIMIT, CAT_LATERAL_LIMIT)

  const resetContactEffects = () => {
    grindContactState.current.flash = 0
    grindContactState.current.motionTime = 0
  }

  const setGrindSparkInactive = useCallback(() => {
    if (!gameState.grindSpark.current) {
      gameState.grindSpark.current = createIdleGrindSparkState()
      return
    }
    gameState.grindSpark.current.active = false
    gameState.grindSpark.current.intensity = 0
  }, [])

  const updateGrindSpark = useCallback((direction) => {
    if (!boardRef.current) {
      setGrindSparkInactive()
      return
    }
    const grindSpark = gameState.grindSpark.current || createIdleGrindSparkState()
    gameState.grindSpark.current = grindSpark
    _grindSparkLocal.set(direction * 0.08, -0.06, 0.44)
    boardRef.current.updateWorldMatrix(true, false)
    _grindSparkWorld.copy(_grindSparkLocal)
    boardRef.current.localToWorld(_grindSparkWorld)
    grindSpark.active = true
    grindSpark.position[0] = _grindSparkWorld.x
    grindSpark.position[1] = _grindSparkWorld.y
    grindSpark.position[2] = _grindSparkWorld.z
    grindSpark.direction = direction
    const speedRatio = Math.min(1.35, gameState.speed.current / Math.max(gameState.baseSpeed, 0.001))
    grindSpark.intensity = 0.7 + speedRatio * 0.45
  }, [boardRef, setGrindSparkInactive])

  const triggerGrindImpact = useCallback((direction) => {
    updateGrindSpark(direction)
    const grindSpark = gameState.grindSpark.current || createIdleGrindSparkState()
    gameState.grindSpark.current = grindSpark
    grindSpark.impactId += 1
    grindSpark.intensity = Math.max(grindSpark.intensity, 1.15)
    grindContactState.current.flash = 1
    if (grindLightRef.current) {
      grindLightRef.current.intensity = 6.2
      grindLightRef.current.distance = 1.35
    }
    gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.24)
  }, [grindLightRef, updateGrindSpark])

  const triggerCatSpin = useCallback(() => {
    spinState.current.active = true
    spinState.current.time = 0
  }, [])

  const triggerSpinTrick = useCallback(() => {
    if (jumpState.current.didSpinTrick) return false
    jumpState.current.didSpinTrick = true
    if (gameState.pendingJumpTiming.current) {
      gameState.pendingJumpTiming.current = {
        ...gameState.pendingJumpTiming.current,
        trickName: '360',
      }
    }
    triggerCatSpin()
    return true
  }, [triggerCatSpin])

  const triggerGroundSpin = useCallback(() => {
    gameState.score += GROUND_SPIN_POINTS
    gameState.lastScoringEvent.current = {
      id: performance.now(),
      points: GROUND_SPIN_POINTS,
      grade: 'Spin',
      multiplier: gameState.scoreMultiplier.current,
      isRail: false,
      trickName: '360',
    }
    emitHudScoreChange()
    triggerCatSpin()
  }, [triggerCatSpin])

  const triggerBoardLandingRecoil = useCallback(({ fromGrind = false, direction = 1 } = {}) => {
    const currentBoardRoll = boardRef.current?.rotation.z || 0
    const grindExitRoll = fromGrind ? direction * 0.035 : 0
    boardLandingState.current.active = true
    boardLandingState.current.time = 0
    boardLandingState.current.roll = THREE.MathUtils.clamp(
      Math.abs(currentBoardRoll) > Math.abs(grindExitRoll) ? currentBoardRoll * 0.45 : grindExitRoll,
      -0.05, 0.05
    )
    boardLandingState.current.strength = fromGrind ? 1.15 : 1
  }, [boardRef])

  const triggerCatLandingJiggle = useCallback(() => {
    squashState.current.active = true
    squashState.current.time = 0
  }, [])

  const triggerLandingEffects = useCallback(({ fromGrind = false, direction = 1 } = {}) => {
    if (!groupRef.current) return
    gameState.screenShake.current = 0.3
    const wp = new THREE.Vector3()
    groupRef.current.getWorldPosition(wp)
    gameState.landed.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
    triggerCatLandingJiggle()
    triggerBoardLandingRecoil({ fromGrind, direction })
    const bs = blinkStateRef.current
    if (!bs.blinking) {
      bs.blinking = true
      bs.blinkTime = 0
      bs.blinksLeft = 0
    }
  }, [blinkStateRef, groupRef, triggerBoardLandingRecoil, triggerCatLandingJiggle])

  const triggerKickflipEffect = useCallback(() => {
    if (!groupRef.current) return
    const wp = new THREE.Vector3()
    groupRef.current.getWorldPosition(wp)
    gameState.kickflip.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
  }, [groupRef])

  const primeJumpTakeoffPose = useCallback(() => {
    if (!groupRef.current) return
    const jump = jumpState.current
    jump.time = JUMP_TAKEOFF_HEADSTART
    const t = jump.time / JUMP_DURATION
    const height = 4 * jump.arcHeight * t * (1 - t)
    const travelT = THREE.MathUtils.smootherstep(t, 0, 1)
    groupRef.current.position.y = THREE.MathUtils.lerp(jump.startY, jump.endY, travelT) + height
    groupRef.current.position.x = THREE.MathUtils.lerp(jump.startX, jump.targetX, travelT)
    if (boardRef.current) {
      boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, t * 12)
      boardRef.current.rotation.z = jump.doesFlip
        ? t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
        : THREE.MathUtils.lerp(boardRef.current.rotation.z, 0, t * 12)
    }
  }, [boardRef, groupRef])

  const beginGrindEntry = useCallback((activeGrind) => {
    if (!groupRef.current) return
    grindEntryState.current.active = true
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = activeGrind.obstacleId
    grindEntryState.current.startX = groupRef.current.position.x
    grindEntryState.current.startY = groupRef.current.position.y
    grindEntryState.current.startRotX = groupRef.current.rotation.x
    grindEntryState.current.startRotZ = groupRef.current.rotation.z
    grindEntryState.current.startBoardYaw = boardRef.current?.rotation.y || 0
    grindEntryState.current.startBoardRoll = boardRef.current?.rotation.z || 0
    gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.12)
    triggerGrindImpact(activeGrind.x < 0 ? -1 : 1)
  }, [boardRef, groupRef, triggerGrindImpact])

  const getJumpPlan = useCallback((musicTime, { fromGrind = false, blockedObstacleId = 0 } = {}) => {
    const adjustedMusicTime = getPerceivedMusicTime(musicTime) + INPUT_TIMING_COMPENSATION_SECONDS
    const availableTargets = blockedObstacleId
      ? gameState.obstacleTargets.current.filter((target) => target.id !== blockedObstacleId)
      : gameState.obstacleTargets.current
    const nearestTarget = getNearestScheduledTarget(adjustedMusicTime, availableTargets)
    const timingLabel = nearestTarget ? getTimingGradeFromOffset(nearestTarget.offset) : 'Sloppy'
    const coveredObstacleIds = nearestTarget
      ? availableTargets
        .filter((target) => target.clusterId === nearestTarget.clusterId)
        .map((target) => target.id)
      : []
    const nextLandingTarget = nearestTarget
      ? availableTargets.find((target) =>
        target.clusterId !== nearestTarget.clusterId && target.targetTime > nearestTarget.targetTime + 0.01
      ) || nearestTarget
      : null
    const landingTarget = nearestTarget?.isVertical ? nearestTarget : nextLandingTarget

    return {
      coveredObstacleIds,
      nearestTarget,
      targetX: getDesiredRoadOffset(landingTarget?.x || 0),
      timingLabel,
      isRailJump: fromGrind || Boolean(nearestTarget?.isVertical),
      shouldKickflip: !fromGrind && !nearestTarget?.isVertical,
    }
  }, [])

  const startJump = useCallback(({ fromGrind = false } = {}) => {
    const releasedGrindId = fromGrind ? gameState.activeGrind.current.obstacleId : 0
    const grindDirection = gameState.activeGrind.current?.x < 0 ? -1 : 1
    if (fromGrind && releasedGrindId) {
      gameState.grindCooldownObstacleId.current = releasedGrindId
      triggerCatLandingJiggle()
      triggerBoardLandingRecoil({ fromGrind: true, direction: grindDirection })
      gameState.activeGrind.current = createIdleGrindState()
    }

    jumpState.current.active = true
    jumpState.current.time = 0
    jumpState.current.direction = Math.random() < 0.5 ? 1 : -1
    jumpState.current.startX = groupRef.current?.position.x || 0
    jumpState.current.targetX = jumpState.current.startX
    jumpState.current.startY = groupRef.current?.position.y || 0.05
    jumpState.current.endY = 0.05
    jumpState.current.arcHeight = fromGrind ? RAIL_JUMP_HEIGHT : JUMP_HEIGHT
    jumpState.current.doesFlip = false
    jumpState.current.canSpinTrick = !fromGrind
    jumpState.current.didSpinTrick = false

    if (onJumpSfx) onJumpSfx()

    const musicTime = musicRef?.current?.currentTime
    if (typeof musicTime === 'number' && Number.isFinite(musicTime)) {
      const jumpPlan = getJumpPlan(musicTime, { fromGrind, blockedObstacleId: releasedGrindId })
      jumpState.current.targetX = jumpPlan.targetX
      jumpState.current.arcHeight = jumpPlan.isRailJump ? RAIL_JUMP_HEIGHT : JUMP_HEIGHT
      jumpState.current.doesFlip = jumpPlan.shouldKickflip
      jumpState.current.canSpinTrick = !jumpPlan.isRailJump
      gameState.pendingJumpTiming.current = {
        obstacleIds: jumpPlan.coveredObstacleIds,
        primaryObstacleId: jumpPlan.nearestTarget?.id ?? null,
        grade: jumpPlan.timingLabel,
        offset: jumpPlan.nearestTarget?.offset ?? null,
        timestamp: getPerceivedMusicTime(musicTime),
        trickName: '',
        trickAwarded: false,
        isRailTarget: jumpPlan.isRailJump,
      }
      if (jumpPlan.shouldKickflip) triggerKickflipEffect()
      primeJumpTakeoffPose()
      if (onJumpTiming) onJumpTiming(jumpPlan.timingLabel)
      return
    }

    if (!fromGrind) {
      jumpState.current.doesFlip = true
      triggerKickflipEffect()
    }
    primeJumpTakeoffPose()
  }, [getJumpPlan, groupRef, musicRef, onJumpSfx, onJumpTiming, primeJumpTakeoffPose, triggerBoardLandingRecoil, triggerCatLandingJiggle, triggerKickflipEffect])

  const resetPoseToBoard = () => {
    resetContactEffects()
    deathState.current.active = false
    deathState.current.time = 0
    jumpState.current.active = false
    jumpState.current.time = 0
    spinState.current.active = false
    spinState.current.time = 0
    powerslideState.current.amount = 0
    powerslideState.current.direction = 1
    grindEntryState.current.active = false
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = 0
    squashState.current.active = false
    squashState.current.time = 0
    boardLandingState.current.active = false
    boardLandingState.current.time = 0
    boardLandingState.current.roll = 0
    boardLandingState.current.strength = 1
    spinInputBuffer.current = 0
    wasGrinding.current = false
    introState.current.phase = 'done'
    introState.current.time = 0
    entranceTriggered.current = false
    if (groupRef.current) {
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
    }
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.catHeight.current = 0.05
    if (catRef.current) {
      catRef.current.visible = true
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      catRef.current.scale.set(1, 1, 1)
    }
    if (boardRef.current) {
      boardRef.current.visible = true
      boardRef.current.position.y = 0
      boardRef.current.rotation.x = 0
      boardRef.current.rotation.y = 0
      boardRef.current.rotation.z = 0
    }
  }

  const preparePoseForDeath = () => {
    resetContactEffects()
    jumpState.current.active = false
    jumpState.current.time = 0
    spinState.current.active = false
    spinState.current.time = 0
    powerslideState.current.amount = 0
    powerslideState.current.direction = 1
    grindEntryState.current.active = false
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = 0
    boardLandingState.current.active = false
    boardLandingState.current.time = 0
    boardLandingState.current.roll = 0
    boardLandingState.current.strength = 1
    spinInputBuffer.current = 0
    wasGrinding.current = false
    if (groupRef.current) {
      groupRef.current.position.y = 0.05
      groupRef.current.position.z = DEATH_IMPACT_RECOIL_Z
      groupRef.current.rotation.set(0, 0, 0)
    }
    if (catRef.current) {
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      catRef.current.scale.set(1, 1, 1)
    }
    if (boardRef.current) {
      boardRef.current.position.y = 0
      boardRef.current.rotation.x = DEATH_IMPACT_RECOIL_PITCH
      boardRef.current.rotation.y = 0
      boardRef.current.rotation.z = DEATH_IMPACT_RECOIL_ROLL
    }
    gameState.catHeight.current = 0.05
  }

  // --- Keyboard input ---
  useEffect(() => {
    const getControlCode = (event) => event.code || event.key
    const isJumpControl = (event) => JUMP_KEY_CODES.has(getControlCode(event))
    const isSpinControl = (event) => SPIN_KEY_CODES.has(getControlCode(event))

    const onKeyDown = (e) => {
      if (!controlsEnabled) return
      if (isJumpControl(e)) {
        e.preventDefault()
        heldJumpKeys.current.add(getControlCode(e))
        gameState.upArrowHeld.current = true
        if (e.repeat) return
      }
      if (isSpinControl(e)) {
        e.preventDefault()
      }
      if (gameState.gameOver) return
      if (isJumpControl(e) && !jumpState.current.active) {
        startJump({ fromGrind: Boolean(gameState.activeGrind.current.active) })
      }
      if (isSpinControl(e) && !e.repeat) {
        const canTriggerGroundSpin = (
          !jumpState.current.active &&
          !gameState.activeGrind.current.active &&
          !spinState.current.active
        )
        const canTriggerSpinTrick = (
          jumpState.current.active &&
          jumpState.current.canSpinTrick &&
          !jumpState.current.didSpinTrick &&
          !spinState.current.active
        )
        if (canTriggerGroundSpin) {
          triggerGroundSpin()
        } else if (canTriggerSpinTrick) {
          triggerSpinTrick()
        } else {
          spinInputBuffer.current = SPIN_INPUT_BUFFER_DURATION
        }
      }
    }
    const onKeyUp = (e) => {
      if (!isJumpControl(e)) return
      e.preventDefault()
      heldJumpKeys.current.delete(getControlCode(e))
      gameState.upArrowHeld.current = heldJumpKeys.current.size > 0
    }
    const onBlur = () => {
      heldJumpKeys.current.clear()
      gameState.upArrowHeld.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      heldJumpKeys.current.clear()
      gameState.upArrowHeld.current = false
    }
  }, [controlsEnabled, startJump, triggerGroundSpin, triggerSpinTrick])

  // --- Main animation useFrame ---
  useFrame((state, delta) => {
    if (!groupRef.current || !catRef.current) return
    const gameDelta = getGameDelta(delta)

    // Entrance: start drop immediately when transition begins
    const intro = introState.current
    if (isTransitioning && !entranceTriggered.current) {
      entranceTriggered.current = true
      intro.phase = 'dropping'
      intro.time = 0
      // Board is already on the ground skating; cat starts above
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
      if (boardRef.current) {
        boardRef.current.visible = true
        boardRef.current.position.set(0, 0, 0)
        boardRef.current.rotation.set(0, 0, 0)
      }
    }
    if (!isTransitioning && entranceTriggered.current && intro.phase === 'done') {
      entranceTriggered.current = false
    }

    // Dropping: cat falls from above with a 360 spin onto the moving board
    if (intro.phase === 'dropping') {
      setGrindSparkInactive()
      intro.time += delta
      const t = Math.min(intro.time / ENTRANCE_DROP_DURATION, 1)
      const ease = THREE.MathUtils.smootherstep(t, 0, 1)

      // Board stays grounded and skating
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
      if (boardRef.current) {
        boardRef.current.position.set(0, 0, 0)
        boardRef.current.rotation.set(0, 0, 0)
      }

      // Cat drops from above with gravity curve
      const fallT = t * t * (3 - 2 * t)
      const catY = THREE.MathUtils.lerp(ENTRANCE_DROP_HEIGHT, 0.2, fallT)
      const spinAngle = ease * Math.PI * 2 * ENTRANCE_SPIN_ROTATIONS
      catRef.current.position.set(0, catY, 0)
      catRef.current.rotation.set(0, spinAngle, 0)
      catRef.current.scale.set(1, 1, 1)

      if (catModelRef.current) {
        catModelRef.current.scale.setScalar(0.03)
        catModelRef.current.rotation.set(catRotX, catRotY, catRotZ)
      }

      gameState.catHeight.current = catY + 0.05

      if (t >= 1) {
        intro.phase = 'done'
        catRef.current.position.set(0, 0.2, 0)
        catRef.current.rotation.set(0, 0, 0)
        // Landing effects
        squashState.current.active = true
        squashState.current.time = 0
        gameState.screenShake.current = 0.35
        triggerBoardLandingRecoil({ fromGrind: false, direction: 1 })
        gameState.catHeight.current = 0.05
      }
      return
    }

    // Reset on restart
    if (wasGameOver.current && !gameState.gameOver) {
      wasGameOver.current = false
      resetPoseToBoard()
      return
    }
    if (!gameState.gameOver && deathState.current.active) {
      resetPoseToBoard()
    }

    // Death animation
    if (gameState.gameOver) {
      wasGameOver.current = true
      resetContactEffects()
      setGrindSparkInactive()
      if (!deathState.current.active) {
        preparePoseForDeath()
        deathState.current.active = true
        deathState.current.time = 0
      }
      deathState.current.time += delta
      const elapsed = deathState.current.time
      if (groupRef.current) {
        groupRef.current.position.y = 0.05
        groupRef.current.position.z = DEATH_IMPACT_RECOIL_Z
      }
      if (boardRef.current) {
        boardRef.current.position.y = 0
        boardRef.current.rotation.x = DEATH_IMPACT_RECOIL_PITCH
        boardRef.current.rotation.y = 0
        boardRef.current.rotation.z = DEATH_IMPACT_RECOIL_ROLL
      }
      if (elapsed < DEATH_HOP_DURATION) {
        const t = elapsed / DEATH_HOP_DURATION
        const hopHeight = 4 * DEATH_HOP_HEIGHT * t * (1 - t)
        catRef.current.position.x = t * 0.8
        catRef.current.position.y = 0.2 + hopHeight
        catRef.current.rotation.z = Math.sin(t * Math.PI) * 0.3
      } else {
        const walkTime = elapsed - DEATH_HOP_DURATION
        const walkDist = walkTime * DEATH_WALK_SPEED
        const bob = Math.abs(Math.sin(walkTime * DEATH_WALK_BOB_SPEED)) * DEATH_WALK_BOB_HEIGHT
        catRef.current.position.x = 0.8 + walkDist
        catRef.current.position.y = 0.2 + bob
        catRef.current.rotation.z = Math.sin(walkTime * DEATH_WALK_BOB_SPEED) * 0.05
        catRef.current.rotation.y = Math.PI * 0.5
      }
      gameState.catHeight.current = groupRef.current.position.y
      return
    }

    // --- Active gameplay ---
    const targetSpeed = getTargetRunSpeed()
    gameState.speed.current = THREE.MathUtils.lerp(gameState.speed.current, targetSpeed, gameDelta * SPEED_RESPONSE)
    const musicTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
    const upcomingTarget = gameState.obstacleTargets.current.find((target) => target.targetTime >= musicTime - 0.02)
    const groundedTargetX = getDesiredRoadOffset(upcomingTarget?.x || 0)

    const jump = jumpState.current
    const activeGrind = gameState.activeGrind.current
    const isGrinding = Boolean(activeGrind?.active)
    gameState.jumping = jump.active || isGrinding
    const spin = spinState.current
    const powerslide = powerslideState.current
    const grindEntry = grindEntryState.current
    const speedRatio = Math.min(1.2, gameState.speed.current / Math.max(gameState.baseSpeed, 0.001))

    // Buffered spin input
    if (spinInputBuffer.current > 0) {
      spinInputBuffer.current = Math.max(0, spinInputBuffer.current - gameDelta)
      if (jump.active && jump.canSpinTrick && !jump.didSpinTrick && !spin.active && !isGrinding && !deathState.current.active) {
        triggerSpinTrick()
        spinInputBuffer.current = 0
      }
    }

    // Grind contact flash decay
    grindContactState.current.flash = Math.max(0, grindContactState.current.flash - gameDelta * GRIND_CONTACT_FLASH_DECAY)
    if (isGrinding) grindContactState.current.motionTime += gameDelta * (2.6 + speedRatio * 1.8)
    const grindMotion = grindContactState.current.motionTime
    const grindBalanceWave = Math.sin(grindMotion * 1.4)
    const grindCounterWave = Math.sin(grindMotion * 0.72 + 0.9)

    // Grind state transitions
    if (isGrinding) {
      if (!wasGrinding.current) {
        powerslide.direction = activeGrind.x < 0 ? -1 : 1
        beginGrindEntry(activeGrind)
      }
      if (jump.active) { jump.active = false; jump.time = 0 }
      if (spin.active) { spin.active = false; spin.time = 0 }
      powerslide.direction = activeGrind.x < 0 ? -1 : 1
    } else if (wasGrinding.current && !jump.active) {
      triggerLandingEffects({ fromGrind: true, direction: powerslide.direction })
    }
    if (!isGrinding && grindEntry.active) {
      grindEntry.active = false
      grindEntry.time = 0
      grindEntry.obstacleId = 0
    }

    wasGrinding.current = isGrinding
    powerslide.amount = THREE.MathUtils.lerp(powerslide.amount, isGrinding ? 1 : 0, gameDelta * POWERSLIDE_ENTER_LERP)
    let catSpinRotationY = 0
    let catSpinJustFinished = false

    if (spin.active && !isGrinding) {
      spin.time += gameDelta
      const spinT = Math.min(spin.time / SPIN_DURATION, 1)
      catSpinRotationY = spinT * Math.PI * 2
      if (spinT >= 1) { spin.active = false; spin.time = 0; catSpinRotationY = 0; catSpinJustFinished = true }
    }

    // --- Position updates: jump / grind / ride ---
    if (jump.active) {
      setGrindSparkInactive()
      jump.time += gameDelta
      const t = jump.time / JUMP_DURATION
      if (t >= 1) {
        jump.active = false; jump.time = 0
        groupRef.current.position.y = jump.endY
        groupRef.current.position.x = jump.targetX
        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
          boardRef.current.rotation.z = 0
        }
        triggerLandingEffects()
      } else {
        const height = 4 * jump.arcHeight * t * (1 - t)
        const travelT = THREE.MathUtils.smootherstep(t, 0, 1)
        groupRef.current.position.y = THREE.MathUtils.lerp(jump.startY, jump.endY, travelT) + height
        groupRef.current.position.x = THREE.MathUtils.lerp(jump.startX, jump.targetX, THREE.MathUtils.smootherstep(t, 0, 1))
        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
          boardRef.current.rotation.z = jump.doesFlip
            ? t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
            : THREE.MathUtils.lerp(boardRef.current.rotation.z, 0, gameDelta * 12)
        }
      }
    } else if (isGrinding) {
      const grindTargetX = getDesiredRoadOffset(activeGrind.x || 0)
      const grindBob = Math.sin(grindMotion * 3.2) * GRIND_BOB_HEIGHT + grindCounterWave * GRIND_BALANCE_BOB_Y * speedRatio
      const grindTargetRotZ = powerslide.direction * POWERSLIDE_GROUP_LEAN_Z + grindBalanceWave * GRIND_BALANCE_SWAY_Z * speedRatio
      const grindTargetRotX = GRIND_PITCH_X + POWERSLIDE_GROUP_PITCH_X + grindCounterWave * GRIND_BALANCE_PITCH_X * speedRatio
      const grindTargetBoardYaw = powerslide.direction * POWERSLIDE_BOARD_YAW + grindBalanceWave * 0.08 * speedRatio
      const grindTargetBoardRoll = -powerslide.direction * grindCounterWave * 0.045 * speedRatio

      if (grindEntry.active && grindEntry.obstacleId === activeGrind.obstacleId) {
        grindEntry.time += gameDelta
        const t = Math.min(grindEntry.time / GRIND_ENTRY_DURATION, 1)
        const ease = THREE.MathUtils.smootherstep(t, 0, 1)
        const float = Math.sin(t * Math.PI) * GRIND_ENTRY_FLOAT
        groupRef.current.position.x = THREE.MathUtils.lerp(grindEntry.startX, grindTargetX, ease)
        groupRef.current.position.y = THREE.MathUtils.lerp(grindEntry.startY, GRIND_GROUP_HEIGHT, ease) + float * (1 - ease * 0.5)
        groupRef.current.rotation.z = THREE.MathUtils.lerp(grindEntry.startRotZ, grindTargetRotZ, ease)
        groupRef.current.rotation.x = THREE.MathUtils.lerp(grindEntry.startRotX, grindTargetRotX, ease)
        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(grindEntry.startBoardYaw, grindTargetBoardYaw, ease)
          boardRef.current.rotation.z = THREE.MathUtils.lerp(grindEntry.startBoardRoll, grindTargetBoardRoll, ease)
        }
        if (t >= 1) { grindEntry.active = false; grindEntry.time = 0; grindEntry.obstacleId = 0 }
      } else {
        groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, grindTargetX, gameDelta * GRIND_ALIGN_LERP)
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, GRIND_GROUP_HEIGHT + grindBob, gameDelta * GRIND_ALIGN_LERP)
        groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, grindTargetRotZ, gameDelta * 8)
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, grindTargetRotX, gameDelta * 8)
        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, grindTargetBoardYaw, gameDelta * 10)
          boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, grindTargetBoardRoll, gameDelta * 10)
        }
      }
      updateGrindSpark(powerslide.direction)
    } else {
      setGrindSparkInactive()
      const baseRideY = 0.05 + Math.sin(state.clock.elapsedTime * 4) * 0.04
      const baseRideRoll = Math.sin(state.clock.elapsedTime * 1.5) * 0.03
      const baseRidePitch = -0.05 + Math.sin(state.clock.elapsedTime * 2.5) * 0.02
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, groundedTargetX, gameDelta * CAT_GROUNDED_LERP)
      groupRef.current.position.y = baseRideY
      groupRef.current.rotation.z = baseRideRoll
      groupRef.current.rotation.x = baseRidePitch
      if (boardRef.current) {
        boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
        boardRef.current.rotation.z = 0
      }
    }

    gameState.catHeight.current = groupRef.current.position.y

    // Cat body pose (powerslide lean, grind balance)
    const grindBodyShiftX = isGrinding ? grindBalanceWave * GRIND_CAT_BALANCE_X * speedRatio : 0
    const grindBodyBob = isGrinding ? grindCounterWave * GRIND_CAT_BALANCE_Y * speedRatio : 0
    const grindBodyYaw = isGrinding ? grindCounterWave * GRIND_CAT_BALANCE_YAW * speedRatio : 0
    const grindBodyLean = isGrinding ? grindBalanceWave * GRIND_CAT_BALANCE_LEAN * speedRatio : 0
    const catPoseAmount = jump.active ? 0 : powerslide.amount
    const catTargetX = POWERSLIDE_CAT_OFFSET_X * powerslide.direction * catPoseAmount + grindBodyShiftX * powerslide.direction
    const catTargetY = 0.2 - POWERSLIDE_CAT_CROUCH * catPoseAmount + grindBodyBob
    catRef.current.position.x = THREE.MathUtils.lerp(catRef.current.position.x, catTargetX, gameDelta * 12)
    catRef.current.position.y = THREE.MathUtils.lerp(catRef.current.position.y, catTargetY, gameDelta * 12)
    catRef.current.rotation.y = catSpinJustFinished
      ? 0
      : spin.active
        ? catSpinRotationY
        : THREE.MathUtils.lerp(catRef.current.rotation.y, POWERSLIDE_CAT_TURN_Y * powerslide.direction * catPoseAmount + grindBodyYaw * powerslide.direction, gameDelta * 10)
    catRef.current.rotation.z = THREE.MathUtils.lerp(catRef.current.rotation.z, POWERSLIDE_CAT_LEAN_Z * powerslide.direction * catPoseAmount + grindBodyLean * powerslide.direction, gameDelta * 10)

    // Grind light
    if (grindLightRef.current) {
      grindLightRef.current.position.x = powerslide.direction * 0.14
      const contactBase = isGrinding ? 1.2 + speedRatio * 1.8 : 0
      const targetIntensity = contactBase + grindContactState.current.flash * 5.2
      const targetDistance = isGrinding ? 0.75 + speedRatio * 0.45 + grindContactState.current.flash * 0.18 : 0.01
      grindLightRef.current.intensity = THREE.MathUtils.lerp(grindLightRef.current.intensity, targetIntensity, gameDelta * 14)
      grindLightRef.current.distance = THREE.MathUtils.lerp(grindLightRef.current.distance, targetDistance, gameDelta * 10)
    }

    // Squash-and-stretch on landing
    const sq = squashState.current
    if (sq.active) {
      sq.time += gameDelta
      const t = Math.min(sq.time / SQUASH_DURATION, 1)
      const bounce = Math.sin(t * Math.PI * 2.5) * Math.exp(-t * 3)
      const squash = 1 - 0.35 * bounce
      const stretch = 1 + 0.25 * bounce
      catRef.current.scale.set(stretch, squash, stretch)
      if (t >= 1) { sq.active = false; catRef.current.scale.set(1, 1, 1) }
    } else if (!deathState.current.active) {
      catRef.current.scale.set(1, 1, 1)
    }

    // Board landing recoil
    if (boardRef.current) {
      const landingBoard = boardLandingState.current
      let recoilPitch = 0
      let recoilRoll = 0
      let recoilDrop = 0
      if (landingBoard.active) {
        landingBoard.time += gameDelta
        const t = Math.min(landingBoard.time / BOARD_LANDING_RECOIL_DURATION, 1)
        const bounce = Math.sin(t * Math.PI * 2.2) * Math.exp(-t * 3.4)
        recoilPitch = -bounce * BOARD_LANDING_PITCH
        recoilRoll = bounce * landingBoard.roll
        recoilDrop = -Math.sin(t * Math.PI) * BOARD_LANDING_DIP
        if (t >= 1) { landingBoard.active = false; landingBoard.time = 0; landingBoard.roll = 0; landingBoard.strength = 1 }
      }
      boardRef.current.position.y = recoilDrop * landingBoard.strength
      boardRef.current.rotation.x = recoilPitch * landingBoard.strength
      boardRef.current.rotation.z += recoilRoll
    }
  })

  return { introStateRef: introState }
}
