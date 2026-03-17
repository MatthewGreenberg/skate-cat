import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import { createIdleGrindState, gameState, getScoreMultiplier, isDebug, isObstacleSpacingDebug, isTimingDebug } from '../store'
import { BEAT_INTERVAL, getPerceivedMusicTime } from '../rhythm'

const POOL_SIZE = 20
const LOOKAHEAD_BEATS = 10
const DESPAWN_BEHIND_SECONDS = 0.6
const POSITION_SMOOTHING = 0.35
const SPEED_BOOST_SCORE_THRESHOLD = 12
const SPEED_LINES_SCORE_THRESHOLD = 24
const MEASURE_LENGTH_BEATS = 4
const COUNTDOWN_BEATS = 4
const STARTUP_SAFE_BEATS = 8
const BURST_CLUSTER_GAP_BEATS = 0.75
const CONTACT_SHADOW_Y = 0.018
const CONTACT_SHADOW_LOG_OPACITY = 0.62
const CONTACT_SHADOW_RAIL_OPACITY = 0.32
const HORIZONTAL_LOG_ROTATION = Math.PI / 2
const VERTICAL_LOG_ROTATION = 0
const LANE_JITTER = 0.035
const INITIAL_MEASURES_SINCE_RAIL = 3
const MIN_SCORE_FOR_RAILS = 8
const MIN_MEASURES_BETWEEN_RAILS = 1
const FORCE_RAIL_AFTER_MEASURES = 4
const MIN_RAIL_SETUP_GAP_BEATS = 1.5
const HOLD_SIGN_WORLD_X = -1.04
const GRIND_RAIL_WIDTH = 0.18
const GRIND_RAIL_HEIGHT = 0.11
const GRIND_RAIL_LENGTH_MIN = 6.5
const GRIND_RAIL_LENGTH_MAX = 8.5
const GRIND_RAIL_SUPPORT_WIDTH = 0.07
const GRIND_RAIL_SUPPORT_DEPTH = 0.07
const GRIND_RAIL_SUPPORT_SPAN = 0.34
const GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT = 0.06
const GRIND_RAIL_SUPPORT_INSET = 0.78
const GRIND_RAIL_SUPPORT_GROUND_Y = 0.03
const GRIND_ENTRY_MAX_Z = 0.9
const GRIND_RISE_START_Z = -26
const GRIND_RISE_END_Z = -6.5
const GRIND_ENTRY_PADDING = 0.35
const GRIND_EXIT_PADDING = 0.8
const GRIND_EXIT_RECOVERY_PADDING = 1.15
const GRIND_MAGNET_ENTRY_BACK_BUFFER = 0.55
const GRIND_MAGNET_ENTRY_FRONT_BUFFER = 0.28
const GRIND_MAGNET_HEIGHT_BUFFER = 0.16
const GRIND_RAIL_COLOR = '#56b8ff'
const GRIND_RAIL_SUPPORT_COLOR = '#7b8fa8'
const GRIND_RAIL_FOOT_COLOR = '#415163'
const GRIND_RAIL_REST_Y = GRIND_RAIL_HEIGHT * 0.2
const GRIND_RAIL_ACTIVE_Y = 0.36
const GRIND_REQUIRED_CAT_HEIGHT = 0.92
const LOG_CLEARANCE_HEIGHT = 0.88
const LOG_COLLISION_ENTRY_DISTANCE = 0.85
const LOG_COLLISION_EXIT_DISTANCE = 0.35
const DEBUG_RECENT_OBSTACLE_RETENTION_BEATS = 6
const TIMING_POINTS = {
  Perfect: 3,
  Good: 2,
  Sloppy: 1,
}
const SPIN_TRICK_BONUS_POINTS = 2
const MAX_RAMP_SCORE = 80
const TIMING_DEBUG_PATTERN_LIBRARY = [
  { name: 'centerSingle', offsets: [1], lanes: ['center'] },
  { name: 'leftSingle', offsets: [1], lanes: ['left'] },
  { name: 'rightSingle', offsets: [1], lanes: ['right'] },
  { name: 'leftRight', offsets: [1, 3], lanes: ['left', 'right'] },
  { name: 'railLeft', offsets: [1, 3], lanes: ['center', 'left'], railIndex: 1 },
  { name: 'railRight', offsets: [1, 3], lanes: ['center', 'right'], railIndex: 1 },
  { name: 'centerDouble', offsets: [1, 3], lanes: ['center', 'center'] },
  { name: 'lateRailCenter', offsets: [2, 4], lanes: ['left', 'center'], railIndex: 1 },
  { name: 'staircase', offsets: [1, 2, 3], lanes: ['left', 'center', 'right'] },
]

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

const RAIL_PATTERN_LIBRARY = [
  { name: 'railLeftSetup', offsets: [1, 3], lanes: ['center', 'left'], railIndex: 1, weight: 1.2, chain: false, dense: false },
  { name: 'railRightSetup', offsets: [1, 3], lanes: ['center', 'right'], railIndex: 1, weight: 1.2, chain: false, dense: false },
  { name: 'lateRailCenter', offsets: [2, 4], lanes: ['left', 'center'], railIndex: 1, weight: 0.95, chain: false, dense: true },
  { name: 'lateRailLeft', offsets: [2, 4], lanes: ['right', 'left'], railIndex: 1, weight: 0.85, minScore: 16, chain: false, dense: true },
  { name: 'lateRailRight', offsets: [2, 4], lanes: ['left', 'right'], railIndex: 1, weight: 0.85, minScore: 16, chain: false, dense: true },
  { name: 'soloRailCenter', offsets: [3], lanes: ['center'], railIndex: 0, weight: 0.7, minScore: 18, chain: false, dense: false },
  { name: 'soloRailLeft', offsets: [3], lanes: ['left'], railIndex: 0, weight: 0.55, minScore: 12, chain: false, dense: false },
  { name: 'soloRailRight', offsets: [3], lanes: ['right'], railIndex: 0, weight: 0.55, minScore: 12, chain: false, dense: false },
]

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

function getWeightedPatternPool(score, minOffset = 0) {
  const pool = [
    { name: 'anchor', weight: Math.max(0.35, 3.3 - score * 0.09) },
    { name: 'push', weight: 1.35 + rampWeight(score, 0, 12, 1.6) - rampWeight(score, 56, 80, 0.55) },
    { name: 'doubleQuarter', weight: 0.7 + rampWeight(score, 5, 18, 2.3) - rampWeight(score, 64, 80, 0.35) },
    { name: 'latePush', weight: 0.2 + rampWeight(score, 12, 24, 2.0) },
    { name: 'staircase', weight: rampWeight(score, 18, 34, 2.1) },
    { name: 'splitTriple', weight: rampWeight(score, 22, 38, 2.0) },
    { name: 'lateDouble', weight: rampWeight(score, 30, 48, 1.95) },
    { name: 'lateTriple', weight: rampWeight(score, 48, 68, 1.3) },
  ]

  return pool.filter((entry) => entry.weight > 0.05 && PATTERN_LIBRARY[entry.name]?.offsets.every((offset) => offset > minOffset))
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

function getLanePreferenceOrder(preferredLane) {
  return Object.keys(LANE_POSITIONS).sort((a, b) => {
    const aDistance = Math.abs((LANE_POSITIONS[a] ?? 0) - (LANE_POSITIONS[preferredLane] ?? 0))
    const bDistance = Math.abs((LANE_POSITIONS[b] ?? 0) - (LANE_POSITIONS[preferredLane] ?? 0))
    return aDistance - bDistance
  })
}

function shouldUseRail(score, measuresSinceRail) {
  if (score < MIN_SCORE_FOR_RAILS) return false
  if (measuresSinceRail < MIN_MEASURES_BETWEEN_RAILS) return false
  if (measuresSinceRail >= FORCE_RAIL_AFTER_MEASURES) return true

  const baseChance = score < 18 ? 0.24 : score < 36 ? 0.34 : 0.46
  const urgencyBonus = measuresSinceRail >= 3 ? 0.16 : measuresSinceRail >= 2 ? 0.08 : 0
  return Math.random() < baseChance + urgencyBonus
}

function getWeightedRailPatternPool(score, recentPatternName = '') {
  let pool = RAIL_PATTERN_LIBRARY.filter((entry) => {
    if (typeof entry.minScore === 'number' && score < entry.minScore) return false
    if (typeof entry.maxScore === 'number' && score > entry.maxScore) return false
    return entry.weight > 0.05
  })

  if (recentPatternName && pool.length > 1) {
    const dedupedPool = pool.filter((entry) => entry.name !== recentPatternName)
    if (dedupedPool.length > 0) pool = dedupedPool
  }

  return pool
}

function getPlacementPool({ count, dense, score, recentPlacementName }) {
  let pool = (PLACEMENT_LIBRARY[count] || PLACEMENT_LIBRARY[1]).filter((entry) => {
    if (typeof entry.minScore === 'number' && score < entry.minScore) return false
    if (typeof entry.maxScore === 'number' && score > entry.maxScore) return false
    if (entry.denseOnly && !dense) return false
    if (entry.sparseOnly && dense) return false
    return true
  })

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

function getBeatDistanceForWorldDistance(distance, speed) {
  return distance / Math.max(speed, 0.001) / BEAT_INTERVAL
}

function getObstacleLaneWindow(obstacle, speed) {
  const beatIndex = obstacle.beatIndex || 0

  if (obstacle.isVertical) {
    const railLength = obstacle.railLength || GRIND_RAIL_LENGTH_MAX
    return {
      startBeat: beatIndex - getBeatDistanceForWorldDistance(GRIND_ENTRY_PADDING, speed),
      endBeat: beatIndex + getBeatDistanceForWorldDistance(
        railLength + GRIND_EXIT_PADDING + GRIND_EXIT_RECOVERY_PADDING,
        speed
      ),
    }
  }

  return {
    startBeat: beatIndex - getBeatDistanceForWorldDistance(LOG_COLLISION_ENTRY_DISTANCE, speed),
    endBeat: beatIndex + getBeatDistanceForWorldDistance(LOG_COLLISION_EXIT_DISTANCE, speed),
  }
}

function laneWindowsOverlap(windowA, windowB) {
  return windowA.startBeat <= windowB.endBeat && windowA.endBeat >= windowB.startBeat
}

function obstaclesHaveMixedTimeConflict(obstacle, other, speed) {
  if (Boolean(obstacle.isVertical) === Boolean(other.isVertical)) return false

  return laneWindowsOverlap(
    getObstacleLaneWindow(obstacle, speed),
    getObstacleLaneWindow(other, speed)
  )
}

function buildObstacleDebugEntries(obstacles, speed) {
  return obstacles
    .map((obstacle) => {
      const laneWindow = getObstacleLaneWindow(obstacle, speed)
      const conflicts = obstacles
        .filter((other) =>
          other.id !== obstacle.id &&
          obstaclesHaveMixedTimeConflict(obstacle, other, speed)
        )
        .map((other) => other.id)
        .sort((a, b) => a - b)

      return {
        id: obstacle.id,
        type: obstacle.isVertical ? 'rail' : 'log',
        lane: obstacle.lane,
        requestedLane: obstacle.requestedLane || obstacle.lane,
        remapped: (obstacle.requestedLane || obstacle.lane) !== obstacle.lane,
        beatIndex: obstacle.beatIndex,
        z: obstacle.z,
        railLength: obstacle.railLength || GRIND_RAIL_LENGTH_MIN,
        windowStartBeat: laneWindow.startBeat,
        windowEndBeat: laneWindow.endBeat,
        conflicts,
      }
    })
    .sort((a, b) => a.beatIndex - b.beatIndex || a.id - b.id)
}

function drawShadowBlob(ctx, centerX, centerY, radiusX, radiusY, alpha) {
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 1)
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
  gradient.addColorStop(0.45, `rgba(255, 255, 255, ${alpha * 0.65})`)
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.scale(radiusX, radiusY)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function createContactShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  drawShadowBlob(ctx, 126, 96, 118, 38, 1)
  drawShadowBlob(ctx, 124, 92, 84, 25, 1)
  drawShadowBlob(ctx, 74, 99, 48, 20, 0.58)
  drawShadowBlob(ctx, 188, 86, 38, 16, 0.34)

  ctx.globalCompositeOperation = 'destination-out'
  drawShadowBlob(ctx, 128, 70, 42, 8, 0.35)
  ctx.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
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
  } = useControls('Obstacle Shadows', {
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
    slot.requestedLane = 'center'
    slot.lane = 'center'
    slot.scaleY = 1
    slot.rotY = HORIZONTAL_LOG_ROTATION
    slot.beatIndex = 0
    slot.isVertical = false
    slot.showHoldSign = false
    slot.railLength = GRIND_RAIL_LENGTH_MIN
    slot.railLift = 0
  }

  const stopGrinding = () => {
    if (gameState.activeGrind.current?.active) {
      gameState.activeGrind.current = createIdleGrindState()
    }
  }

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

  const choosePatternType = (minOffset = 0) => {
    const score = gameState.score
    const rampProgress = Math.min(score / MAX_RAMP_SCORE, 1)
    const recent = patternHistory.current
    let pool = getWeightedPatternPool(score, minOffset)

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

    if (pool.length === 0) return null
    return pickWeightedPattern(pool)
  }

  const scheduleMeasurePattern = (measureStartBeat) => {
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

    const score = gameState.score
    const recentPatternName = patternHistory.current[patternHistory.current.length - 1] || ''
    const useRail = shouldUseRail(score, measuresSinceRail.current)

    if (useRail) {
      const railPattern = pickWeightedEntry(getWeightedRailPatternPool(score, recentPatternName))
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
    const patternType = choosePatternType(blockedOffset)
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
      score,
      recentPlacementName: placementHistory.current[placementHistory.current.length - 1] || '',
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
    slot.rotY = isVertical ? VERTICAL_LOG_ROTATION : HORIZONTAL_LOG_ROTATION
    slot.scaleY = isTimingDebug ? 1 : 0.7 + Math.random() * 0.6
    slot.x = isTimingDebug ? (LANE_POSITIONS[spawnLane] ?? 0) : getLaneX(spawnLane)
    slot.requestedLane = lane
    slot.lane = spawnLane
    slot.isVertical = isVertical
    slot.showHoldSign = isVertical && !hasAssignedHoldTutorial.current
    if (slot.showHoldSign) hasAssignedHoldTutorial.current = true
    slot.railLength = resolvedRailLength
    slot.railLift = 0
    return true
  }

  useFrame((_, delta) => {
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
      gameState.obstacleTargets.current = []
      gameState.obstacleDebug.current = []
      gameState.upArrowHeld.current = false
      gameState.grindCooldownObstacleId.current = 0
      stopGrinding()
      graceTimer.current = 3.0
      wasGameOver.current = false
      return
    }
    if (gameState.gameOver) {
      gameState.obstacleTargets.current = []
      gameState.obstacleDebug.current = []
      recentDebugObstacles.current.clear()
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
    const musicTime = isMusicRunning ? getPerceivedMusicTime(music.currentTime) : 0

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
        const hasLogClearance = !ob.isVertical &&
          gameState.jumping &&
          gameState.catHeight.current >= LOG_CLEARANCE_HEIGHT

        if (ob.z > obstacleWindowMinZ && ob.z < obstacleWindowMaxZ && !ob.scored) {
          if (((!ob.isVertical && !hasLogClearance) || (ob.isVertical && !isGrindingThisObstacle)) && !isDebug) {
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
          const nextStreak = timingGrade === 'Perfect'
            ? gameState.streak.current + 1
            : 0

          const multiplier = getScoreMultiplier(nextStreak)
          const landedSpinTrick = (
            timingGrade === 'Perfect' &&
            matchedTiming?.trickName === '360' &&
            !matchedTiming?.trickAwarded &&
            !ob.isVertical
          )
          const trickBonusPoints = landedSpinTrick ? SPIN_TRICK_BONUS_POINTS * multiplier : 0
          const points = TIMING_POINTS[timingGrade] * multiplier + trickBonusPoints

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
            isRail: Boolean(ob.isVertical),
            trickName: landedSpinTrick ? '360' : '',
          }
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
        const targetZ = ob.isVertical
          ? -timeUntilHit * speed - getGrindHalfLength(ob)
          : -timeUntilHit * speed
        const smoothedZ = ob.z + (targetZ - ob.z) * POSITION_SMOOTHING
        // Keep logs moving forward only so speed boosts don't pull them backward.
        ob.z = Math.max(ob.z, smoothedZ)
        const hasClearedPlayer = ob.isVertical
          ? ob.z > getGrindExitZ(ob) + DESPAWN_BEHIND_SECONDS * speed
          : timeUntilHit < -DESPAWN_BEHIND_SECONDS
        if (hasClearedPlayer) {
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
        shadowRefs.current[i].position.set(
          ob.isVertical ? railShadowOffsetX : logShadowOffsetX,
          shadowY,
          ob.isVertical ? railShadowOffsetZ : logShadowOffsetZ
        )
        shadowRefs.current[i].scale.set(
          ob.isVertical ? GRIND_RAIL_WIDTH * railShadowScaleX : logScale * logShadowScaleX,
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
          railTopRefs.current[i].scale.set(GRIND_RAIL_WIDTH, GRIND_RAIL_HEIGHT, railLength)
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
        const hitTime = ob.beatIndex * BEAT_INTERVAL
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

    const visibleObstacles = active.current.filter((ob) => ob.visible)
    const scorableObstacles = visibleObstacles.filter((ob) => !ob.scored)

    gameState.obstacleTargets.current = scorableObstacles
      .map((ob) => ({
        id: ob.id,
        clusterId: ob.clusterId,
        targetTime: ob.beatIndex * BEAT_INTERVAL,
        x: ob.x || 0,
        isVertical: Boolean(ob.isVertical),
      }))
      .sort((a, b) => a.targetTime - b.targetTime)

    if (isObstacleSpacingDebug) {
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
          child.castShadow = true
          child.receiveShadow = true
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
                castShadow
                receiveShadow
              >
                <boxGeometry args={[1, 1, 1]} />
                <meshToonMaterial color={GRIND_RAIL_COLOR} />
              </mesh>
              <group ref={(el) => (railFrontSupportRefs.current[i] = el)}>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[0, -0.28, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_SPAN + 0.06, GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                  <meshToonMaterial color={GRIND_RAIL_FOOT_COLOR} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                  <meshToonMaterial color={GRIND_RAIL_FOOT_COLOR} />
                </mesh>
              </group>
              <group ref={(el) => (railBackSupportRefs.current[i] = el)}>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, 0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH, 1, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[0, -0.28, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_SPAN + 0.06, GRIND_RAIL_SUPPORT_CROSSBAR_HEIGHT, GRIND_RAIL_SUPPORT_DEPTH]} />
                  <meshToonMaterial color={GRIND_RAIL_SUPPORT_COLOR} />
                </mesh>
                <mesh position={[-GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                  <meshToonMaterial color={GRIND_RAIL_FOOT_COLOR} />
                </mesh>
                <mesh position={[GRIND_RAIL_SUPPORT_SPAN * 0.5, -0.5, 0]} castShadow receiveShadow>
                  <boxGeometry args={[GRIND_RAIL_SUPPORT_WIDTH * 1.5, 0.05, GRIND_RAIL_SUPPORT_DEPTH * 1.8]} />
                  <meshToonMaterial color={GRIND_RAIL_FOOT_COLOR} />
                </mesh>
              </group>
            </group>
            <group
              ref={(el) => (signRefs.current[i] = el)}
              visible={false}
              scale={[1.22, 1.22, 1.22]}
            >
              <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.07, 0.55, 0.06]} />
                <meshToonMaterial color="#8f6540" />
              </mesh>
              <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.58, 0.34, 0.08]} />
                <meshToonMaterial color="#5f3f26" />
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
                <mesh>
                  <boxGeometry args={[0.018, 0.05, 0.02]} />
                  <meshBasicMaterial color="#8ae4ff" toneMapped={false} />
                </mesh>
                <mesh position={[0, 0.043, 0]}>
                  <coneGeometry args={[0.038, 0.058, 3]} />
                  <meshBasicMaterial color="#8ae4ff" toneMapped={false} />
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

useGLTF.preload('/large_tree_log/scene.gltf')
