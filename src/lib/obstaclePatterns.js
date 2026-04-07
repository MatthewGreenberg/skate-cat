import { BEAT_INTERVAL } from '../rhythm'

export const MEASURE_LENGTH_BEATS = 4
export const COUNTDOWN_BEATS = 4
export const STARTUP_SAFE_BEATS = COUNTDOWN_BEATS + MEASURE_LENGTH_BEATS
export const MEASURE_PHASE_OFFSET_BEATS = 0
export const TIMING_POINTS = {
  Perfect: 3,
  Good: 2,
  Sloppy: 1,
}
export const SPIN_TRICK_BONUS_POINTS = 2
export const MAX_RAMP_SCORE = 80
export const MAX_RUN_DIFFICULTY_MEASURES = 18
export const MAX_DIFFICULTY_SCORE_EQUIVALENT = 72
export const MIN_SCORE_FOR_RAILS = 8
export const MIN_MEASURES_BETWEEN_RAILS = 1
export const FORCE_RAIL_AFTER_MEASURES = 4
const EARLY_PHASE_MEASURES = 2
const MID_PHASE_MEASURES = 6

export const PATTERN_LIBRARY = {
  anchor: { offsets: [1], chain: false, dense: false },
  push: { offsets: [1, 3], chain: false, dense: false },
  doubleQuarter: { offsets: [2, 3], chain: true, dense: false },
  latePush: { offsets: [3], chain: false, dense: true },
  staircase: { offsets: [1, 3], chain: true, dense: true },
  splitTriple: { offsets: [1, 2, 3], chain: false, dense: true },
  lateDouble: { offsets: [2, 3], chain: true, dense: true },
  lateTriple: { offsets: [1, 2, 3], chain: true, dense: true },
}

export const RAIL_PATTERN_LIBRARY = [
  { name: 'railLeftSetup', offsets: [1, 3], lanes: ['center', 'left'], railIndex: 1, weight: 1.2, chain: false, dense: false },
  { name: 'railRightSetup', offsets: [1, 3], lanes: ['center', 'right'], railIndex: 1, weight: 1.2, chain: false, dense: false },
  { name: 'lateRailCenter', offsets: [1, 3], lanes: ['left', 'center'], railIndex: 1, weight: 0.95, chain: false, dense: true },
  { name: 'lateRailLeft', offsets: [1, 3], lanes: ['right', 'left'], railIndex: 1, weight: 0.85, minScore: 16, chain: false, dense: true },
  { name: 'lateRailRight', offsets: [1, 3], lanes: ['left', 'right'], railIndex: 1, weight: 0.85, minScore: 16, chain: false, dense: true },
  { name: 'soloRailCenter', offsets: [3], lanes: ['center'], railIndex: 0, weight: 0.7, minScore: 18, chain: false, dense: false },
  { name: 'soloRailLeft', offsets: [3], lanes: ['left'], railIndex: 0, weight: 0.55, minScore: 12, chain: false, dense: false },
  { name: 'soloRailRight', offsets: [3], lanes: ['right'], railIndex: 0, weight: 0.55, minScore: 12, chain: false, dense: false },
]

export const PLACEMENT_LIBRARY = {
  1: [
    { name: 'centerSingle', lanes: ['center'], weight: 1 },
  ],
  2: [
    { name: 'centerDouble', lanes: ['center', 'center'], weight: 1 },
  ],
  3: [
    { name: 'centerTriple', lanes: ['center', 'center', 'center'], weight: 1 },
  ],
}

const PHASE_PATTERN_ALLOWLIST = {
  early: new Set(['anchor', 'push']),
  mid: new Set(['anchor', 'push', 'doubleQuarter', 'latePush', 'staircase']),
  late: null,
}

const PHASE_RAIL_ALLOWLIST = {
  early: new Set([]),
  mid: new Set(['railLeftSetup', 'railRightSetup', 'lateRailCenter']),
  late: null,
}

const PHASE_PLACEMENT_ALLOWLIST = {
  early: new Set(['centerSingle', 'centerDouble', 'centerTriple']),
  mid: new Set(['centerSingle', 'centerDouble', 'centerTriple']),
  late: null,
}

const RAIL_PHASE_SETTINGS = {
  early: {
    minProgressScore: 999,
    minMeasuresBetweenRails: 3,
    forceRailAfterMeasures: 6,
    chanceScale: 0.15,
  },
  mid: {
    minProgressScore: 6,
    minMeasuresBetweenRails: 1,
    forceRailAfterMeasures: 2,
    chanceScale: 1.05,
  },
  late: {
    minProgressScore: 10,
    minMeasuresBetweenRails: MIN_MEASURES_BETWEEN_RAILS,
    forceRailAfterMeasures: 2,
    chanceScale: 1.4,
  },
}

export function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

export function roundNumber(value, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function clampRange(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function getBlendedWeightMultiplier(multiplier, blend) {
  return 1 + (multiplier - 1) * clampRange(blend, 0, 1.5)
}

export function rampWeight(score, startScore, fullScore, maxWeight) {
  if (score <= startScore) return 0
  if (fullScore <= startScore) return maxWeight
  return clamp01((score - startScore) / (fullScore - startScore)) * maxWeight
}

export function getRunPhase(referenceBeat = MEASURE_PHASE_OFFSET_BEATS) {
  const elapsedMeasures = Math.max(0, referenceBeat - getStartupMeasureCursor(0)) / MEASURE_LENGTH_BEATS
  if (elapsedMeasures < EARLY_PHASE_MEASURES) return 'early'
  if (elapsedMeasures < MID_PHASE_MEASURES) return 'mid'
  return 'late'
}

export function getRunDifficultyProgress(progressScore, referenceBeat = MEASURE_PHASE_OFFSET_BEATS) {
  const scoreProgress = clamp01(progressScore / MAX_RAMP_SCORE)
  const beatProgress = clamp01(
    Math.max(0, referenceBeat - getStartupMeasureCursor(0)) / (MAX_RUN_DIFFICULTY_MEASURES * MEASURE_LENGTH_BEATS)
  )
  return clamp01(Math.max(scoreProgress, beatProgress))
}

export function getStartupMeasureCursor(musicTimeSeconds = 0) {
  const currentBeat = Math.floor(musicTimeSeconds / BEAT_INTERVAL)
  const desiredPhase = (STARTUP_SAFE_BEATS + MEASURE_PHASE_OFFSET_BEATS) % MEASURE_LENGTH_BEATS
  const minBeat = Math.max(STARTUP_SAFE_BEATS + MEASURE_PHASE_OFFSET_BEATS, currentBeat, 0)
  const phaseDelta = (desiredPhase - (minBeat % MEASURE_LENGTH_BEATS) + MEASURE_LENGTH_BEATS) % MEASURE_LENGTH_BEATS
  return minBeat + phaseDelta
}

export function getWeightedPatternPool(score, minOffset = 0, difficultyProgress = 0, runPhase = getRunPhase()) {
  const normalizedDifficulty = clamp01(difficultyProgress)
  const effectiveScore = Math.max(score, normalizedDifficulty * MAX_DIFFICULTY_SCORE_EQUIVALENT)
  const phaseAllowlist = PHASE_PATTERN_ALLOWLIST[runPhase] || null
  const pool = [
    { name: 'anchor', weight: Math.max(0.2, 3.15 - effectiveScore * 0.1) },
    { name: 'push', weight: 1.1 + rampWeight(effectiveScore, 0, 10, 1.45) - rampWeight(effectiveScore, 42, 70, 0.8) },
    { name: 'doubleQuarter', weight: 0.55 + rampWeight(effectiveScore, 4, 14, 2.35) - rampWeight(effectiveScore, 58, 72, 0.25) },
    { name: 'latePush', weight: 0.15 + rampWeight(effectiveScore, 10, 20, 2.15) },
    { name: 'staircase', weight: rampWeight(effectiveScore, 14, 28, 2.35) },
    { name: 'splitTriple', weight: rampWeight(effectiveScore, 18, 32, 2.75) },
    { name: 'lateDouble', weight: rampWeight(effectiveScore, 24, 40, 2.2) },
    { name: 'lateTriple', weight: rampWeight(effectiveScore, 30, 50, 2.45) },
  ]

  return pool
    .map((entry) => {
      const patternMeta = PATTERN_LIBRARY[entry.name]
      let weight = entry.weight

      if (entry.name === 'anchor') weight *= 1 - normalizedDifficulty * 0.72
      if (entry.name === 'push') weight *= 1 - normalizedDifficulty * 0.24
      if (patternMeta?.dense) weight *= 1 + normalizedDifficulty * 0.72
      if (patternMeta?.chain) weight *= 1 + normalizedDifficulty * 0.25
      if (entry.name.toLowerCase().includes('late')) weight *= 1 + normalizedDifficulty * 0.42

      return {
        ...entry,
        weight,
      }
    })
    .filter((entry) => (
      entry.weight > 0.05 &&
      (!phaseAllowlist || phaseAllowlist.has(entry.name)) &&
      PATTERN_LIBRARY[entry.name]?.offsets.every((offset) => offset > minOffset)
    ))
}

export function pickWeightedPattern(pool) {
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return 'anchor'

  let pick = Math.random() * totalWeight
  for (const entry of pool) {
    pick -= entry.weight
    if (pick <= 0) return entry.name
  }

  return pool[pool.length - 1]?.name || 'anchor'
}

export function pickWeightedEntry(pool) {
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return pool[0] || null

  let pick = Math.random() * totalWeight
  for (const entry of pool) {
    pick -= entry.weight
    if (pick <= 0) return entry
  }

  return pool[pool.length - 1] || null
}

export function shouldUseRail(
  score,
  measuresSinceRail,
  measureAnalysis = null,
  analysisBlend = 0,
  difficultyProgress = 0,
  runPhase = getRunPhase(),
) {
  const effectiveScore = Math.max(score, clamp01(difficultyProgress) * MAX_DIFFICULTY_SCORE_EQUIVALENT)
  const phaseSettings = RAIL_PHASE_SETTINGS[runPhase] || RAIL_PHASE_SETTINGS.late
  if (effectiveScore < phaseSettings.minProgressScore) return false
  if (measuresSinceRail < phaseSettings.minMeasuresBetweenRails) return false
  if (measuresSinceRail >= phaseSettings.forceRailAfterMeasures) return true

  const baseChance = (effectiveScore < 18 ? 0.24 : effectiveScore < 36 ? 0.38 : 0.54) + difficultyProgress * 0.18
  const urgencyBonus = measuresSinceRail >= 3 ? 0.16 : measuresSinceRail >= 2 ? 0.08 : 0
  const analysisChanceDelta = getRailAnalysisChanceDelta(measureAnalysis) * clampRange(analysisBlend, 0, 1.5)
  return Math.random() < clampRange((baseChance + urgencyBonus + analysisChanceDelta) * phaseSettings.chanceScale, 0, 0.92)
}

export function getWeightedRailPatternPool(
  score,
  recentPatternName = '',
  measureAnalysis = null,
  analysisBlend = 0,
  difficultyProgress = 0,
  runPhase = getRunPhase(),
) {
  const effectiveScore = Math.max(score, clamp01(difficultyProgress) * MAX_DIFFICULTY_SCORE_EQUIVALENT)
  const phaseAllowlist = PHASE_RAIL_ALLOWLIST[runPhase] || null
  let pool = RAIL_PATTERN_LIBRARY.filter((entry) => {
    if (typeof entry.minScore === 'number' && effectiveScore < entry.minScore) return false
    if (typeof entry.maxScore === 'number' && effectiveScore > entry.maxScore) return false
    if (phaseAllowlist && !phaseAllowlist.has(entry.name)) return false
    return entry.weight > 0.05
  })

  if (recentPatternName && pool.length > 1) {
    const dedupedPool = pool.filter((entry) => entry.name !== recentPatternName)
    if (dedupedPool.length > 0) pool = dedupedPool
  }

  if (measureAnalysis && analysisBlend > 0) {
    pool = pool.map((entry) => ({
      ...entry,
      weight: entry.weight * getBlendedWeightMultiplier(
        getRailPatternAnalysisMultiplier(entry, measureAnalysis),
        analysisBlend,
      ),
    }))
  }

  if (difficultyProgress > 0) {
    pool = pool.map((entry) => ({
      ...entry,
      weight: entry.weight * getRailDifficultyMultiplier(entry, difficultyProgress),
    }))
  }

  return pool
}

export function getPlacementPool({
  count,
  dense,
  score,
  recentPlacementName,
  measureAnalysis = null,
  analysisBlend = 0,
  difficultyProgress = 0,
  runPhase = getRunPhase(),
}) {
  const effectiveScore = Math.max(score, clamp01(difficultyProgress) * MAX_DIFFICULTY_SCORE_EQUIVALENT)
  const phaseAllowlist = PHASE_PLACEMENT_ALLOWLIST[runPhase] || null
  let pool = (PLACEMENT_LIBRARY[count] || PLACEMENT_LIBRARY[1]).filter((entry) => {
    if (typeof entry.minScore === 'number' && effectiveScore < entry.minScore) return false
    if (typeof entry.maxScore === 'number' && effectiveScore > entry.maxScore) return false
    if (entry.denseOnly && !dense) return false
    if (entry.sparseOnly && dense) return false
    if (phaseAllowlist && !phaseAllowlist.has(entry.name)) return false
    return true
  })

  if (recentPlacementName && pool.length > 1) {
    const dedupedPool = pool.filter((entry) => entry.name !== recentPlacementName)
    if (dedupedPool.length > 0) pool = dedupedPool
  }

  if (measureAnalysis && analysisBlend > 0) {
    pool = pool.map((entry) => ({
      ...entry,
      weight: entry.weight * getBlendedWeightMultiplier(
        getPlacementAnalysisMultiplier(entry, measureAnalysis),
        analysisBlend,
      ),
    }))
  }

  if (difficultyProgress > 0) {
    pool = pool.map((entry) => ({
      ...entry,
      weight: entry.weight * getPlacementDifficultyMultiplier(entry, difficultyProgress),
    }))
  }

  return pool
}

// --- Analysis-driven multiplier functions ---

export function getPatternAnalysisMultiplier(patternName, measureAnalysis) {
  const patternMeta = PATTERN_LIBRARY[patternName]
  if (!patternMeta || !measureAnalysis) return 1

  const accents = measureAnalysis.accents || []
  const lowBand = measureAnalysis.bandStrengths?.low || 0
  const highBand = measureAnalysis.bandStrengths?.high || 0
  const intensity = measureAnalysis.intensity || 0
  const density = measureAnalysis.density || 0
  const accentAlignment = getAccentAlignmentStrength(accents, patternMeta.offsets)
  const earlyAccent = getAccentWindowStrength(accents, 1)
  const lateAccent = getAccentWindowStrength(accents, 3)

  let multiplier = 0.82 + accentAlignment * 0.82
  if (patternMeta.offsets.some((offset) => offset <= 1.5)) {
    multiplier *= 0.9 + earlyAccent * 0.25
  }
  if (patternMeta.offsets.some((offset) => offset >= 2.5)) {
    multiplier *= 0.9 + lateAccent * 0.35
  }

  if (density >= 0.5 || intensity >= 0.56) {
    multiplier *= patternMeta.dense ? 1.22 : 0.88
  } else if (density <= 0.28 && intensity <= 0.42) {
    multiplier *= patternMeta.dense ? 0.7 : 1.18
  }

  if (lowBand > highBand + 0.08) {
    multiplier *= patternMeta.offsets.length === 1 ? 1.08 : 1.03
  }
  if (highBand > lowBand + 0.08 && patternMeta.chain) {
    multiplier *= 1.08
  }

  return clampRange(multiplier, 0.45, 1.8)
}

function getRailAnalysisChanceDelta(measureAnalysis) {
  if (!measureAnalysis) return 0

  const lowBand = measureAnalysis.bandStrengths?.low || 0
  const highBand = measureAnalysis.bandStrengths?.high || 0
  const intensity = measureAnalysis.intensity || 0
  const density = measureAnalysis.density || 0
  const lateAccent = getAccentWindowStrength(measureAnalysis.accents || [], 3, 0.75)

  let delta = 0
  delta += lowBand * 0.16
  delta += intensity * 0.12
  delta += lateAccent * 0.14
  delta -= Math.max(0, highBand - lowBand) * 0.1
  delta -= Math.max(0, density - 0.65) * 0.08

  return clampRange(delta - 0.12, -0.1, 0.22)
}

function getRailDifficultyMultiplier(entry, difficultyProgress) {
  if (difficultyProgress <= 0) return 1

  let multiplier = 1
  if (entry.dense) multiplier *= 1 + difficultyProgress * 0.28
  if (entry.offsets.some((offset) => offset >= 2.5)) multiplier *= 1 + difficultyProgress * 0.24
  if (entry.lanes.some((lane) => lane !== 'center')) multiplier *= 1 + difficultyProgress * 0.08

  return clampRange(multiplier, 0.75, 1.75)
}

function getRailPatternAnalysisMultiplier(entry, measureAnalysis) {
  if (!measureAnalysis) return 1

  const accents = measureAnalysis.accents || []
  const lowBand = measureAnalysis.bandStrengths?.low || 0
  const highBand = measureAnalysis.bandStrengths?.high || 0
  const alignment = getAccentAlignmentStrength(accents, entry.offsets)
  const centerLaneCount = entry.lanes.filter((lane) => lane === 'center').length
  const sideLaneCount = entry.lanes.filter((lane) => lane === 'left' || lane === 'right').length

  let multiplier = 0.85 + alignment * 0.75
  if (lowBand >= highBand) {
    multiplier *= 1 + centerLaneCount * 0.08
  }
  if (highBand > lowBand + 0.05) {
    multiplier *= 1 + sideLaneCount * 0.06
  }
  if ((measureAnalysis.intensity || 0) >= 0.55 && entry.dense) {
    multiplier *= 1.08
  }

  return clampRange(multiplier, 0.55, 1.7)
}

function getPlacementDifficultyMultiplier(entry, difficultyProgress) {
  if (difficultyProgress <= 0) return 1

  const entryName = entry.name.toLowerCase()
  const centerCount = entry.lanes.filter((lane) => lane === 'center').length
  const wideCount = entry.lanes.filter((lane) => lane === 'farLeft' || lane === 'farRight').length
  const sideCount = entry.lanes.filter((lane) => lane === 'left' || lane === 'right').length

  let multiplier = 1 + difficultyProgress * (wideCount * 0.22 + sideCount * 0.08 - centerCount * 0.06)
  if (entryName.includes('sweep') || entryName.includes('bounce') || entryName.includes('cross') || entryName.includes('outside')) {
    multiplier *= 1 + difficultyProgress * 0.28
  }
  if (entryName === 'centersingle') {
    multiplier *= 1 - difficultyProgress * 0.55
  }

  return clampRange(multiplier, 0.35, 1.9)
}

function getPlacementAnalysisMultiplier(entry, measureAnalysis) {
  if (!measureAnalysis) return 1

  const lowBand = measureAnalysis.bandStrengths?.low || 0
  const midBand = measureAnalysis.bandStrengths?.mid || 0
  const highBand = measureAnalysis.bandStrengths?.high || 0
  const density = measureAnalysis.density || 0
  const entryName = entry.name.toLowerCase()
  const centerCount = entry.lanes.filter((lane) => lane === 'center').length
  const wideCount = entry.lanes.filter((lane) => lane === 'farLeft' || lane === 'farRight').length
  const sideCount = entry.lanes.filter((lane) => lane === 'left' || lane === 'right').length

  let multiplier = 1

  if (lowBand >= midBand && lowBand >= highBand) {
    multiplier *= 1 + centerCount * 0.08 + sideCount * 0.03 - wideCount * 0.04
  }
  if (highBand > lowBand + 0.05) {
    multiplier *= 1 + wideCount * 0.14 + (entryName.includes('sweep') ? 0.1 : 0)
  }
  if (density >= 0.5) {
    multiplier *= entryName.includes('sweep') || entryName.includes('bounce') ? 1.1 : 0.96
  } else if (density <= 0.28) {
    multiplier *= centerCount > 0 ? 1.08 : 0.94
  }

  return clampRange(multiplier, 0.7, 1.45)
}

// --- Accent/analysis helpers used by multiplier functions ---

function getAccentWindowStrength(accents, centerOffset, tolerance = ACCENT_MATCH_TOLERANCE_BEATS) {
  if (!Array.isArray(accents) || accents.length === 0) return 0

  let bestStrength = 0
  for (const accent of accents) {
    const distance = Math.abs((accent.beatInMeasure ?? 0) - centerOffset)
    const closeness = clamp01(1 - distance / Math.max(tolerance, 0.001))
    bestStrength = Math.max(bestStrength, (accent.strength || 0) * closeness)
  }
  return clamp01(bestStrength)
}

function getAccentAlignmentStrength(accents, offsets, tolerance = ACCENT_MATCH_TOLERANCE_BEATS) {
  if (!Array.isArray(offsets) || offsets.length === 0) return 0
  if (!Array.isArray(accents) || accents.length === 0) return 0

  let totalStrength = 0
  for (const offset of offsets) {
    totalStrength += getAccentWindowStrength(accents, offset, tolerance)
  }

  return clamp01(totalStrength / offsets.length)
}

const ACCENT_MATCH_TOLERANCE_BEATS = 0.65
