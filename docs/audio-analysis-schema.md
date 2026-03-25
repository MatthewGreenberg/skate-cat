# Audio Analysis Sidecar

This repo's obstacle scheduler is beat-grid based, so the sidecar stays in beat-space and treats transients as musical hints rather than direct one-to-one obstacle spawns.

The analyzer script is:

```bash
python3 scripts/analyze_track.py \
  public/skate-cat-2.mp3 \
  public/skate-cat-2.analysis.json \
  --audio-public-path /skate-cat-2.mp3 \
  --bpm 170 \
  --phase-offset-seconds -0.068
```

Install the Python dependencies first:

```bash
python3 -m pip install -r scripts/requirements-librosa.txt
```

## Exact JSON Shape

```json
{
  "schemaVersion": 1,
  "generatedAtUtc": "2026-03-19T21:00:00Z",
  "audio": {
    "sourcePath": "public/skate-cat-2.mp3",
    "publicPath": "/skate-cat-2.mp3",
    "durationSeconds": 138.893025,
    "sampleRate": 44100
  },
  "timing": {
    "gridTempoBpm": 170,
    "estimatedTempoBpm": 84.720799,
    "beatIntervalSeconds": 0.352941,
    "phaseOffsetSeconds": -0.068,
    "beatsPerMeasure": 4,
    "gridStepBeats": 0.5,
    "detectedBeatCount": 198
  },
  "analysisSettings": {
    "hopLength": 512,
    "fftSize": 2048,
    "minOnsetStrength": 0.18
  },
  "beats": [
    {
      "beatIndex": 0,
      "timeSeconds": -0.068,
      "measureIndex": 0,
      "beatInMeasure": 0,
      "downbeat": true
    }
  ],
  "onsets": [
    {
      "onsetIndex": 0,
      "frame": 66,
      "timeSeconds": 0.766259,
      "strength": 0.481133,
      "rawBeat": 2.3638,
      "snappedBeat": 2.5,
      "snappedTimeSeconds": 0.814353,
      "gridErrorMs": -48.094,
      "measureIndex": 0,
      "beatInMeasure": 2.5,
      "dominantBand": "mid",
      "bandStrengths": {
        "low": 0.204742,
        "mid": 0.541551,
        "high": 0.253707
      }
    }
  ],
  "accents": [
    {
      "accentIndex": 0,
      "beat": 2.5,
      "timeSeconds": 0.814353,
      "measureIndex": 0,
      "beatInMeasure": 2.5,
      "strength": 0.481133,
      "meanStrength": 0.433912,
      "onsetCount": 2,
      "dominantBand": "mid",
      "bandStrengths": {
        "low": 0.208114,
        "mid": 0.528825,
        "high": 0.263061
      }
    }
  ],
  "measureSummaries": [
    {
      "measureIndex": 0,
      "startBeat": 0,
      "endBeat": 4,
      "startTimeSeconds": -0.068,
      "endTimeSeconds": 1.343765,
      "accentOffsets": [2.5, 3.0],
      "accentCount": 2,
      "onsetCount": 3,
      "density": 0.25,
      "meanAccentStrength": 0.401251,
      "maxAccentStrength": 0.481133,
      "downbeatStrength": 0,
      "bandStrengths": {
        "low": 0.243112,
        "mid": 0.512331,
        "high": 0.244557
      },
      "energyMean": 0.271403,
      "energyPeak": 0.633119,
      "intensity": 0.263912
    }
  ],
  "sections": [
    {
      "sectionIndex": 0,
      "label": "medium",
      "startMeasureIndex": 0,
      "endMeasureIndex": 8,
      "startBeat": 0,
      "endBeat": 32,
      "measureCount": 8,
      "meanIntensity": 0.471018,
      "meanEnergy": 0.536228,
      "meanDensity": 0.349615
    }
  ]
}
```

## Field Intent

- `beats`: canonical beat grid used by the game. This is the stable backbone.
- `timing.estimatedTempoBpm`: a diagnostic read from `librosa`, not the value the game should trust.
- `onsets`: raw transient candidates, filtered by normalized onset strength and snapped to the configured grid.
- `accents`: grouped musical accents per snapped beat slot. This is the best level for pattern weighting.
- `measureSummaries`: coarse planning input for `scheduleMeasurePattern()`. Density, energy, and band balance live here.
- `sections`: contiguous intensity groupings for phrase-level behavior changes.

## Integration Guidance

- Keep obstacle encounter times quantized to `beatIndex`.
- Use `accents` and `measureSummaries` to bias pattern choice, density, rails, and lane emphasis.
- Do not spawn one obstacle for every raw onset.
