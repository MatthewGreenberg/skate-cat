import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import { createIdleGrindState, gameState, getScoreMultiplier, isDebug } from '../store'
import { BEAT_INTERVAL } from '../rhythm'

const POOL_SIZE = 20
const LOOKAHEAD_BEATS = 10
const DESPAWN_BEHIND_SECONDS = 0.6
const POSITION_SMOOTHING = 0.35
const SPEED_BOOST_SCORE_THRESHOLD = 12
const SPEED_LINES_SCORE_THRESHOLD = 24
const MEASURE_LENGTH_BEATS = 4
const COUNTDOWN_BEATS = 4
const STARTUP_SAFE_BEATS = 12
const BURST_CLUSTER_GAP_BEATS = 0.75
const CONTACT_SHADOW_Y = 0.015
const CONTACT_SHADOW_OPACITY = 0.22
const HORIZONTAL_LOG_ROTATION = Math.PI / 2
const VERTICAL_LOG_ROTATION = 0
const LANE_JITTER = 0.035
const INITIAL_MEASURES_SINCE_RAIL = 3
const MIN_SCORE_FOR_RAILS = 8
const MIN_MEASURES_BETWEEN_RAILS = 2
const FORCE_RAIL_AFTER_MEASURES = 5
const MIN_RAIL_SETUP_GAP_BEATS = 1.5
const GRIND_RAIL_WIDTH = 0.18
const GRIND_RAIL_HEIGHT = 0.11
const GRIND_RAIL_LENGTH_MIN = 6.5
const GRIND_RAIL_LENGTH_MAX = 8.5
const GRIND_ENTRY_MAX_Z = 0.9
const GRIND_RISE_START_Z = -26
const GRIND_RISE_END_Z = -6.5
const GRIND_ENTRY_PADDING = 0.35
const GRIND_EXIT_PADDING = 0.8
const GRIND_MAGNET_ENTRY_BACK_BUFFER = 0.55
const GRIND_MAGNET_ENTRY_FRONT_BUFFER = 0.28
const GRIND_MAGNET_HEIGHT_BUFFER = 0.16
const GRIND_RAIL_COLOR = '#56b8ff'
const GRIND_RAIL_REST_Y = GRIND_RAIL_HEIGHT * 0.2
const GRIND_RAIL_ACTIVE_Y = 0.36
const GRIND_REQUIRED_CAT_HEIGHT = 0.92
const TIMING_POINTS = {
  Perfect: 3,
  Good: 2,
  Sloppy: 1,
}
const MAX_RAMP_SCORE = 80

function getStartupMeasureCursor(musicTimeSeconds = 0) {
  const clampedBeat = Math.max(STARTUP_SAFE_BEATS, Math.floor(musicTimeSeconds / BEAT_INTERVAL), 0)
  return Math.ceil(clampedBeat / MEASURE_LENGTH_BEATS) * MEASURE_LENGTH_BEATS
}

const PATTERN_LIBRARY = {
  anchor: { offsets: [1], chain: false, dense: false },
  push: { offsets: [1, 3], chain: false, dense: false },
  doubleQuarter: { offsets: [1, 2], chain: true, dense: false },
  latePush: { offsets: [2, 4], chain: false, dense: true },
  staircase: { offsets: [1, 2, 4], chain: true, dense: true },
  splitTriple: { offsets: [1, 3, 4], chain: false, dense: true },
  lateDouble: { offsets: [2, 3], chain: true, dense: true },
  lateTriple: { offsets: [2, 3, 4], chain: true, dense: true },
}

const LANE_POSITIONS = {
  farLeft: -0.34,
  left: -0.22,
  center: 0,
  right: 0.22,
  farRight: 0.34,
}

const PLACEMENT_LIBRARY = {
  1: [
    { name: 'centerSingle', lanes: ['center'], weight: 1.35, maxScore: 18 },
    { name: 'leftSingle', lanes: ['left'], weight: 1.05 },
    { name: 'rightSingle', lanes: ['right'], weight: 1.05 },
    { name: 'wideLeftSingle', lanes: ['farLeft'], weight: 0.7, minScore: 16 },
    { name: 'wideRightSingle', lanes: ['farRight'], weight: 0.7, minScore: 16 },
  ],
  2: [
    { name: 'leftRight', lanes: ['left', 'right'], weight: 1.2 },
    { name: 'rightLeft', lanes: ['right', 'left'], weight: 1.2 },
    { name: 'centerLeft', lanes: ['center', 'left'], weight: 1.1, maxScore: 24 },
    { name: 'centerRight', lanes: ['center', 'right'], weight: 1.1, maxScore: 24 },
    { name: 'leftCenter', lanes: ['left', 'center'], weight: 0.95, minScore: 10 },
    { name: 'rightCenter', lanes: ['right', 'center'], weight: 0.95, minScore: 10 },
    { name: 'wideSweepLeft', lanes: ['farRight', 'left'], weight: 0.7, minScore: 24, sparseOnly: true },
    { name: 'wideSweepRight', lanes: ['farLeft', 'right'], weight: 0.7, minScore: 24, sparseOnly: true },
  ],
  3: [
    { name: 'sweepLeft', lanes: ['right', 'center', 'left'], weight: 1.2 },
    { name: 'sweepRight', lanes: ['left', 'center', 'right'], weight: 1.2 },
    { name: 'bounceLeft', lanes: ['center', 'left', 'center'], weight: 1.05, denseOnly: true },
    { name: 'bounceRight', lanes: ['center', 'right', 'center'], weight: 1.05, denseOnly: true },
    { name: 'crossLeft', lanes: ['right', 'left', 'center'], weight: 0.9, minScore: 18, sparseOnly: true },
    { name: 'crossRight', lanes: ['left', 'right', 'center'], weight: 0.9, minScore: 18, sparseOnly: true },
    { name: 'outsideInLeft', lanes: ['farRight', 'center', 'left'], weight: 0.7, minScore: 28, sparseOnly: true },
    { name: 'outsideInRight', lanes: ['farLeft', 'center', 'right'], weight: 0.7, minScore: 28, sparseOnly: true },
  ],
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

function rampWeight(score, startScore, fullScore, maxWeight) {
  if (score <= startScore) return 0
  if (fullScore <= startScore) return maxWeight
  return clamp01((score - startScore) / (fullScore - startScore)) * maxWeight
}

function getWeightedPatternPool(score) {
  const pool = [
    { name: 'anchor', weight: Math.max(0.55, 4.2 - score * 0.075) },
    { name: 'push', weight: 1.1 + rampWeight(score, 0, 14, 1.4) - rampWeight(score, 52, 80, 0.7) },
    { name: 'doubleQuarter', weight: 0.35 + rampWeight(score, 8, 24, 2.1) - rampWeight(score, 60, 80, 0.45) },
    { name: 'latePush', weight: rampWeight(score, 16, 30, 1.8) },
    { name: 'staircase', weight: rampWeight(score, 24, 42, 1.85) },
    { name: 'splitTriple', weight: rampWeight(score, 28, 46, 1.75) },
    { name: 'lateDouble', weight: rampWeight(score, 40, 60, 1.7) },
    { name: 'lateTriple', weight: rampWeight(score, 62, 80, 1.05) },
  ]

  return pool.filter((entry) => entry.weight > 0.05)
}

function pickWeightedPattern(pool) {
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return 'anchor'

  let pick = Math.random() * totalWeight
  for (const entry of pool) {
    pick -= entry.weight
    if (pick <= 0) return entry.name
  }

  return pool[pool.length - 1]?.name || 'anchor'
}

function pickWeightedEntry(pool) {
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return pool[0] || null

  let pick = Math.random() * totalWeight
  for (const entry of pool) {
    pick -= entry.weight
    if (pick <= 0) return entry
  }

  return pool[pool.length - 1] || null
}

function getLaneX(lane) {
  const base = LANE_POSITIONS[lane] ?? 0
  const jitterScale = lane === 'center' ? 0.55 : 1
  return base + (Math.random() - 0.5) * LANE_JITTER * jitterScale
}

function getRailEntryIndex(offsets, score) {
  if (score < MIN_SCORE_FOR_RAILS || offsets.length === 0) return -1
  if (offsets.length === 1) return 0

  const lastIndex = offsets.length - 1
  const lastGap = offsets[lastIndex] - offsets[lastIndex - 1]
  return lastGap >= MIN_RAIL_SETUP_GAP_BEATS ? lastIndex : -1
}

function shouldUseRail(score, measuresSinceRail, railEntryIndex) {
  if (railEntryIndex === -1) return false
  if (measuresSinceRail < MIN_MEASURES_BETWEEN_RAILS) return false
  if (measuresSinceRail >= FORCE_RAIL_AFTER_MEASURES) return true

  const baseChance = score < 18 ? 0.18 : score < 36 ? 0.28 : 0.4
  const urgencyBonus = measuresSinceRail >= 4 ? 0.18 : measuresSinceRail >= 3 ? 0.08 : 0
  return Math.random() < baseChance + urgencyBonus
}

function getPlacementPool({ count, dense, score, preferSideRailExit, recentPlacementName }) {
  let pool = (PLACEMENT_LIBRARY[count] || PLACEMENT_LIBRARY[1]).filter((entry) => {
    if (typeof entry.minScore === 'number' && score < entry.minScore) return false
    if (typeof entry.maxScore === 'number' && score > entry.maxScore) return false
    if (entry.denseOnly && !dense) return false
    if (entry.sparseOnly && dense) return false
    return true
  })

  if (preferSideRailExit && count > 1) {
    const sideExitPool = pool.filter((entry) => entry.lanes[entry.lanes.length - 1] !== 'center')
    if (sideExitPool.length > 0) pool = sideExitPool
  }

  if (recentPlacementName && pool.length > 1) {
    const dedupedPool = pool.filter((entry) => entry.name !== recentPlacementName)
    if (dedupedPool.length > 0) pool = dedupedPool
  }

  return pool
}

function getGrindHalfLength(obstacle) {
  return (obstacle.railLength || GRIND_RAIL_LENGTH_MIN) * 0.5
}

function getGrindEntryMinZ(obstacle) {
  return -getGrindHalfLength(obstacle) - GRIND_ENTRY_PADDING
}

function getGrindExitZ(obstacle) {
  return getGrindHalfLength(obstacle) + GRIND_EXIT_PADDING
}

const logToonVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const logToonFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLightDirection;
  uniform float uGlossiness;
  uniform float uRimAmount;
  uniform float uRimThreshold;
  uniform float uSteps;
  uniform float uShadowBrightness;
  uniform float uBrightness;
  uniform vec3 uRimColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 baseColor = pow(uColor, vec3(1.0 / uBrightness));
    float NdotL = dot(vNormal, normalize(uLightDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uSteps) / uSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);
    vec3 halfVector = normalize(normalize(uLightDirection) + vViewDir);
    float NdotH = dot(vNormal, halfVector);
    float specularIntensity = pow(max(NdotH, 0.0) * max(NdotL, 0.0), 1000.0 / uGlossiness);
    float specular = smoothstep(0.05, 0.1, specularIntensity);
    float rimDot = 1.0 - dot(vViewDir, vNormal);
    float rimIntensity = rimDot * pow(max(NdotL, 0.0), uRimThreshold);
    rimIntensity = smoothstep(uRimAmount - 0.01, uRimAmount + 0.01, rimIntensity);
    vec3 finalColor = baseColor * lightIntensity + specular * vec3(0.06) + rimIntensity * uRimColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

function createLogToonMaterial({
  color,
  lightX,
  lightY,
  lightZ,
  glossiness,
  rimAmount,
  rimThreshold,
  steps,
  shadowBrightness,
  brightness,
  rimColor,
}) {
  return new THREE.ShaderMaterial({
    vertexShader: logToonVertexShader,
    fragmentShader: logToonFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLightDirection: { value: new THREE.Vector3(lightX, lightY, lightZ) },
      uGlossiness: { value: glossiness },
      uRimAmount: { value: rimAmount },
      uRimThreshold: { value: rimThreshold },
      uSteps: { value: steps },
      uShadowBrightness: { value: shadowBrightness },
      uBrightness: { value: brightness },
      uRimColor: { value: new THREE.Color(rimColor) },
    },
  })
}

export default function Obstacles({ musicRef, isRunning, canCollide = true, onLogHit }) {
  const log = useGLTF('/large_tree_log/scene.gltf')
  const refs = useRef([])
  const logRefs = useRef([])
  const railRefs = useRef([])
  const shadowRefs = useRef([])
  const active = useRef(
    Array.from({ length: POOL_SIZE }, () => ({
      id: 0,
      clusterId: 0,
      z: 0,
      visible: false,
      scored: false,
      x: 0,
      scaleY: 1,
      rotY: 0,
      beatIndex: 0,
      isVertical: false,
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
  const nextObstacleId = useRef(1)

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
  } = useControls('Obstacles', {
    logScale: { value: 0.8, min: 0.1, max: 3, step: 0.1 },
    logColor: '#905634',
    logLightX: { value: 4.0, min: -20, max: 20, step: 0.5 },
    logLightY: { value: -7.5, min: -20, max: 20, step: 0.5 },
    logLightZ: { value: 3.0, min: -20, max: 20, step: 0.5 },
    logGlossiness: { value: 1, min: 1, max: 100, step: 1 },
    logSteps: { value: 3, min: 1, max: 8, step: 1 },
    logShadowBrightness: { value: 0.2, min: 0, max: 1, step: 0.05 },
    logBrightness: { value: 1.7, min: 0.5, max: 4, step: 0.05 },
  })

  const wasGameOver = useRef(false)
  const graceTimer = useRef(3.0) // invincibility grace period at start

  const resetObstacleSlot = (slot) => {
    slot.id = 0
    slot.clusterId = 0
    slot.z = 0
    slot.visible = false
    slot.scored = false
    slot.x = 0
    slot.scaleY = 1
    slot.rotY = HORIZONTAL_LOG_ROTATION
    slot.beatIndex = 0
    slot.isVertical = false
    slot.railLength = GRIND_RAIL_LENGTH_MIN
    slot.railLift = 0
  }

  const stopGrinding = () => {
    if (gameState.activeGrind.current?.active) {
      gameState.activeGrind.current = createIdleGrindState()
    }
  }

  const startGrinding = (obstacle) => {
    gameState.activeGrind.current = {
      active: true,
      obstacleId: obstacle.id,
      x: obstacle.x || 0,
      z: obstacle.z,
    }
  }

  const choosePatternType = () => {
    const score = gameState.score
    const rampProgress = Math.min(score / MAX_RAMP_SCORE, 1)
    const recent = patternHistory.current
    let pool = getWeightedPatternPool(score)

    if (consecutiveDensePatterns.current >= 2) {
      pool = pool.filter(({ name }) => !PATTERN_LIBRARY[name].dense)
    }
    if (consecutiveChainPatterns.current >= 2) {
      pool = pool.filter(({ name }) => !PATTERN_LIBRARY[name].chain)
    }
    if (recent.length >= 2 && recent[recent.length - 1] === recent[recent.length - 2] && pool.length > 1) {
      pool = pool.filter(({ name }) => name !== recent[recent.length - 1])
    }
    if (
      score >= 18 &&
      recent.length >= 2 &&
      recent.every((pattern) => !PATTERN_LIBRARY[pattern]?.dense)
    ) {
      pool = pool.map((entry) => ({
        ...entry,
        weight: PATTERN_LIBRARY[entry.name].dense ? entry.weight * (1.15 + rampProgress * 0.35) : entry.weight,
      }))
    }
    if (
      score >= 24 &&
      recent.length >= 2 &&
      recent.every((pattern) => PATTERN_LIBRARY[pattern]?.dense)
    ) {
      pool = pool.map((entry) => ({
        ...entry,
        weight: !PATTERN_LIBRARY[entry.name].dense ? entry.weight * 1.2 : entry.weight,
      }))
    }

    if (pool.length === 0) pool = [{ name: 'anchor', weight: 1 }]
    return pickWeightedPattern(pool)
  }

  const scheduleMeasurePattern = (measureStartBeat) => {
    const score = gameState.score
    const patternType = choosePatternType()
    const patternMeta = PATTERN_LIBRARY[patternType] || PATTERN_LIBRARY.anchor
    const pattern = [...patternMeta.offsets].sort((a, b) => a - b)
    const railEntryIndex = getRailEntryIndex(pattern, score)
    const useRail = shouldUseRail(score, measuresSinceRail.current, railEntryIndex)
    const placementPool = getPlacementPool({
      count: pattern.length,
      dense: patternMeta.dense,
      score,
      preferSideRailExit: useRail,
      recentPlacementName: placementHistory.current[placementHistory.current.length - 1] || '',
    })
    const placement = pickWeightedEntry(placementPool) || { name: 'fallback', lanes: Array(pattern.length).fill('center') }
    let clusterId = 0
    let previousBeatOffset = null

    pattern.forEach((beatOffset, index) => {
      if (previousBeatOffset === null || beatOffset - previousBeatOffset > BURST_CLUSTER_GAP_BEATS) {
        clusterId += 1
      }
      spawnObstacleForBeat({
        beatIndex: measureStartBeat + beatOffset,
        clusterId: `${measureStartBeat}:${clusterId}`,
        lane: placement.lanes[index] || placement.lanes[placement.lanes.length - 1] || 'center',
        isVertical: useRail && index === railEntryIndex,
      })
      previousBeatOffset = beatOffset
    })

    patternHistory.current.push(patternType)
    if (patternHistory.current.length > 2) patternHistory.current.shift()
    placementHistory.current.push(placement.name)
    if (placementHistory.current.length > 2) placementHistory.current.shift()

    consecutiveDensePatterns.current = patternMeta.dense ? consecutiveDensePatterns.current + 1 : 0
    consecutiveChainPatterns.current = patternMeta.chain ? consecutiveChainPatterns.current + 1 : 0
    measuresSinceRail.current = useRail ? 0 : measuresSinceRail.current + 1
  }

  const spawnObstacleForBeat = ({ beatIndex, clusterId, lane, isVertical }) => {
    const slot = active.current.find(o => !o.visible)
    if (!slot) return

    // Start far ahead; beat-sync positioning is applied later in the frame.
    slot.z = -100
    slot.visible = true
    slot.scored = false
    slot.id = nextObstacleId.current++
    slot.clusterId = clusterId
    slot.beatIndex = beatIndex
    slot.rotY = isVertical ? VERTICAL_LOG_ROTATION : HORIZONTAL_LOG_ROTATION
    slot.scaleY = 0.7 + Math.random() * 0.6
    slot.x = getLaneX(lane)
    slot.isVertical = isVertical
    slot.railLength = isVertical
      ? GRIND_RAIL_LENGTH_MIN + Math.random() * (GRIND_RAIL_LENGTH_MAX - GRIND_RAIL_LENGTH_MIN)
      : GRIND_RAIL_LENGTH_MIN
    slot.railLift = 0
  }

  useFrame((_, delta) => {
    // Reset obstacles when game restarts
    if (wasGameOver.current && !gameState.gameOver) {
      for (let i = 0; i < POOL_SIZE; i++) {
        resetObstacleSlot(active.current[i])
        if (refs.current[i]) refs.current[i].visible = false
      }
      const musicTime = musicRef?.current?.currentTime || 0
      measureCursor.current = getStartupMeasureCursor(musicTime)
      patternHistory.current = []
      placementHistory.current = []
      consecutiveDensePatterns.current = 0
      consecutiveChainPatterns.current = 0
      measuresSinceRail.current = INITIAL_MEASURES_SINCE_RAIL
      gameState.obstacleTargets.current = []
      gameState.upArrowHeld.current = false
      gameState.grindCooldownObstacleId.current = 0
      stopGrinding()
      graceTimer.current = 3.0
      wasGameOver.current = false
      return
    }
    if (gameState.gameOver) {
      gameState.obstacleTargets.current = []
      gameState.grindCooldownObstacleId.current = 0
      stopGrinding()
      wasGameOver.current = true
      return
    }
    if (!isRunning) return

    const speed = gameState.speed.current
    if (graceTimer.current > 0) graceTimer.current -= delta
    const music = musicRef?.current
    const isMusicRunning = Boolean(music && !music.paused)
    const musicTime = isMusicRunning ? music.currentTime : 0

    if (isMusicRunning) {
      const currentBeat = Math.floor(musicTime / BEAT_INTERVAL)
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

    // Collision detection — cat is at z=0, check if log is near
    if (canCollide && graceTimer.current <= 0) {
      for (let i = 0; i < POOL_SIZE; i++) {
        const ob = active.current[i]
        if (!ob.visible) continue
        const activeGrind = gameState.activeGrind.current
        const isGrindingThisObstacle = activeGrind?.active && activeGrind.obstacleId === ob.id
        const obstacleWindowMinZ = ob.isVertical ? getGrindEntryMinZ(ob) : -1.2
        const obstacleWindowMaxZ = ob.isVertical ? getGrindExitZ(ob) : 0.5
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
        // Log is near the cat (z ~ 0) and cat is not jumping
        if (ob.z > obstacleWindowMinZ && ob.z < obstacleWindowMaxZ && !ob.scored) {
          if (!gameState.jumping && !isGrindingThisObstacle && !isDebug) {
            // HIT — game over
            gameState.gameOver = true
            gameState.speed.current = 0
            gameState.speedLinesOn = false
            gameState.screenShake.current = 0.8
            gameState.streak.current = 0
            gameState.scoreMultiplier.current = 1
            gameState.comboEnergy.current = 0
            gameState.pendingJumpTiming.current = null
            gameState.upArrowHeld.current = false
            stopGrinding()
            if (onLogHit) onLogHit()
            if (gameState.onGameOver) gameState.onGameOver()
            return
          }

          const pendingTiming = gameState.pendingJumpTiming.current
          const matchedTiming = pendingTiming && pendingTiming.obstacleIds?.includes(ob.id)
            ? pendingTiming
            : null
          const timingGrade = matchedTiming?.grade || 'Sloppy'
          let nextStreak = gameState.streak.current
          if (timingGrade === 'Perfect') {
            nextStreak += 1
          } else if (timingGrade === 'Sloppy') {
            nextStreak = 0
          }

          const multiplier = getScoreMultiplier(nextStreak)
          const points = TIMING_POINTS[timingGrade] * multiplier

          ob.scored = true
          gameState.streak.current = nextStreak
          gameState.scoreMultiplier.current = multiplier
          gameState.score += points
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
          }
          if (matchedTiming) {
            const remainingObstacleIds = matchedTiming.obstacleIds.filter((id) => id !== ob.id)
            gameState.pendingJumpTiming.current = remainingObstacleIds.length > 0
              ? { ...matchedTiming, obstacleIds: remainingObstacleIds }
              : null
          }
          if (gameState.score >= SPEED_BOOST_SCORE_THRESHOLD && !gameState.speedBoostActive) {
            gameState.speedBoostActive = true
          }
          if (gameState.score >= SPEED_LINES_SCORE_THRESHOLD && !gameState.speedLinesOn) {
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
        const hitTime = ob.beatIndex * BEAT_INTERVAL
        const timeUntilHit = hitTime - musicTime
        const targetZ = -timeUntilHit * speed
        const smoothedZ = ob.z + (targetZ - ob.z) * POSITION_SMOOTHING
        // Keep logs moving forward only so speed boosts don't pull them backward.
        ob.z = Math.max(ob.z, smoothedZ)
        if (timeUntilHit < -DESPAWN_BEHIND_SECONDS) {
          ob.visible = false
        }
      }

      if (ob.z > 15) {
        // passed behind camera, deactivate
        ob.visible = false
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
        shadowRefs.current[i].scale.set(
          ob.isVertical ? GRIND_RAIL_WIDTH * 2.1 : logScale * 1.65,
          ob.isVertical ? (ob.railLength || GRIND_RAIL_LENGTH_MIN) * 0.48 : logScale * 0.5,
          1
        )
      }
      if (logRefs.current[i]) {
        logRefs.current[i].visible = ob.visible && !ob.isVertical
      }
      if (railRefs.current[i]) {
        ob.railLift = ob.isVertical
          ? THREE.MathUtils.smootherstep(ob.z, GRIND_RISE_START_Z, GRIND_RISE_END_Z)
          : 0
        railRefs.current[i].visible = ob.visible && ob.isVertical
        railRefs.current[i].scale.set(GRIND_RAIL_WIDTH, GRIND_RAIL_HEIGHT, ob.railLength || GRIND_RAIL_LENGTH_MIN)
        railRefs.current[i].position.y = THREE.MathUtils.lerp(
          GRIND_RAIL_REST_Y,
          GRIND_RAIL_ACTIVE_Y,
          ob.railLift
        )
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

    gameState.obstacleTargets.current = active.current
      .filter((ob) => ob.visible && !ob.scored)
      .map((ob) => ({
        id: ob.id,
        clusterId: ob.clusterId,
        targetTime: ob.beatIndex * BEAT_INTERVAL,
        x: ob.x || 0,
        isVertical: Boolean(ob.isVertical),
      }))
      .sort((a, b) => a.targetTime - b.targetTime)
  })

  const clonedScenes = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, () => {
        const scene = log.scene.clone()

        scene.traverse((child) => {
          if (!child.isMesh) return

          const sourceMaterial = child.material

          child.material = createLogToonMaterial({
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
          })
          child.material.side = sourceMaterial.side
        })

        return scene
      }),
    [
      log.scene,
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

  return (
    <group>
      {clonedScenes.map((scene, i) => (
        <group
          key={i}
          ref={(el) => (refs.current[i] = el)}
          visible={false}
        >
          <mesh
            ref={(el) => (shadowRefs.current[i] = el)}
            position={[0, CONTACT_SHADOW_Y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[logScale * 1.65, logScale * 0.5, 1]}
            renderOrder={-1}
          >
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial
              color="#000000"
              transparent
              opacity={CONTACT_SHADOW_OPACITY}
              depthWrite={false}
            />
          </mesh>
          <primitive
            ref={(el) => (logRefs.current[i] = el)}
            object={scene}
            scale={logScale}
            rotation={[0, Math.PI / 2, 0]}
          />
          <mesh
            ref={(el) => (railRefs.current[i] = el)}
            visible={false}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshToonMaterial color={GRIND_RAIL_COLOR} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

useGLTF.preload('/large_tree_log/scene.gltf')
