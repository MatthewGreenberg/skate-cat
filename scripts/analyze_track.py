#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import librosa
import numpy as np


DEFAULT_BPM = 170.0
DEFAULT_PHASE_OFFSET_SECONDS = -0.068
DEFAULT_BEATS_PER_MEASURE = 4
DEFAULT_GRID_STEP_BEATS = 0.5
DEFAULT_HOP_LENGTH = 512
DEFAULT_N_FFT = 2048
DEFAULT_MIN_ONSET_STRENGTH = 0.18
DEFAULT_SECTION_SMOOTHING_WINDOW_MEASURES = 4


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def to_float(value: Any) -> float:
    array = np.asarray(value, dtype=float).reshape(-1)
    if array.size == 0:
        return 0.0
    return float(array[0])


def round_float(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def guess_audio_public_path(audio_path: Path) -> str:
    parts = list(audio_path.parts)
    if "public" in parts:
        public_index = parts.index("public")
        public_parts = parts[public_index + 1 :]
        if public_parts:
            return "/" + "/".join(public_parts)
    return f"/{audio_path.name}"


def time_to_beat_index(time_seconds: float, beat_interval_seconds: float, phase_offset_seconds: float) -> float:
    return (time_seconds - phase_offset_seconds) / beat_interval_seconds


def beat_index_to_time(beat_index: float, beat_interval_seconds: float, phase_offset_seconds: float) -> float:
    return beat_index * beat_interval_seconds + phase_offset_seconds


def snap_to_grid(value: float, step: float) -> float:
    return round(value / step) * step


def band_masks(frequencies: np.ndarray) -> dict[str, np.ndarray]:
    return {
        "low": (frequencies >= 20) & (frequencies < 200),
        "mid": (frequencies >= 200) & (frequencies < 2000),
        "high": frequencies >= 2000,
    }


def dominant_band_for_frame(
    spectrum: np.ndarray,
    masks: dict[str, np.ndarray],
) -> tuple[str, dict[str, float]]:
    band_values = {}
    for band_name, mask in masks.items():
        if not np.any(mask):
            band_values[band_name] = 0.0
            continue
        band_values[band_name] = float(np.sum(spectrum[mask]))

    total = sum(band_values.values()) or 1.0
    band_strengths = {
        band_name: round_float(value / total)
        for band_name, value in band_values.items()
    }
    dominant_band = max(band_strengths.items(), key=lambda item: item[1])[0]
    return dominant_band, band_strengths


def compute_measure_energy(
    rms: np.ndarray,
    sr: int,
    hop_length: int,
    start_time_seconds: float,
    end_time_seconds: float,
    rms_peak: float,
) -> tuple[float, float]:
    start_frame = max(0, int(librosa.time_to_frames(start_time_seconds, sr=sr, hop_length=hop_length)))
    end_frame = max(start_frame + 1, int(librosa.time_to_frames(end_time_seconds, sr=sr, hop_length=hop_length)))
    clipped_end = min(end_frame, len(rms))
    if start_frame >= clipped_end:
        return 0.0, 0.0

    window = rms[start_frame:clipped_end]
    if window.size == 0:
        return 0.0, 0.0

    return (
        round_float(float(np.mean(window)) / rms_peak),
        round_float(float(np.max(window)) / rms_peak),
    )


def classify_intensity_labels(measure_summaries: list[dict[str, Any]]) -> list[str]:
    if not measure_summaries:
        return []

    intensities = np.asarray([summary["intensity"] for summary in measure_summaries], dtype=float)
    if intensities.size < 3:
        return ["medium"] * len(measure_summaries)

    smoothing_window = min(DEFAULT_SECTION_SMOOTHING_WINDOW_MEASURES, intensities.size)
    if smoothing_window > 1:
        kernel = np.ones(smoothing_window, dtype=float) / smoothing_window
        smoothed = np.convolve(intensities, kernel, mode="same")
    else:
        smoothed = intensities

    low_cutoff, high_cutoff = np.quantile(smoothed, [0.33, 0.66])
    labels = []
    for intensity in smoothed:
        if intensity <= low_cutoff:
            labels.append("low")
        elif intensity >= high_cutoff:
            labels.append("high")
        else:
            labels.append("medium")
    return labels


def build_sections(
    measure_summaries: list[dict[str, Any]],
    beats_per_measure: int,
) -> list[dict[str, Any]]:
    labels = classify_intensity_labels(measure_summaries)
    if not labels:
        return []

    sections: list[dict[str, Any]] = []
    section_start = 0

    for index in range(1, len(labels) + 1):
        if index < len(labels) and labels[index] == labels[section_start]:
            continue

        group = measure_summaries[section_start:index]
        section = {
            "sectionIndex": len(sections),
            "label": labels[section_start],
            "startMeasureIndex": section_start,
            "endMeasureIndex": index,
            "startBeat": section_start * beats_per_measure,
            "endBeat": index * beats_per_measure,
            "measureCount": index - section_start,
            "meanIntensity": round_float(sum(item["intensity"] for item in group) / len(group)),
            "meanEnergy": round_float(sum(item["energyMean"] for item in group) / len(group)),
            "meanDensity": round_float(sum(item["density"] for item in group) / len(group)),
        }
        sections.append(section)
        section_start = index

    return sections


def analyze_track(args: argparse.Namespace) -> dict[str, Any]:
    audio_path = Path(args.audio_path)
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    duration_seconds = float(len(y)) / float(sr)
    beat_interval_seconds = 60.0 / args.bpm
    audio_public_path = args.audio_public_path or guess_audio_public_path(audio_path)

    onset_envelope = librosa.onset.onset_strength(
        y=y,
        sr=sr,
        hop_length=args.hop_length,
    )
    onset_envelope_peak = float(np.max(onset_envelope)) or 1.0
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sr,
        hop_length=args.hop_length,
        units="frames",
        backtrack=False,
    )

    estimated_tempo_bpm, estimated_beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope,
        sr=sr,
        hop_length=args.hop_length,
        start_bpm=args.bpm,
    )
    estimated_tempo_bpm = to_float(estimated_tempo_bpm)

    stft_magnitude = np.abs(librosa.stft(y, n_fft=args.n_fft, hop_length=args.hop_length))
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=args.n_fft)
    masks = band_masks(frequencies)

    rms = librosa.feature.rms(
        y=y,
        frame_length=args.n_fft,
        hop_length=args.hop_length,
    )[0]
    rms_peak = float(np.max(rms)) or 1.0

    total_grid_beats = int(math.ceil(max(0.0, duration_seconds - args.phase_offset_seconds) / beat_interval_seconds))
    beats = []
    for beat_index in range(total_grid_beats + args.beats_per_measure + 1):
        time_seconds = beat_index_to_time(beat_index, beat_interval_seconds, args.phase_offset_seconds)
        if time_seconds > duration_seconds + beat_interval_seconds:
            break
        beats.append(
            {
                "beatIndex": beat_index,
                "timeSeconds": round_float(time_seconds),
                "measureIndex": beat_index // args.beats_per_measure,
                "beatInMeasure": beat_index % args.beats_per_measure,
                "downbeat": beat_index % args.beats_per_measure == 0,
            }
        )

    onsets = []
    for frame in onset_frames.tolist():
        time_seconds = float(librosa.frames_to_time(frame, sr=sr, hop_length=args.hop_length))
        strength = float(onset_envelope[frame]) / onset_envelope_peak
        if strength < args.min_onset_strength:
            continue

        raw_beat = time_to_beat_index(time_seconds, beat_interval_seconds, args.phase_offset_seconds)
        snapped_beat = snap_to_grid(raw_beat, args.grid_step_beats)
        snapped_time_seconds = beat_index_to_time(snapped_beat, beat_interval_seconds, args.phase_offset_seconds)
        grid_error_ms = (time_seconds - snapped_time_seconds) * 1000.0
        measure_index = int(math.floor(snapped_beat / args.beats_per_measure))
        beat_in_measure = snapped_beat - (measure_index * args.beats_per_measure)
        spectrum_frame = stft_magnitude[:, min(frame, stft_magnitude.shape[1] - 1)]
        dominant_band, frame_band_strengths = dominant_band_for_frame(spectrum_frame, masks)

        onsets.append(
            {
                "onsetIndex": len(onsets),
                "frame": int(frame),
                "timeSeconds": round_float(time_seconds),
                "strength": round_float(strength),
                "rawBeat": round_float(raw_beat, 4),
                "snappedBeat": round_float(snapped_beat, 4),
                "snappedTimeSeconds": round_float(snapped_time_seconds),
                "gridErrorMs": round_float(grid_error_ms, 3),
                "measureIndex": measure_index,
                "beatInMeasure": round_float(beat_in_measure, 4),
                "dominantBand": dominant_band,
                "bandStrengths": frame_band_strengths,
            }
        )

    accent_groups: dict[float, list[dict[str, Any]]] = defaultdict(list)
    for onset in onsets:
        accent_groups[onset["snappedBeat"]].append(onset)

    accents = []
    for snapped_beat in sorted(accent_groups):
        grouped_onsets = accent_groups[snapped_beat]
        strength_sum = sum(onset["strength"] for onset in grouped_onsets) or 1.0
        weighted_band_strengths = {}
        for band_name in ("low", "mid", "high"):
            weighted_band_strengths[band_name] = round_float(
                sum(onset["strength"] * onset["bandStrengths"][band_name] for onset in grouped_onsets) / strength_sum
            )

        dominant_band = max(weighted_band_strengths.items(), key=lambda item: item[1])[0]
        measure_index = int(math.floor(snapped_beat / args.beats_per_measure))
        beat_in_measure = snapped_beat - (measure_index * args.beats_per_measure)
        accents.append(
            {
                "accentIndex": len(accents),
                "beat": round_float(snapped_beat, 4),
                "timeSeconds": round_float(
                    beat_index_to_time(snapped_beat, beat_interval_seconds, args.phase_offset_seconds)
                ),
                "measureIndex": measure_index,
                "beatInMeasure": round_float(beat_in_measure, 4),
                "strength": round_float(max(onset["strength"] for onset in grouped_onsets)),
                "meanStrength": round_float(sum(onset["strength"] for onset in grouped_onsets) / len(grouped_onsets)),
                "onsetCount": len(grouped_onsets),
                "dominantBand": dominant_band,
                "bandStrengths": weighted_band_strengths,
            }
        )

    accents_by_measure: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for accent in accents:
        accents_by_measure[accent["measureIndex"]].append(accent)

    measure_count = int(math.ceil(max(0.0, total_grid_beats) / args.beats_per_measure))
    slots_per_measure = max(1, int(round(args.beats_per_measure / args.grid_step_beats)))
    measure_summaries = []
    for measure_index in range(measure_count):
        start_beat = measure_index * args.beats_per_measure
        end_beat = start_beat + args.beats_per_measure
        start_time_seconds = beat_index_to_time(start_beat, beat_interval_seconds, args.phase_offset_seconds)
        end_time_seconds = beat_index_to_time(end_beat, beat_interval_seconds, args.phase_offset_seconds)
        measure_accents = accents_by_measure.get(measure_index, [])
        strength_sum = sum(accent["strength"] for accent in measure_accents) or 1.0
        band_strengths = {}
        for band_name in ("low", "mid", "high"):
            band_strengths[band_name] = round_float(
                sum(accent["strength"] * accent["bandStrengths"][band_name] for accent in measure_accents) / strength_sum
            ) if measure_accents else 0.0

        energy_mean, energy_peak = compute_measure_energy(
            rms=rms,
            sr=sr,
            hop_length=args.hop_length,
            start_time_seconds=max(0.0, start_time_seconds),
            end_time_seconds=max(0.0, end_time_seconds),
            rms_peak=rms_peak,
        )
        density = round_float(len(measure_accents) / slots_per_measure)
        downbeat_strength = next(
            (accent["strength"] for accent in measure_accents if abs(accent["beatInMeasure"]) < 1e-6),
            0.0,
        )
        intensity = round_float(clamp((energy_mean * 0.65) + (density * 0.35), 0.0, 1.0))
        measure_summaries.append(
            {
                "measureIndex": measure_index,
                "startBeat": start_beat,
                "endBeat": end_beat,
                "startTimeSeconds": round_float(start_time_seconds),
                "endTimeSeconds": round_float(end_time_seconds),
                "accentOffsets": [
                    round_float(accent["beat"] - start_beat, 4)
                    for accent in measure_accents
                ],
                "accentCount": len(measure_accents),
                "onsetCount": sum(accent["onsetCount"] for accent in measure_accents),
                "density": density,
                "meanAccentStrength": round_float(
                    sum(accent["strength"] for accent in measure_accents) / len(measure_accents)
                ) if measure_accents else 0.0,
                "maxAccentStrength": round_float(max((accent["strength"] for accent in measure_accents), default=0.0)),
                "downbeatStrength": round_float(downbeat_strength),
                "bandStrengths": band_strengths,
                "energyMean": energy_mean,
                "energyPeak": energy_peak,
                "intensity": intensity,
            }
        )

    sections = build_sections(
        measure_summaries=measure_summaries,
        beats_per_measure=args.beats_per_measure,
    )

    analysis = {
        "schemaVersion": 1,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "audio": {
            "sourcePath": str(audio_path),
            "publicPath": audio_public_path,
            "durationSeconds": round_float(duration_seconds),
            "sampleRate": sr,
        },
        "timing": {
            "gridTempoBpm": round_float(args.bpm, 6),
            "estimatedTempoBpm": round_float(estimated_tempo_bpm, 6),
            "beatIntervalSeconds": round_float(beat_interval_seconds),
            "phaseOffsetSeconds": round_float(args.phase_offset_seconds),
            "beatsPerMeasure": args.beats_per_measure,
            "gridStepBeats": round_float(args.grid_step_beats, 4),
            "detectedBeatCount": int(len(np.asarray(estimated_beat_frames).reshape(-1))),
        },
        "analysisSettings": {
            "hopLength": args.hop_length,
            "fftSize": args.n_fft,
            "minOnsetStrength": round_float(args.min_onset_strength),
        },
        "beats": beats,
        "onsets": onsets,
        "accents": accents,
        "measureSummaries": measure_summaries,
        "sections": sections,
    }
    return analysis


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze an audio track with librosa and emit beat-space JSON for obstacle planning."
    )
    parser.add_argument("audio_path", help="Path to the audio file to analyze.")
    parser.add_argument("output_path", help="Path to the JSON file to write.")
    parser.add_argument(
        "--audio-public-path",
        default="",
        help="Public path stored in the JSON. Defaults to a path guessed from a public/ file.",
    )
    parser.add_argument("--bpm", type=float, default=DEFAULT_BPM, help=f"Canonical grid tempo. Default: {DEFAULT_BPM}.")
    parser.add_argument(
        "--phase-offset-seconds",
        type=float,
        default=DEFAULT_PHASE_OFFSET_SECONDS,
        help=f"Canonical track phase offset. Default: {DEFAULT_PHASE_OFFSET_SECONDS}.",
    )
    parser.add_argument(
        "--beats-per-measure",
        type=int,
        default=DEFAULT_BEATS_PER_MEASURE,
        help=f"Beats per measure. Default: {DEFAULT_BEATS_PER_MEASURE}.",
    )
    parser.add_argument(
        "--grid-step-beats",
        type=float,
        default=DEFAULT_GRID_STEP_BEATS,
        help=f"Grid snapping step in beats. Default: {DEFAULT_GRID_STEP_BEATS}.",
    )
    parser.add_argument(
        "--hop-length",
        type=int,
        default=DEFAULT_HOP_LENGTH,
        help=f"Analysis hop length. Default: {DEFAULT_HOP_LENGTH}.",
    )
    parser.add_argument(
        "--n-fft",
        type=int,
        default=DEFAULT_N_FFT,
        help=f"FFT size for spectral analysis. Default: {DEFAULT_N_FFT}.",
    )
    parser.add_argument(
        "--min-onset-strength",
        type=float,
        default=DEFAULT_MIN_ONSET_STRENGTH,
        help=f"Minimum normalized onset strength to keep. Default: {DEFAULT_MIN_ONSET_STRENGTH}.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    analysis = analyze_track(args)
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file_handle:
        json.dump(analysis, file_handle, indent=2)
        file_handle.write("\n")


if __name__ == "__main__":
    main()
