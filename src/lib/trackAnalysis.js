import { roundNumber, MEASURE_LENGTH_BEATS, MEASURE_PHASE_OFFSET_BEATS } from './obstaclePatterns'

export const TRACK_ANALYSIS_URL = '/skate-cat-2.analysis.json'

export function getGameplayMeasureStartBeat(beat) {
  return Math.floor((beat - MEASURE_PHASE_OFFSET_BEATS) / MEASURE_LENGTH_BEATS) * MEASURE_LENGTH_BEATS + MEASURE_PHASE_OFFSET_BEATS
}

export function getEmptyBandStrengths() {
  return {
    low: 0,
    mid: 0,
    high: 0,
  }
}

export function getWeightedBandStrengths(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return getEmptyBandStrengths()

  const strengthSum = entries.reduce((sum, entry) => sum + (entry.strength || 0), 0)
  if (strengthSum <= 0) return getEmptyBandStrengths()

  return {
    low: roundNumber(
      entries.reduce((sum, entry) => sum + (entry.strength || 0) * (entry.bandStrengths?.low || 0), 0) / strengthSum
    ),
    mid: roundNumber(
      entries.reduce((sum, entry) => sum + (entry.strength || 0) * (entry.bandStrengths?.mid || 0), 0) / strengthSum
    ),
    high: roundNumber(
      entries.reduce((sum, entry) => sum + (entry.strength || 0) * (entry.bandStrengths?.high || 0), 0) / strengthSum
    ),
  }
}

export function buildTrackAnalysisLookups(analysis) {
  const measuresByStartBeat = new Map()
  const accentsByStartBeat = new Map()
  const canonicalMeasureSummaries = analysis?.measureSummaries || []
  const gridStepBeats = analysis?.timing?.gridStepBeats || 0.5
  const slotsPerMeasure = Math.max(1, Math.round(MEASURE_LENGTH_BEATS / gridStepBeats))

  for (const accent of analysis?.accents || []) {
    const measureStartBeat = getGameplayMeasureStartBeat(accent.beat ?? 0)
    if (measureStartBeat < 0) continue
    const measureAccents = accentsByStartBeat.get(measureStartBeat) || []
    measureAccents.push({
      ...accent,
      measureStartBeat,
      beatInMeasure: (accent.beat ?? 0) - measureStartBeat,
    })
    accentsByStartBeat.set(measureStartBeat, measureAccents)
  }

  for (const summary of canonicalMeasureSummaries) {
    const startBeat = summary.startBeat ?? 0
    if (startBeat < 0) continue

    const measureAccents = accentsByStartBeat.get(startBeat) || []
    const derivedBandStrengths = getWeightedBandStrengths(measureAccents)

    measuresByStartBeat.set(startBeat, {
      measureIndex: summary.measureIndex ?? Math.floor((startBeat - MEASURE_PHASE_OFFSET_BEATS) / MEASURE_LENGTH_BEATS),
      startBeat,
      endBeat: summary.endBeat ?? (startBeat + MEASURE_LENGTH_BEATS),
      accentOffsets: Array.isArray(summary.accentOffsets)
        ? summary.accentOffsets.map((offset) => roundNumber(offset))
        : measureAccents.map((accent) => roundNumber(accent.beatInMeasure ?? 0)),
      accentCount: summary.accentCount ?? measureAccents.length,
      onsetCount: summary.onsetCount ?? measureAccents.length,
      density: roundNumber(summary.density ?? (measureAccents.length / slotsPerMeasure)),
      meanAccentStrength: roundNumber(
        summary.meanAccentStrength ??
          (measureAccents.reduce((sum, accent) => sum + (accent.strength || 0), 0) / Math.max(measureAccents.length, 1))
      ),
      maxAccentStrength: roundNumber(
        summary.maxAccentStrength ?? Math.max(...measureAccents.map((accent) => accent.strength || 0), 0)
      ),
      downbeatStrength: roundNumber(
        summary.downbeatStrength ??
          measureAccents.find((accent) => Math.abs((accent.beatInMeasure ?? 0)) < 1e-6)?.strength ??
          0
      ),
      bandStrengths: {
        low: roundNumber(summary.bandStrengths?.low ?? derivedBandStrengths.low),
        mid: roundNumber(summary.bandStrengths?.mid ?? derivedBandStrengths.mid),
        high: roundNumber(summary.bandStrengths?.high ?? derivedBandStrengths.high),
      },
      energyMean: roundNumber(summary.energyMean ?? 0),
      energyPeak: roundNumber(summary.energyPeak ?? 0),
      intensity: roundNumber(summary.intensity ?? 0),
      accents: measureAccents,
    })
  }

  if (measuresByStartBeat.size === 0) {
    for (const [startBeat, measureAccents] of accentsByStartBeat.entries()) {
      const accentStrengthSum = measureAccents.reduce((sum, accent) => sum + (accent.strength || 0), 0)
      const bandStrengths = getWeightedBandStrengths(measureAccents)

      measuresByStartBeat.set(startBeat, {
        measureIndex: Math.floor((startBeat - MEASURE_PHASE_OFFSET_BEATS) / MEASURE_LENGTH_BEATS),
        startBeat,
        endBeat: startBeat + MEASURE_LENGTH_BEATS,
        accentOffsets: measureAccents.map((accent) => roundNumber(accent.beatInMeasure ?? 0)),
        accentCount: measureAccents.length,
        onsetCount: measureAccents.length,
        density: roundNumber(measureAccents.length / slotsPerMeasure),
        meanAccentStrength: roundNumber(accentStrengthSum / Math.max(measureAccents.length, 1)),
        maxAccentStrength: roundNumber(Math.max(...measureAccents.map((accent) => accent.strength || 0), 0)),
        downbeatStrength: roundNumber(
          measureAccents.find((accent) => Math.abs((accent.beatInMeasure ?? 0)) < 1e-6)?.strength || 0,
        ),
        bandStrengths,
        energyMean: 0,
        energyPeak: 0,
        intensity: 0,
        accents: measureAccents,
      })
    }
  }

  return {
    measuresByStartBeat,
  }
}

export function getMeasureAnalysis(lookups, measureStartBeat) {
  return lookups.measuresByStartBeat.get(measureStartBeat) || null
}
