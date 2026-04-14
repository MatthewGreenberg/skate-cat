import { useEffect, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, useGLTF } from '@react-three/drei'
import { folder } from 'leva'
import * as THREE from 'three'
import {
  buildRunSummary,
  createIdleGrindState,
  emitHudScoreChange,
  gameState,
  getGameDelta,
  getScoreMultiplier,
  getTargetRunSpeed,
  isDebug,
  isDownbeatTest,
  isObstacleSpacingDebug,
  isTimingDebug,
  removeObstacleTarget,
  resetObstacleTargets,
  upsertObstacleTarget,
} from '../store'
import { BEAT_INTERVAL, getObstacleHitTime, getPerceivedMusicTime } from '../rhythm'
import { createLogToonMaterial, createContactShadowTexture } from '../lib/toonMaterials'
import { useOptionalControls } from '../lib/debugControls'
import {
  MEASURE_LENGTH_BEATS, MEASURE_PHASE_OFFSET_BEATS, STARTUP_SAFE_BEATS,
  COUNTDOWN_BEATS, TIMING_POINTS, SPIN_TRICK_BONUS_POINTS, MAX_RAMP_SCORE,
  MAX_DIFFICULTY_SCORE_EQUIVALENT, PATTERN_LIBRARY,
  clamp01, getStartupMeasureCursor, getRunDifficultyProgress, getRunPhase,
  getWeightedPatternPool, pickWeightedPattern, pickWeightedEntry,
  shouldUseRail, getWeightedRailPatternPool, getPlacementPool,
  getPatternAnalysisMultiplier, getBlendedWeightMultiplier,
} from '../lib/obstaclePatterns'
import {
  LANE_POSITIONS, GRIND_RAIL_LENGTH_MIN, GRIND_RAIL_LENGTH_MAX,
  GRIND_ENTRY_PADDING, GRIND_EXIT_PADDING, GRIND_EXIT_RECOVERY_PADDING,
  LOG_COLLISION_ENTRY_DISTANCE, LOG_COLLISION_EXIT_DISTANCE,
  getLaneX, getLanePreferenceOrder,
  getGrindHalfLength, getGrindEntryMinZ, getGrindExitZ,
  getPredictedTravelDistance,
  getObstacleLaneWindow, obstaclesHaveMixedTimeConflict,
  buildObstacleDebugEntries,
} from '../lib/obstacleLaneLogic'
import {
  TRACK_ANALYSIS_URL,
  buildTrackAnalysisLookups, getMeasureAnalysis,
} from '../lib/trackAnalysis'

const POOL_SIZE = 20
const LOOKAHEAD_BEATS = 10
const DESPAWN_BEHIND_SECONDS = 0.6
const SPEED_BOOST_SCORE_THRESHOLD = 8
const SPEED_LINES_SCORE_THRESHOLD = 16
const BURST_CLUSTER_GAP_BEATS = 0.75
const CONTACT_SHADOW_Y = 0.018
const CONTACT_SHADOW_LOG_OPACITY = 0.62
const CONTACT_SHADOW_RAIL_OPACITY = 0.32
const HORIZONTAL_LOG_ROTATION = Math.PI / 2
const VERTICAL_LOG_ROTATION = 0
const INITIAL_MEASURES_SINCE_RAIL = 3
const MIN_RAIL_SETUP_GAP_BEATS = 1.5
const HOLD_SIGN_WORLD_X = -1.04
const GRIND_RAIL_WIDTH = 0.18
const GRIND_RAIL_HEIGHT = 0.11
const GRIND_RAIL_SUPPORT_WIDTH = 0.07
const GRIND_RAIL_SUPPORT_DEPTH = 0.07
const GRIND_RAIL_SUPPORT_SPAN = 0.34
const GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT = 0.06
const GRIND_RAIL_SUPPORT_INSET = 0.78
const GRIND_RAIL_SUPPORT_GROUND_Y = 0.03
const GRIND_ENTRY_MAX_Z = 0.9
const GRIND_RISE_START_Z = -26
const GRIND_RISE_END_Z = -6.5
const GRIND_MAGNET_ENTRY_BACK_BUFFER = 0.55
const GRIND_MAGNET_ENTRY_FRONT_BUFFER = 0.28
const GRIND_MAGNET_HEIGHT_BUFFER = 0.16
const GRIND_RAIL_LOG_WIDTH = 0.28
const GRIND_RAIL_LOG_HEIGHT = 0.16
const GRIND_RAIL_LOG_FACET_ROTATION = Math.PI / 8
const GRIND_RAIL_SUPPORT_COLOR = '#7d5431'
const GRIND_RAIL_FOOT_COLOR = '#4f321c'
const GRIND_RAIL_REST_Y = GRIND_RAIL_HEIGHT * 0.2
const GRIND_RAIL_ACTIVE_Y = 0.36
const GRIND_REQUIRED_CAT_HEIGHT = 0.92
const LOG_CLEARANCE_HEIGHT = 0.88
const DEBUG_RECENT_OBSTACLE_RETENTION_BEATS = 6
const OBSTACLE_HIT_DISTANCE_CORRECTION_FAR = 4.5
const OBSTACLE_HIT_DISTANCE_CORRECTION_MID = 2.25
const OBSTACLE_HIT_DISTANCE_CORRECTION_NEAR = 0.8
const HIT_RECOVERY_SECONDS = 1.05
const HIT_SLOW_SPEED_FACTOR = 0.58
const LATE_JUMP_FAIL_OFFSET_SECONDS = 0.045
const JUMP_TUTORIAL_PROMPT = 'SPACE / UP / W / D TO JUMP ON THE BEAT'
const SPIN_TUTORIAL_PROMPT = 'LEFT / A / S FOR 360'
const PHASE_SPEED_BONUS = {
  early: 0,
  mid: 1.1,
  late: 2.2,
}
const PHASE_ANNOUNCEMENTS = {}
const TIMING_DEBUG_PATTERN_LIBRARY = [
  { name: 'centerSingle', offsets: [1], lanes: ['center'] },
  { name: 'leftSingle', offsets: [1], lanes: ['left'] },
  { name: 'rightSingle', offsets: [1], lanes: ['right'] },
  { name: 'centerLateSingle', offsets: [3], lanes: ['center'] },
  { name: 'leftRight', offsets: [1, 3], lanes: ['left', 'right'] },
  { name: 'railLeft', offsets: [1, 3], lanes: ['center', 'left'], railIndex: 1 },
  { name: 'railRight', offsets: [1, 3], lanes: ['center', 'right'], railIndex: 1 },
  { name: 'centerDouble', offsets: [1, 3], lanes: ['center', 'center'] },
  { name: 'lateRailCenter', offsets: [1, 3], lanes: ['left', 'center'], railIndex: 1 },
]


export default function Obstacles({
  musicRef,
  active: isActive = true,
  isRunning,
  canCollide = true,
  onLogHit,
  shadowMode = 'map',
}) {
  const useShadowMap = shadowMode === 'map'
  const log = useGLTF('/models/obstacles/large_tree_log/scene.gltf')
  const refs = useRef([])
  const logRefs = useRef([])
  const railRefs = useRef([])
  const railTopRefs = useRef([])
  const railFrontSupportRefs = useRef([])
  const railBackSupportRefs = useRef([])
  const signRefs = useRef([])
  const shadowRefs = useRef([])
  const timingMarkerRefs = useRef([])
  const active = useRef(
    Array.from({ length: POOL_SIZE }, () => ({
      id: 0,
      clusterId: 0,
      z: 0,
      visible: false,
      scored: false,
      x: 0,
      requestedLane: 'center',
      lane: 'center',
      scaleY: 1,
      rotY: 0,
      beatIndex: 0,
      hitScrollDistance: Number.NaN,
      isVertical: false,
      showHoldSign: false,
      railLength: GRIND_RAIL_LENGTH_MIN,
      railLift: 0,
    }))
  )
  const measureCursor = useRef(getStartupMeasureCursor())
  const patternHistory = useRef([])
  const placementHistory = useRef([])
  const consecutiveDensePatterns = useRef(0)
  const consecutiveChainPatterns = useRef(0)
  const measuresSinceRail = useRef(INITIAL_MEASURES_SINCE_RAIL)
  const logBlockedUntilBeat = useRef(0)
  const hasAssignedHoldTutorial = useRef(false)
  const nextObstacleId = useRef(1)
  const timingDebugPatternIndex = useRef(0)
  const contactShadowTexture = useMemo(() => createContactShadowTexture(), [])
  const recentDebugObstacles = useRef(new Map())
  const worldScrollDistance = useRef(0)
  const needsCursorSync = useRef(true)
  const lastRunPhase = useRef('early')
  const trackAnalysisLookups = useRef(buildTrackAnalysisLookups(null))
  const railLogGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false)
    // Bake the octagon so it uses the same local axes as the old rail box:
    // width on X, height on Y, length on Z.
    geometry.rotateX(Math.PI / 2)
    geometry.rotateZ(GRIND_RAIL_LOG_FACET_ROTATION)
    return geometry
  }, [])

  const {
    useTrackAnalysis,
    analysisBlend,
  } = useOptionalControls('Game', {
    'Music Analysis': folder({
      useTrackAnalysis: true,
      analysisBlend: { value: 0.8, min: 0, max: 1.5, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  const {
    logScale,
    logColor,
    logLightX,
    logLightY,
    logLightZ,
    logGlossiness,
    logSteps,
    logShadowBrightness,
    logBrightness,
  } = useOptionalControls('Game', {
    Obstacles: folder({
      logScale: { value: 0.8, min: 0.1, max: 3, step: 0.1 },
      logColor: '#905634',
      logLightX: { value: 4.0, min: -20, max: 20, step: 0.5 },
      logLightY: { value: -7.5, min: -20, max: 20, step: 0.5 },
      logLightZ: { value: 3.0, min: -20, max: 20, step: 0.5 },
      logGlossiness: { value: 1, min: 1, max: 100, step: 1 },
      logSteps: { value: 3, min: 1, max: 8, step: 1 },
      logShadowBrightness: { value: 0.2, min: 0, max: 1, step: 0.05 },
      logBrightness: { value: 1.7, min: 0.5, max: 4, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  const {
    shadowColor,
    shadowY,
    logShadowOpacity,
    logShadowOffsetX,
    logShadowOffsetZ,
    logShadowScaleX,
    logShadowScaleZ,
    railShadowOpacity,
    railShadowOffsetX,
    railShadowOffsetZ,
    railShadowScaleX,
    railShadowScaleZ,
  } = useOptionalControls('Game', {
    'Obstacle Shadows': folder({
      shadowColor: '#040201',
      shadowY: { value: CONTACT_SHADOW_Y, min: 0, max: 0.08, step: 0.001 },
      logShadowOpacity: { value: CONTACT_SHADOW_LOG_OPACITY, min: 0, max: 1, step: 0.01 },
      logShadowOffsetX: { value: -0.01, min: -0.3, max: 0.3, step: 0.01 },
      logShadowOffsetZ: { value: 0.15, min: -0.3, max: 0.5, step: 0.01 },
      logShadowScaleX: { value: 2.15, min: 0.5, max: 4, step: 0.05 },
      logShadowScaleZ: { value: 0.82, min: 0.2, max: 2.5, step: 0.05 },
      railShadowOpacity: { value: CONTACT_SHADOW_RAIL_OPACITY, min: 0, max: 1, step: 0.01 },
      railShadowOffsetX: { value: 0.02, min: -0.3, max: 0.3, step: 0.01 },
      railShadowOffsetZ: { value: 0.06, min: -0.3, max: 0.5, step: 0.01 },
      railShadowScaleX: { value: 2.45, min: 0.5, max: 4, step: 0.05 },
      railShadowScaleZ: { value: 0.52, min: 0.2, max: 3, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  const logMaterial = useMemo(
    () => createLogToonMaterial({
      color: logColor,
      lightX: logLightX,
      lightY: logLightY,
      lightZ: logLightZ,
      glossiness: logGlossiness,
      rimAmount: 0,
      rimThreshold: 0,
      steps: logSteps,
      shadowBrightness: logShadowBrightness,
      brightness: logBrightness,
      rimColor: '#000000',
    }),
    [
      logColor,
      logLightX,
      logLightY,
      logLightZ,
      logGlossiness,
      logSteps,
      logShadowBrightness,
      logBrightness,
    ]
  )
  const railWoodMaterial = logMaterial
  const railSupportMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: GRIND_RAIL_SUPPORT_COLOR }), [])
  const railFootMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: GRIND_RAIL_FOOT_COLOR }), [])
  const holdSignPoleMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#8f6540' }), [])
  const holdSignBoardMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#5f3f26' }), [])
  const holdGlowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#8ae4ff', toneMapped: false }),
    []
  )

  const wasGameOver = useRef(false)
  const graceTimer = useRef(3.0) // invincibility grace period at start
  const hitRecoveryTimer = useRef(0)

  useEffect(() => {
    let cancelled = false

    fetch(TRACK_ANALYSIS_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((analysis) => {
        if (cancelled || !analysis) return
        trackAnalysisLookups.current = buildTrackAnalysisLookups(analysis)
      })
      .catch(() => {
        if (cancelled) return
        trackAnalysisLookups.current = buildTrackAnalysisLookups(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => {
    railLogGeometry.dispose()
  }, [railLogGeometry])

  useEffect(() => () => {
    logMaterial.dispose()
    railSupportMaterial.dispose()
    railFootMaterial.dispose()
    holdSignPoleMaterial.dispose()
    holdSignBoardMaterial.dispose()
    holdGlowMaterial.dispose()
  }, [holdGlowMaterial, holdSignBoardMaterial, holdSignPoleMaterial, logMaterial, railFootMaterial, railSupportMaterial])

  const resetObstacleSlot = (slot) => {
    slot.id = 0
    slot.clusterId = 0
    slot.z = 0
    slot.visible = false
    slot.scored = false
    slot.x = 0
    slot.requestedLane = 'center'
    slot.lane = 'center'
    slot.scaleY = 1
    slot.rotY = HORIZONTAL_LOG_ROTATION
    slot.beatIndex = 0
    slot.hitScrollDistance = Number.NaN
    slot.isVertical = false
    slot.showHoldSign = false
    slot.railLength = GRIND_RAIL_LENGTH_MIN
    slot.railLift = 0
  }

  const deactivateObstacleSlot = (slot) => {
    removeObstacleTarget(slot.id)
    resetObstacleSlot(slot)
  }

  const stopGrinding = () => {
    if (gameState.activeGrind.current?.active) {
      gameState.activeGrind.current = createIdleGrindState()
    }
  }

  const setTutorialPrompt = (nextPrompt) => {
    if (gameState.tutorialPrompt.current === nextPrompt) return
    gameState.tutorialPrompt.current = nextPrompt
    emitHudScoreChange()
  }

  const updateTutorialPrompt = (currentBeat) => {
    let nextPrompt = ''
    if (currentBeat < STARTUP_SAFE_BEATS + 16 && gameState.progressScore < 6) {
      nextPrompt = JUMP_TUTORIAL_PROMPT
    } else if (
      gameState.groundSpinCount.current <= 0 &&
      currentBeat < STARTUP_SAFE_BEATS + 40
    ) {
      nextPrompt = SPIN_TUTORIAL_PROMPT
    }
    setTutorialPrompt(nextPrompt)
  }

  const getFailureReason = ({
    obstacle,
    matchedTiming,
    hasLogClearance,
    isGrindingThisObstacle,
    grindHeightThreshold,
  }) => {
    if (obstacle.isVertical) {
      if (gameState.jumping && !gameState.upArrowHeld.current) return 'missed rail hold'
      if (gameState.jumping && gameState.catHeight.current < grindHeightThreshold) return 'low jump'
      if (matchedTiming?.offset > LATE_JUMP_FAIL_OFFSET_SECONDS) return 'late jump'
      return 'collision'
    }

    if (gameState.jumping && !hasLogClearance) return 'low jump'
    if (matchedTiming?.offset > LATE_JUMP_FAIL_OFFSET_SECONDS && !isGrindingThisObstacle) return 'late jump'
    return 'collision'
  }

  useEffect(() => {
    if (isActive) return

    for (let i = 0; i < POOL_SIZE; i += 1) {
      resetObstacleSlot(active.current[i])
      if (refs.current[i]) refs.current[i].visible = false
      if (logRefs.current[i]) logRefs.current[i].visible = false
      if (railRefs.current[i]) railRefs.current[i].visible = false
      if (signRefs.current[i]) signRefs.current[i].visible = false
      if (timingMarkerRefs.current[i]) timingMarkerRefs.current[i].visible = false
    }

    needsCursorSync.current = true
    patternHistory.current = []
    placementHistory.current = []
    consecutiveDensePatterns.current = 0
    consecutiveChainPatterns.current = 0
    measuresSinceRail.current = INITIAL_MEASURES_SINCE_RAIL
    logBlockedUntilBeat.current = 0
    hasAssignedHoldTutorial.current = false
    timingDebugPatternIndex.current = 0
    recentDebugObstacles.current.clear()
    resetObstacleTargets()
    gameState.obstacleDebug.current = []
    gameState.upArrowHeld.current = false
    gameState.grindCooldownObstacleId.current = 0
    gameState.runDifficultyProgress.current = 0
    gameState.phaseSpeedBonus.current = 0
    gameState.phaseAnnouncement.current = ''
    gameState.runPhase.current = 'early'
    worldScrollDistance.current = 0
    graceTimer.current = 3.0
    hitRecoveryTimer.current = 0
    gameState.tutorialPrompt.current = ''
    lastRunPhase.current = 'early'
    stopGrinding()
  }, [isActive])

  const laneHasMixedObstacleConflict = ({ lane, beatIndex, isVertical, railLength, pendingObstacles = [] }) => {
    const laneConflictSpeed = Math.max(gameState.speed.current || 0, gameState.baseSpeed || 0, 0.001)
    const candidateWindow = getObstacleLaneWindow({ beatIndex, isVertical, railLength }, laneConflictSpeed)
    const hasConflict = (obstacle) => {
      const obstacleWindow = getObstacleLaneWindow(obstacle, laneConflictSpeed)

      return (
        obstacle.lane === lane &&
        Boolean(obstacle.isVertical) !== Boolean(isVertical) &&
        candidateWindow.startBeat <= obstacleWindow.endBeat &&
        candidateWindow.endBeat >= obstacleWindow.startBeat
      )
    }

    return (
      active.current.some((ob) => ob.visible && hasConflict(ob)) ||
      pendingObstacles.some((ob) => hasConflict(ob))
    )
  }

  const hasMixedObstacleTimeConflict = ({ beatIndex, isVertical, railLength, pendingObstacles = [] }) => {
    const conflictSpeed = Math.max(gameState.speed.current || 0, gameState.baseSpeed || 0, 0.001)
    const candidate = { beatIndex, isVertical, railLength }
    const hasConflict = (obstacle) => obstaclesHaveMixedTimeConflict(candidate, obstacle, conflictSpeed)

    return (
      active.current.some((ob) => ob.visible && hasConflict(ob)) ||
      pendingObstacles.some((ob) => hasConflict(ob))
    )
  }

  const getSpawnLane = (preferredLane, beatIndex, isVertical, pendingObstacles = [], railLength = GRIND_RAIL_LENGTH_MIN) => {
    const orderedLanes = getLanePreferenceOrder(preferredLane)
    const openLane = orderedLanes.find(
      (lane) => !laneHasMixedObstacleConflict({ lane, beatIndex, isVertical, railLength, pendingObstacles })
    )
    return openLane || preferredLane
  }

  const getRailLength = (isVertical, railLength) => {
    if (!isVertical) return GRIND_RAIL_LENGTH_MIN
    if (typeof railLength === 'number') return railLength
    return GRIND_RAIL_LENGTH_MIN + Math.random() * (GRIND_RAIL_LENGTH_MAX - GRIND_RAIL_LENGTH_MIN)
  }

  const startGrinding = (obstacle) => {
    gameState.activeGrind.current = {
      active: true,
      obstacleId: obstacle.id,
      x: obstacle.x || 0,
      z: obstacle.z,
    }
  }

  const choosePatternType = (minOffset = 0, measureAnalysis = null, difficultyProgress = 0, runPhase = getRunPhase()) => {
    const progressScore = gameState.progressScore
    const effectiveScore = Math.max(progressScore, clamp01(difficultyProgress) * MAX_DIFFICULTY_SCORE_EQUIVALENT)
    const rampProgress = Math.min(effectiveScore / MAX_RAMP_SCORE, 1)
    const recent = patternHistory.current
    let pool = getWeightedPatternPool(progressScore, minOffset, difficultyProgress, runPhase)

    if (consecutiveDensePatterns.current >= (difficultyProgress >= 0.65 ? 3 : 2)) {
      pool = pool.filter(({ name }) => !PATTERN_LIBRARY[name].dense)
    }
    if (consecutiveChainPatterns.current >= (difficultyProgress >= 0.75 ? 3 : 2)) {
      pool = pool.filter(({ name }) => !PATTERN_LIBRARY[name].chain)
    }
    if (recent.length >= 2 && recent[recent.length - 1] === recent[recent.length - 2] && pool.length > 1) {
      pool = pool.filter(({ name }) => name !== recent[recent.length - 1])
    }
    if (
      effectiveScore >= 18 &&
      recent.length >= 2 &&
      recent.every((pattern) => !PATTERN_LIBRARY[pattern]?.dense)
    ) {
      pool = pool.map((entry) => ({
        ...entry,
        weight: PATTERN_LIBRARY[entry.name].dense ? entry.weight * (1.15 + rampProgress * 0.35) : entry.weight,
      }))
    }
    if (
      effectiveScore >= 24 &&
      recent.length >= 2 &&
      recent.every((pattern) => PATTERN_LIBRARY[pattern]?.dense)
    ) {
      pool = pool.map((entry) => ({
        ...entry,
        weight: !PATTERN_LIBRARY[entry.name].dense ? entry.weight * 1.2 : entry.weight,
      }))
    }

    if (measureAnalysis && useTrackAnalysis && analysisBlend > 0) {
      pool = pool.map((entry) => ({
        ...entry,
        weight: entry.weight * getBlendedWeightMultiplier(
          getPatternAnalysisMultiplier(entry.name, measureAnalysis),
          analysisBlend,
        ),
      }))
    }

    if (pool.length === 0) return null
    return pickWeightedPattern(pool)
  }

  const scheduleMeasurePattern = (measureStartBeat) => {
    if (isDownbeatTest) {
      const downbeatOffsets = [1, 3]

      downbeatOffsets.forEach((beatOffset, index) => {
        spawnObstacleForBeat({
          beatIndex: measureStartBeat + beatOffset,
          clusterId: `downbeat:${measureStartBeat}:${index + 1}`,
          lane: 'center',
          isVertical: false,
          railLength: GRIND_RAIL_LENGTH_MIN,
        })
      })
      return
    }

    if (isTimingDebug) {
      const debugPattern = TIMING_DEBUG_PATTERN_LIBRARY[timingDebugPatternIndex.current % TIMING_DEBUG_PATTERN_LIBRARY.length]
      timingDebugPatternIndex.current += 1
      let clusterId = 0
      let previousBeatOffset = null

      debugPattern.offsets.forEach((beatOffset, index) => {
        if (previousBeatOffset === null || beatOffset - previousBeatOffset > BURST_CLUSTER_GAP_BEATS) {
          clusterId += 1
        }
        spawnObstacleForBeat({
          beatIndex: measureStartBeat + beatOffset,
          clusterId: `debug:${measureStartBeat}:${clusterId}`,
          lane: debugPattern.lanes[index] || debugPattern.lanes[debugPattern.lanes.length - 1] || 'center',
          isVertical: debugPattern.railIndex === index,
        })
        previousBeatOffset = beatOffset
      })
      return
    }

    const progressScore = gameState.progressScore
    const difficultyProgress = getRunDifficultyProgress(progressScore, measureStartBeat)
    const runPhase = getRunPhase(measureStartBeat)
    const measureAnalysis = useTrackAnalysis
      ? getMeasureAnalysis(trackAnalysisLookups.current, measureStartBeat)
      : null
    const recentPatternName = patternHistory.current[patternHistory.current.length - 1] || ''
    const useRail = shouldUseRail(
      progressScore,
      measuresSinceRail.current,
      measureAnalysis,
      analysisBlend,
      difficultyProgress,
      runPhase,
    )

    if (useRail) {
      const railPattern = pickWeightedEntry(
        getWeightedRailPatternPool(
          progressScore,
          recentPatternName,
          measureAnalysis,
          analysisBlend,
          difficultyProgress,
          runPhase,
        )
      )
      if (railPattern) {
        let clusterId = 0
        let previousBeatOffset = null
        let railBlockEndBeat = logBlockedUntilBeat.current
        const scheduledPattern = railPattern.offsets.map((beatOffset, index) => ({
          beatOffset,
          beatIndex: measureStartBeat + beatOffset,
          lane: railPattern.lanes[index] || railPattern.lanes[railPattern.lanes.length - 1] || 'center',
          isVertical: railPattern.railIndex === index,
          railLength: getRailLength(railPattern.railIndex === index),
        }))

        scheduledPattern.forEach(({ beatOffset, beatIndex, lane, isVertical, railLength }, index) => {
          if (previousBeatOffset === null || beatOffset - previousBeatOffset > BURST_CLUSTER_GAP_BEATS) {
            clusterId += 1
          }
          const didSpawn = spawnObstacleForBeat({
            beatIndex,
            clusterId: `${measureStartBeat}:rail:${clusterId}`,
            lane,
            isVertical,
            railLength,
            pendingObstacles: scheduledPattern.slice(index + 1),
          })
          if (didSpawn && isVertical) {
            railBlockEndBeat = Math.max(
              railBlockEndBeat,
              getObstacleLaneWindow({ beatIndex, isVertical: true, railLength }, Math.max(gameState.speed.current || 0, gameState.baseSpeed || 0, 0.001)).endBeat
            )
          }
          previousBeatOffset = beatOffset
        })

        logBlockedUntilBeat.current = railBlockEndBeat
        patternHistory.current.push(railPattern.name)
        if (patternHistory.current.length > 2) patternHistory.current.shift()
        consecutiveDensePatterns.current = railPattern.dense ? consecutiveDensePatterns.current + 1 : 0
        consecutiveChainPatterns.current = railPattern.chain ? consecutiveChainPatterns.current + 1 : 0
        measuresSinceRail.current = 0
        return
      }
    }

    const blockedOffset = Math.max(0, logBlockedUntilBeat.current - measureStartBeat)
    const patternType = choosePatternType(blockedOffset, measureAnalysis, difficultyProgress, runPhase)
    const patternMeta = patternType ? (PATTERN_LIBRARY[patternType] || null) : null

    if (!patternMeta) {
      consecutiveDensePatterns.current = 0
      consecutiveChainPatterns.current = 0
      measuresSinceRail.current += 1
      return
    }

    const pattern = [...patternMeta.offsets].sort((a, b) => a - b)
    const placementPool = getPlacementPool({
      count: pattern.length,
      dense: patternMeta.dense,
      score: progressScore,
      recentPlacementName: placementHistory.current[placementHistory.current.length - 1] || '',
      measureAnalysis,
      analysisBlend,
      difficultyProgress,
      runPhase,
    })
    const placement = pickWeightedEntry(placementPool) || { name: 'fallback', lanes: Array(pattern.length).fill('center') }
    let clusterId = 0
    let previousBeatOffset = null

    const scheduledPattern = pattern.map((beatOffset, index) => ({
      beatOffset,
      beatIndex: measureStartBeat + beatOffset,
      lane: placement.lanes[index] || placement.lanes[placement.lanes.length - 1] || 'center',
      isVertical: false,
      railLength: GRIND_RAIL_LENGTH_MIN,
    }))

    scheduledPattern.forEach(({ beatOffset, beatIndex, lane, isVertical, railLength }, index) => {
      if (previousBeatOffset === null || beatOffset - previousBeatOffset > BURST_CLUSTER_GAP_BEATS) {
        clusterId += 1
      }
      spawnObstacleForBeat({
        beatIndex,
        clusterId: `${measureStartBeat}:${clusterId}`,
        lane,
        isVertical,
        railLength,
        pendingObstacles: scheduledPattern.slice(index + 1),
      })
      previousBeatOffset = beatOffset
    })

    patternHistory.current.push(patternType)
    if (patternHistory.current.length > 2) patternHistory.current.shift()
    placementHistory.current.push(placement.name)
    if (placementHistory.current.length > 2) placementHistory.current.shift()

    consecutiveDensePatterns.current = patternMeta.dense ? consecutiveDensePatterns.current + 1 : 0
    consecutiveChainPatterns.current = patternMeta.chain ? consecutiveChainPatterns.current + 1 : 0
    measuresSinceRail.current += 1
  }

  const spawnObstacleForBeat = ({
    beatIndex,
    clusterId,
    lane,
    isVertical,
    railLength,
    pendingObstacles = [],
  }) => {
    const slot = active.current.find(o => !o.visible)
    if (!slot) return false
    const resolvedRailLength = getRailLength(isVertical, railLength)

    // Rails and logs should not share the same time window, even in different lanes.
    if (!isVertical && hasMixedObstacleTimeConflict({ beatIndex, isVertical, railLength: resolvedRailLength, pendingObstacles })) {
      return false
    }

    const spawnLane = getSpawnLane(lane, beatIndex, isVertical, pendingObstacles, resolvedRailLength)

    // Start far ahead; beat-sync positioning is applied later in the frame.
    slot.z = -100
    slot.visible = true
    slot.scored = false
    slot.id = nextObstacleId.current++
    slot.clusterId = clusterId
    slot.beatIndex = beatIndex
    // Pooled slots are recycled after despawn; clear the previous hit anchor so
    // a new obstacle doesn't inherit stale timing and jump in late.
    slot.hitScrollDistance = Number.NaN
    slot.rotY = isVertical ? VERTICAL_LOG_ROTATION : HORIZONTAL_LOG_ROTATION
    slot.scaleY = (isTimingDebug || isDownbeatTest) ? 1 : 0.7 + Math.random() * 0.6
    slot.x = (isTimingDebug || isDownbeatTest) ? (LANE_POSITIONS[spawnLane] ?? 0) : getLaneX(spawnLane)
    slot.requestedLane = lane
    slot.lane = spawnLane
    slot.isVertical = isVertical
    slot.showHoldSign = isVertical && !hasAssignedHoldTutorial.current
    if (slot.showHoldSign) hasAssignedHoldTutorial.current = true
    slot.railLength = resolvedRailLength
    slot.railLift = 0
    upsertObstacleTarget({
      id: slot.id,
      clusterId: slot.clusterId,
      targetTime: getObstacleHitTime(slot.beatIndex),
      x: slot.x || 0,
      isVertical: Boolean(slot.isVertical),
    })
    return true
  }

  useFrame((_, delta) => {
    if (!isActive) return

    // Reset obstacles when game restarts
    if (wasGameOver.current && !gameState.gameOver) {
      for (let i = 0; i < POOL_SIZE; i++) {
        resetObstacleSlot(active.current[i])
        if (refs.current[i]) refs.current[i].visible = false
      }
      const musicTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
      measureCursor.current = getStartupMeasureCursor(musicTime)
      patternHistory.current = []
      placementHistory.current = []
      consecutiveDensePatterns.current = 0
      consecutiveChainPatterns.current = 0
      measuresSinceRail.current = INITIAL_MEASURES_SINCE_RAIL
      logBlockedUntilBeat.current = 0
      hasAssignedHoldTutorial.current = false
      timingDebugPatternIndex.current = 0
      recentDebugObstacles.current.clear()
      resetObstacleTargets()
      gameState.obstacleDebug.current = []
      gameState.upArrowHeld.current = false
      gameState.grindCooldownObstacleId.current = 0
      gameState.runDifficultyProgress.current = 0
      gameState.phaseSpeedBonus.current = 0
      worldScrollDistance.current = 0
      hitRecoveryTimer.current = 0
      gameState.tutorialPrompt.current = ''
      gameState.phaseAnnouncement.current = ''
      gameState.runPhase.current = 'early'
      lastRunPhase.current = 'early'
      stopGrinding()
      graceTimer.current = 3.0
      wasGameOver.current = false
      return
    }
    if (gameState.gameOver) {
      resetObstacleTargets()
      gameState.obstacleDebug.current = []
      recentDebugObstacles.current.clear()
      gameState.grindCooldownObstacleId.current = 0
      gameState.runDifficultyProgress.current = 0
      gameState.phaseSpeedBonus.current = 0
      worldScrollDistance.current = 0
      hitRecoveryTimer.current = 0
      gameState.tutorialPrompt.current = ''
      gameState.phaseAnnouncement.current = ''
      stopGrinding()
      wasGameOver.current = true
      return
    }
    if (!isRunning) return

    const speed = gameState.speed.current
    const gameDelta = getGameDelta(delta)
    const targetSpeed = getTargetRunSpeed()
    if (graceTimer.current > 0) graceTimer.current -= gameDelta
    if (hitRecoveryTimer.current > 0) hitRecoveryTimer.current -= gameDelta
    const music = musicRef?.current
    const isMusicRunning = Boolean(music && !music.paused)
    const musicTime = isMusicRunning ? getPerceivedMusicTime(music.currentTime) : 0

    if (isMusicRunning) {
      worldScrollDistance.current += speed * gameDelta
    }

    if (isMusicRunning) {
      if (needsCursorSync.current) {
        measureCursor.current = getStartupMeasureCursor(musicTime)
        needsCursorSync.current = false
      }
      const currentBeat = Math.floor(musicTime / BEAT_INTERVAL)
      const currentPhase = getRunPhase(currentBeat)
      if (lastRunPhase.current !== currentPhase) {
        lastRunPhase.current = currentPhase
        gameState.runPhase.current = currentPhase
        gameState.phaseAnnouncement.current = PHASE_ANNOUNCEMENTS[currentPhase] || ''
        emitHudScoreChange()
      }
      gameState.phaseSpeedBonus.current = PHASE_SPEED_BONUS[currentPhase] || 0
      gameState.runDifficultyProgress.current = getRunDifficultyProgress(gameState.progressScore, currentBeat)
      updateTutorialPrompt(currentBeat)
      const hasClearedCountdown = currentBeat >= COUNTDOWN_BEATS
      const lookaheadBeat = hasClearedCountdown && currentBeat < STARTUP_SAFE_BEATS
        ? currentBeat + LOOKAHEAD_BEATS + STARTUP_SAFE_BEATS
        : currentBeat + LOOKAHEAD_BEATS
      if (hasClearedCountdown) {
        while (measureCursor.current <= lookaheadBeat) {
          scheduleMeasurePattern(measureCursor.current)
          measureCursor.current += MEASURE_LENGTH_BEATS
        }
      }
    }
    if (!isMusicRunning && gameState.tutorialPrompt.current) {
      setTutorialPrompt('')
    }

    if (gameState.activeGrind.current?.active && !gameState.upArrowHeld.current) {
      stopGrinding()
    }

    // Collision detection — cat is at z=0, check if log is near
    const isInGracePeriod = graceTimer.current > 0
    if (canCollide && hitRecoveryTimer.current <= 0) {
      collisionLoop:
      for (let i = 0; i < POOL_SIZE; i++) {
        const ob = active.current[i]
        if (!ob.visible) continue
        const activeGrind = gameState.activeGrind.current
        const obstacleWindowMinZ = ob.isVertical ? getGrindEntryMinZ(ob) : -LOG_COLLISION_ENTRY_DISTANCE
        const obstacleWindowMaxZ = ob.isVertical ? getGrindExitZ(ob) : LOG_COLLISION_EXIT_DISTANCE
        const grindMagnetEntryMinZ = obstacleWindowMinZ - GRIND_MAGNET_ENTRY_BACK_BUFFER
        const grindMagnetEntryMaxZ = GRIND_ENTRY_MAX_Z + GRIND_MAGNET_ENTRY_FRONT_BUFFER
        const grindAssistFactor = ob.isVertical
          ? THREE.MathUtils.clamp(1 - Math.abs(ob.z - 0.05) / 1.6, 0, 1)
          : 0
        const grindHeightThreshold = GRIND_REQUIRED_CAT_HEIGHT - GRIND_MAGNET_HEIGHT_BUFFER * grindAssistFactor
        const canStartGrind = ob.isVertical &&
          !activeGrind?.active &&
          gameState.grindCooldownObstacleId.current !== ob.id &&
          gameState.upArrowHeld.current &&
          gameState.jumping &&
          gameState.catHeight.current >= grindHeightThreshold &&
          ob.z > grindMagnetEntryMinZ &&
          ob.z < grindMagnetEntryMaxZ

        if (canStartGrind) {
          startGrinding(ob)
        }
        const currentActiveGrind = gameState.activeGrind.current
        const isGrindingThisObstacle = currentActiveGrind?.active && currentActiveGrind.obstacleId === ob.id
        const hasLogClearance = !ob.isVertical &&
          gameState.jumping &&
          gameState.catHeight.current >= LOG_CLEARANCE_HEIGHT
        const pendingTiming = gameState.pendingJumpTiming.current
        const matchedTiming = pendingTiming && pendingTiming.obstacleIds?.includes(ob.id)
          ? pendingTiming
          : null

        if (ob.z > obstacleWindowMinZ && ob.z < obstacleWindowMaxZ && !ob.scored) {
          if (((!ob.isVertical && !hasLogClearance) || (ob.isVertical && !isGrindingThisObstacle)) && !isDebug && !isInGracePeriod) {
            const failReason = getFailureReason({
              obstacle: ob,
              matchedTiming,
              hasLogClearance,
              isGrindingThisObstacle,
              grindHeightThreshold,
            })

            gameState.lastFailReason.current = failReason
            gameState.remainingLives.current = Math.max(0, (gameState.remainingLives.current ?? 1) - 1)
            gameState.streak.current = 0
            gameState.scoreMultiplier.current = 1
            gameState.speed.current = Math.max(gameState.baseSpeed * HIT_SLOW_SPEED_FACTOR, speed * HIT_SLOW_SPEED_FACTOR)
            gameState.comboEnergy.current = 0
            gameState.pendingJumpTiming.current = null
            gameState.upArrowHeld.current = false
            gameState.screenShake.current = 0.8
            deactivateObstacleSlot(ob)
            emitHudScoreChange()
            stopGrinding()
            if (onLogHit) onLogHit()
            if (gameState.remainingLives.current <= 0) {
              gameState.gameOver = true
              gameState.speed.current = 0
              gameState.speedLinesOn = false
              gameState.tutorialPrompt.current = ''
              gameState.phaseAnnouncement.current = ''
              gameState.lastRunSummary.current = buildRunSummary({ outcome: 'failed' })
              if (gameState.onGameOver) {
                gameState.onGameOver({
                  outcome: 'failed',
                  reason: failReason,
                  summary: gameState.lastRunSummary.current,
                })
              }
              return
            }

            hitRecoveryTimer.current = HIT_RECOVERY_SECONDS
            graceTimer.current = Math.max(graceTimer.current, HIT_RECOVERY_SECONDS)
            break collisionLoop
          }
          const timingGrade = matchedTiming?.grade || 'Sloppy'
          const nextStreak = timingGrade === 'Perfect'
            ? gameState.streak.current + 1
            : 0

          const multiplier = getScoreMultiplier(nextStreak)
          const landedSpinTrick = (
            timingGrade === 'Perfect' &&
            matchedTiming?.trickName === '360' &&
            !matchedTiming?.trickAwarded
          )
          const trickBonusPoints = landedSpinTrick ? SPIN_TRICK_BONUS_POINTS * multiplier : 0
          const points = TIMING_POINTS[timingGrade] * multiplier + trickBonusPoints

          ob.scored = true
          gameState.streak.current = nextStreak
          gameState.bestStreak.current = Math.max(gameState.bestStreak.current || 0, nextStreak)
          gameState.scoreMultiplier.current = multiplier
          gameState.progressScore += points
          gameState.score += points
          if (ob.isVertical) {
            gameState.railCount.current = (gameState.railCount.current || 0) + 1
          }
          if (landedSpinTrick) {
            gameState.groundSpinCount.current = (gameState.groundSpinCount.current || 0) + 1
          }
          const accuracyStats = gameState.accuracyStats.current || { Perfect: 0, Good: 0, Sloppy: 0 }
          accuracyStats[timingGrade] = (accuracyStats[timingGrade] || 0) + 1
          gameState.accuracyStats.current = accuracyStats
          gameState.comboEnergy.current = timingGrade === 'Sloppy'
            ? 0
            : timingGrade === 'Good'
              ? Math.max(gameState.comboEnergy.current, 0.7)
              : 1
          gameState.lastScoringEvent.current = {
            id: performance.now(),
            points,
            grade: timingGrade,
            multiplier,
            isRail: Boolean(ob.isVertical),
            trickName: landedSpinTrick ? '360' : '',
            label: landedSpinTrick ? '360' : ob.isVertical ? 'Rail' : timingGrade,
          }
          removeObstacleTarget(ob.id)
          emitHudScoreChange()
          if (matchedTiming) {
            const remainingObstacleIds = matchedTiming.obstacleIds.filter((id) => id !== ob.id)
            gameState.pendingJumpTiming.current = remainingObstacleIds.length > 0
              ? {
                ...matchedTiming,
                obstacleIds: remainingObstacleIds,
                trickAwarded: matchedTiming.trickAwarded || landedSpinTrick,
              }
              : null
          }
          if (gameState.progressScore >= SPEED_BOOST_SCORE_THRESHOLD && !gameState.speedBoostActive) {
            gameState.speedBoostActive = true
          }
          if (gameState.progressScore >= SPEED_LINES_SCORE_THRESHOLD && !gameState.speedLinesOn) {
            gameState.speedLinesOn = true
          }
        }
      }
    }

    // Move all active obstacles toward camera
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (!ob.visible) continue

      if (isMusicRunning) {
        const hitTime = getObstacleHitTime(ob.beatIndex)
        const timeUntilHit = hitTime - musicTime
        const desiredDistanceUntilHit = timeUntilHit >= 0
          ? getPredictedTravelDistance(timeUntilHit, speed, targetSpeed)
          : timeUntilHit * speed
        const desiredHitScrollDistance = worldScrollDistance.current + desiredDistanceUntilHit

        if (!Number.isFinite(ob.hitScrollDistance)) {
          ob.hitScrollDistance = desiredHitScrollDistance
        } else {
          const correctionRate = timeUntilHit > 1.8
            ? OBSTACLE_HIT_DISTANCE_CORRECTION_FAR
            : timeUntilHit > 0.75
              ? OBSTACLE_HIT_DISTANCE_CORRECTION_MID
              : OBSTACLE_HIT_DISTANCE_CORRECTION_NEAR
          // Keep obstacles scrolling with the world and only nudge their
          // world-space hit anchor toward the beat schedule over time.
          ob.hitScrollDistance = THREE.MathUtils.damp(
            ob.hitScrollDistance,
            desiredHitScrollDistance,
            correctionRate,
            gameDelta,
          )
        }

        const distanceUntilHit = ob.hitScrollDistance - worldScrollDistance.current
        const targetZ = ob.isVertical
          ? -distanceUntilHit - getGrindHalfLength(ob)
          : -distanceUntilHit
        ob.z = targetZ
        const hasClearedPlayer = ob.isVertical
          ? ob.z > getGrindExitZ(ob) + DESPAWN_BEHIND_SECONDS * speed
          : timeUntilHit < -DESPAWN_BEHIND_SECONDS
        if (hasClearedPlayer) {
          deactivateObstacleSlot(ob)
        }
      }

      if (ob.z > 15) {
        // passed behind camera, deactivate
        deactivateObstacleSlot(ob)
      }

      if (refs.current[i]) {
        refs.current[i].position.z = ob.z
        refs.current[i].visible = ob.visible
      }
    }

    // Update transforms
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (refs.current[i]) {
        refs.current[i].position.set(ob.x || 0, 0, ob.z)
        refs.current[i].rotation.y = ob.rotY || 0
        refs.current[i].visible = ob.visible
      }
      if (shadowRefs.current[i]) {
        shadowRefs.current[i].position.set(
          ob.isVertical ? railShadowOffsetX : logShadowOffsetX,
          shadowY,
          ob.isVertical ? railShadowOffsetZ : logShadowOffsetZ
        )
        shadowRefs.current[i].scale.set(
          ob.isVertical ? GRIND_RAIL_LOG_WIDTH * railShadowScaleX : logScale * logShadowScaleX,
          ob.isVertical ? (ob.railLength || GRIND_RAIL_LENGTH_MIN) * railShadowScaleZ : logScale * logShadowScaleZ,
          1
        )
        shadowRefs.current[i].material.opacity = ob.isVertical ? railShadowOpacity : logShadowOpacity
        shadowRefs.current[i].material.color.set(shadowColor)
      }
      if (logRefs.current[i]) {
        logRefs.current[i].visible = ob.visible && !ob.isVertical
      }
      if (railRefs.current[i]) {
        ob.railLift = ob.isVertical
          ? THREE.MathUtils.smootherstep(ob.z, GRIND_RISE_START_Z, GRIND_RISE_END_Z)
          : 0
        const railLength = ob.railLength || GRIND_RAIL_LENGTH_MIN
        const railY = THREE.MathUtils.lerp(
          GRIND_RAIL_REST_Y,
          GRIND_RAIL_ACTIVE_Y,
          ob.railLift
        )
        const supportHeight = Math.max(railY - GRIND_RAIL_SUPPORT_GROUND_Y, 0.12)
        const supportZ = Math.max(railLength * 0.5 - GRIND_RAIL_SUPPORT_INSET, 0)

        railRefs.current[i].visible = ob.visible && ob.isVertical
        railRefs.current[i].position.y = railY

        if (railTopRefs.current[i]) {
          railTopRefs.current[i].scale.set(GRIND_RAIL_LOG_WIDTH, GRIND_RAIL_LOG_HEIGHT, railLength)
        }
        if (railFrontSupportRefs.current[i]) {
          railFrontSupportRefs.current[i].position.set(0, -supportHeight * 0.5, supportZ)
          const [leftLeg, rightLeg, crossbar, leftFoot, rightFoot] = railFrontSupportRefs.current[i].children
          if (leftLeg) leftLeg.scale.y = supportHeight
          if (rightLeg) rightLeg.scale.y = supportHeight
          if (crossbar) crossbar.position.y = -supportHeight * 0.18
          if (leftFoot) leftFoot.position.y = -supportHeight * 0.5 + 0.025
          if (rightFoot) rightFoot.position.y = -supportHeight * 0.5 + 0.025
        }
        if (railBackSupportRefs.current[i]) {
          railBackSupportRefs.current[i].position.set(0, -supportHeight * 0.5, -supportZ)
          const [leftLeg, rightLeg, crossbar, leftFoot, rightFoot] = railBackSupportRefs.current[i].children
          if (leftLeg) leftLeg.scale.y = supportHeight
          if (rightLeg) rightLeg.scale.y = supportHeight
          if (crossbar) crossbar.position.y = -supportHeight * 0.18
          if (leftFoot) leftFoot.position.y = -supportHeight * 0.5 + 0.025
          if (rightFoot) rightFoot.position.y = -supportHeight * 0.5 + 0.025
        }
      }
      if (signRefs.current[i]) {
        signRefs.current[i].visible = ob.visible && ob.isVertical && ob.showHoldSign
        signRefs.current[i].position.set(
          HOLD_SIGN_WORLD_X - (ob.x || 0),
          0.62,
          getGrindHalfLength(ob) - 0.9
        )
        signRefs.current[i].rotation.y = 0.42
        signRefs.current[i].rotation.z = 0.08
      }
      if (timingMarkerRefs.current[i]) {
        const hitTime = getObstacleHitTime(ob.beatIndex)
        const timeUntilHit = hitTime - musicTime
        timingMarkerRefs.current[i].visible =
          isTimingDebug &&
          ob.visible &&
          timeUntilHit > -0.18 &&
          timeUntilHit < 4.5
        timingMarkerRefs.current[i].position.set(ob.x || 0, ob.isVertical ? GRIND_RAIL_ACTIVE_Y : 0.02, 0)
      }
    }

    const grindObstacleId = gameState.activeGrind.current?.obstacleId
    if (grindObstacleId) {
      const grindObstacle = active.current.find((ob) => ob.visible && ob.id === grindObstacleId)
      if (!grindObstacle || grindObstacle.z > getGrindExitZ(grindObstacle)) {
        stopGrinding()
      } else {
        gameState.activeGrind.current = {
          active: true,
          obstacleId: grindObstacle.id,
          x: grindObstacle.x || 0,
          z: grindObstacle.z,
        }
      }
    }

    const grindCooldownObstacleId = gameState.grindCooldownObstacleId.current
    if (grindCooldownObstacleId) {
      const cooldownObstacle = active.current.find((ob) => ob.visible && ob.id === grindCooldownObstacleId)
      if (!cooldownObstacle || cooldownObstacle.z > getGrindExitZ(cooldownObstacle)) {
        gameState.grindCooldownObstacleId.current = 0
      }
    }

    if (isObstacleSpacingDebug) {
      const visibleObstacles = active.current.filter((ob) => ob.visible)
      const debugSpeed = Math.max(speed, gameState.baseSpeed || 0, 0.001)
      const currentBeat = musicTime / BEAT_INTERVAL

      for (const obstacle of visibleObstacles) {
        recentDebugObstacles.current.set(obstacle.id, {
          ...obstacle,
          lastSeenBeat: currentBeat,
        })
      }

      for (const [id, obstacle] of recentDebugObstacles.current.entries()) {
        const isStillVisible = visibleObstacles.some((visibleObstacle) => visibleObstacle.id === id)
        if (isStillVisible) continue
        if ((obstacle.lastSeenBeat || 0) < currentBeat - DEBUG_RECENT_OBSTACLE_RETENTION_BEATS) {
          recentDebugObstacles.current.delete(id)
        }
      }

      gameState.obstacleDebug.current = buildObstacleDebugEntries(
        Array.from(recentDebugObstacles.current.values()),
        debugSpeed
      )
    } else {
      recentDebugObstacles.current.clear()
      gameState.obstacleDebug.current = []
    }
  })

  const clonedScenes = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, () => {
        const scene = log.scene.clone()

        scene.traverse((child) => {
          if (!child.isMesh) return

          const sourceMaterial = child.material

          child.material = logMaterial
          child.material.side = sourceMaterial.side
          child.castShadow = useShadowMap
          child.receiveShadow = false
        })

        return scene
      }),
    [
      log.scene,
      logMaterial,
      useShadowMap,
    ]
  )

  return (
    <group>
      {clonedScenes.map((scene, i) => (
        <group key={i}>
          <group
            ref={(el) => (refs.current[i] = el)}
            visible={false}
          >
            <mesh
              ref={(el) => (shadowRefs.current[i] = el)}
              position={[0, shadowY, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[logScale * logShadowScaleX, logScale * logShadowScaleZ, 1]}
              renderOrder={2}
            >
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                map={contactShadowTexture}
                color={shadowColor}
                transparent
                opacity={logShadowOpacity}
                blending={THREE.MultiplyBlending}
                premultipliedAlpha
                toneMapped={false}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
            <primitive
              ref={(el) => (logRefs.current[i] = el)}
              object={scene}
              scale={logScale}
              rotation={[0, Math.PI / 2, 0]}
            />
            <group
              ref={(el) => (railRefs.current[i] = el)}
              visible={false}
            >
              <mesh
                ref={(el) => (railTopRefs.current[i] = el)}
                geometry={railLogGeometry}
                material={railWoodMaterial}
                castShadow={useShadowMap}
              />
              <group ref={(el) => (railFrontSupportRefs.current[i] = el)}>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[0, -0.28, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_SPAN + 0.06, GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} material={railFootMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} material={railFootMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                </mesh>
              </group>
              <group ref={(el) => (railBackSupportRefs.current[i] = el)}>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[0, -0.28, 0]} material={railSupportMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_SPAN + 0.06, GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT, GRIND_RAIL_SUPPORT_DEPTH]} />
                </mesh>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} material={railFootMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} material={railFootMaterial}>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                </mesh>
              </group>
            </group>
            <group
              ref={(el) => (signRefs.current[i] = el)}
              visible={false}
              scale={[1.22, 1.22, 1.22]}
            >
              <mesh position={[0, -0.1, 0]} material={holdSignPoleMaterial}>
                <boxGeometry args={[0.07, 0.55, 0.06]} />
              </mesh>
              <mesh position={[0, 0.18, 0]} material={holdSignBoardMaterial}>
                <boxGeometry args={[0.58, 0.34, 0.08]} />
              </mesh>
              <Text
                position={[0, 0.24, 0.05]}
                fontSize={0.115}
                color="#8ae4ff"
                outlineWidth={0.012}
                outlineColor="#2b1d11"
                anchorX="center"
                anchorY="middle"
              >
                HOLD
              </Text>
              <group position={[0, 0.08, 0.05]}>
                <mesh material={holdGlowMaterial}>
                  <boxGeometry args={[0.018, 0.05, 0.02]} />
                </mesh>
                <mesh position={[0, 0.043, 0]} material={holdGlowMaterial}>
                  <coneGeometry args={[0.038, 0.058, 3]} />
                </mesh>
              </group>
            </group>
          </group>
          <group ref={(el) => (timingMarkerRefs.current[i] = el)} visible={false}>
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.16, 0.24, 32]} />
              <meshBasicMaterial color="#7fe1ff" transparent opacity={0.8} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.26, 0]}>
              <boxGeometry args={[0.045, 0.52, 0.045]} />
              <meshBasicMaterial color="#7fe1ff" transparent opacity={0.35} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      {isTimingDebug && (
        <group position={[0, 0.018, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
            <planeGeometry args={[1.08, 0.16]} />
            <meshBasicMaterial color="#58d8ff" transparent opacity={0.24} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.01, 0]} renderOrder={4}>
            <boxGeometry args={[1.08, 0.012, 0.024]} />
            <meshBasicMaterial color="#9cecff" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

useGLTF.preload('/models/obstacles/large_tree_log/scene.gltf')
