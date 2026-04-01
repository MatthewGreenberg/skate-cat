import { createRef } from "react";
import * as THREE from "three";

const DEFAULT_TIMING_OFFSET_SECONDS = null;
export const MAX_RUN_LIVES = 2;
const debugParams = new URLSearchParams(window.location.search);
const qualityParam = debugParams.get("quality") || "auto";
const validQualityModes = new Set(["high", "auto", "quiet"]);
export const debugMode = debugParams.get("debug") || "";
export const isDebug = debugParams.has("debug");
export const isTimingDebug = debugMode === "timing";
export const isDownbeatTest = debugParams.get("downbeatTest") === "1";
export const isObstacleSpacingDebug =
  debugMode === "spacing" || debugParams.get("spacingDebug") === "1";
export const debugControlsEnabled = import.meta.env.DEV && isDebug;
export const qualityMode = validQualityModes.has(qualityParam) ? qualityParam : "auto";
export const isHighQuality = qualityMode === "high";
export const isQuietQuality = qualityMode === "quiet";
export const SPEED_RESPONSE = 4;

export function createIdleGrindState() {
  return { active: false, obstacleId: 0, x: 0, z: 0 };
}

export function createIdleGrindSparkState() {
  return {
    active: false,
    position: [0, 0, 0],
    direction: 1,
    intensity: 0,
    impactId: 0,
  };
}

export function createAccuracyStats() {
  return {
    Perfect: 0,
    Good: 0,
    Sloppy: 0,
  };
}

export function createEmptyScoringEvent() {
  return {
    id: 0,
    points: 0,
    grade: "Perfect",
    multiplier: 1,
    isRail: false,
    trickName: "",
    label: "",
  };
}

export function getAccuracyPercent(stats = createAccuracyStats()) {
  const perfect = stats?.Perfect || 0;
  const good = stats?.Good || 0;
  const sloppy = stats?.Sloppy || 0;
  const total = perfect + good + sloppy;
  if (total <= 0) return 0;

  const weightedHits = perfect + good * 0.72 + sloppy * 0.4;
  return Math.round((weightedHits / total) * 100);
}

export function formatFailReason(reason) {
  switch (reason) {
    case "late jump":
      return "Late Jump";
    case "low jump":
      return "Low Jump";
    case "missed rail hold":
      return "Missed Rail Hold";
    default:
      return "Collision";
  }
}

export function getRunRank(summary) {
  if (!summary) return "F";

  const accuracyRatio = (summary.accuracyPercent || 0) / 100;
  if (summary.outcome === "complete") {
    if (
      summary.progressScore >= 48 &&
      accuracyRatio >= 0.88 &&
      summary.bestStreak >= 10 &&
      summary.remainingLives >= 1
    ) {
      return "S";
    }
    if (summary.progressScore >= 34 && accuracyRatio >= 0.76 && summary.bestStreak >= 6) {
      return "A";
    }
    if (summary.progressScore >= 24 && accuracyRatio >= 0.62) {
      return "B";
    }
    if (summary.progressScore >= 14) {
      return "C";
    }
    return "D";
  }

  if (summary.progressScore >= 20 && accuracyRatio >= 0.65) return "C";
  if (summary.progressScore >= 10 || summary.totalScore >= 12) return "D";
  return "F";
}

// Shared mutable game state (refs avoid re-renders)
export const gameState = {
  speed: createRef(),
  baseSpeed: 8,
  postMilestoneSpeedBoost: 3.5,
  speedBoostActive: false,
  speedLinesOn: false,
  jumping: false,
  gameOver: false,
  score: 0,
  progressScore: 0,
  onGameOver: null, // callback to trigger React re-render
  onHudScoreChange: null,
  onRestart: null,
  kickflip: createRef(),
  screenShake: createRef(),
  landed: createRef(),
  streak: createRef(),
  scoreMultiplier: createRef(),
  pendingJumpTiming: createRef(),
  obstacleTargets: createRef(),
  obstacleDebug: createRef(),
  upArrowHeld: createRef(),
  activeGrind: createRef(),
  grindSpark: createRef(),
  timeScale: createRef(),
  grindCooldownObstacleId: createRef(),
  catHeight: createRef(),
  lastScoringEvent: createRef(),
  comboEnergy: createRef(),
  timeOfDay: createRef(), // 0→1 cycling float
  nightContrast: createRef(), // contrast offset driven by day/night cycle
  timingOffsetSeconds: createRef(),
  obstacleHitDelaySeconds: createRef(),
  runDifficultyProgress: createRef(),
  phaseSpeedBonus: createRef(),
  remainingLives: createRef(),
  groundSpinCount: createRef(),
  railCount: createRef(),
  bestStreak: createRef(),
  accuracyStats: createRef(),
  lastFailReason: createRef(),
  tutorialPrompt: createRef(),
  runPhase: createRef(),
  phaseAnnouncement: createRef(),
  lastRunSummary: createRef(),
};
gameState.speed.current = 0;
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] };
gameState.screenShake.current = 0;
gameState.landed.current = { triggered: false, position: [0, 0, 0] };
gameState.streak.current = 0;
gameState.scoreMultiplier.current = 1;
gameState.pendingJumpTiming.current = null;
gameState.obstacleTargets.current = [];
gameState.obstacleDebug.current = [];
gameState.upArrowHeld.current = false;
gameState.activeGrind.current = createIdleGrindState();
gameState.grindSpark.current = createIdleGrindSparkState();
gameState.timeScale.current = 1;
gameState.grindCooldownObstacleId.current = 0;
gameState.catHeight.current = 0.05;
gameState.lastScoringEvent.current = createEmptyScoringEvent();
gameState.comboEnergy.current = 1;
gameState.timeOfDay.current = 0;
gameState.nightContrast.current = 0;
gameState.timingOffsetSeconds.current = DEFAULT_TIMING_OFFSET_SECONDS;
gameState.obstacleHitDelaySeconds.current = 0;
gameState.runDifficultyProgress.current = 0;
gameState.progressScore = 0;
gameState.phaseSpeedBonus.current = 0;
gameState.remainingLives.current = MAX_RUN_LIVES;
gameState.groundSpinCount.current = 0;
gameState.railCount.current = 0;
gameState.bestStreak.current = 0;
gameState.accuracyStats.current = createAccuracyStats();
gameState.lastFailReason.current = "";
gameState.tutorialPrompt.current = "";
gameState.runPhase.current = "early";
gameState.phaseAnnouncement.current = "";
gameState.lastRunSummary.current = null;

export function emitHudScoreChange() {
  if (!gameState.onHudScoreChange) return;
  gameState.onHudScoreChange({
    score: gameState.score,
    streak: gameState.streak.current,
    multiplier: gameState.scoreMultiplier.current,
    remainingLives: gameState.remainingLives.current,
    maxLives: MAX_RUN_LIVES,
    tutorialPrompt: gameState.tutorialPrompt.current,
    runPhase: gameState.runPhase.current,
    phaseAnnouncement: gameState.phaseAnnouncement.current,
    lastScoringEvent: gameState.lastScoringEvent.current,
  });
}

export function buildRunSummary({ outcome = "failed" } = {}) {
  const accuracyStats = gameState.accuracyStats.current || createAccuracyStats();
  const summary = {
    outcome,
    totalScore: gameState.score,
    progressScore: gameState.progressScore,
    bestStreak: gameState.bestStreak.current || 0,
    railCount: gameState.railCount.current || 0,
    groundSpinCount: gameState.groundSpinCount.current || 0,
    remainingLives: gameState.remainingLives.current ?? MAX_RUN_LIVES,
    maxLives: MAX_RUN_LIVES,
    accuracyStats,
    accuracyPercent: getAccuracyPercent(accuracyStats),
    failReason: formatFailReason(gameState.lastFailReason.current),
  };

  summary.rank = getRunRank(summary);
  return summary;
}

export function resetObstacleTargets() {
  gameState.obstacleTargets.current = [];
}

export function upsertObstacleTarget(target) {
  const targets = gameState.obstacleTargets.current || [];
  const existingIndex = targets.findIndex((entry) => entry.id === target.id);
  if (existingIndex !== -1) {
    targets.splice(existingIndex, 1);
  }

  let insertAt = targets.findIndex((entry) => entry.targetTime > target.targetTime);
  if (insertAt === -1) insertAt = targets.length;
  targets.splice(insertAt, 0, target);
  gameState.obstacleTargets.current = targets;
}

export function removeObstacleTarget(id) {
  const targets = gameState.obstacleTargets.current || [];
  const targetIndex = targets.findIndex((entry) => entry.id === id);
  if (targetIndex === -1) return;

  targets.splice(targetIndex, 1);
  gameState.obstacleTargets.current = targets;
}

export function getScoreMultiplier(streak) {
  if (streak >= 20) return 4;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

export function getTargetRunSpeed() {
  // Obstacle density can ramp independently, but world scroll speed should stay fixed.
  return gameState.baseSpeed;
}

export function getGameDelta(delta) {
  return delta * (gameState.timeScale.current ?? 1);
}

// ~45 seconds per full day/night cycle
export const DAY_NIGHT_CYCLE_SPEED = 1 / 45;

// Square-wave day/night: 35% day, 10% sunset, 35% night, 10% sunrise, then wraps
// 0–0.35: day, 0.35–0.45: sunset, 0.45–0.8: night, 0.8–0.9: sunrise, 0.9–1: day
export function getNightFactor(t) {
  if (t < 0.35) return 0;
  if (t < 0.45) return (t - 0.35) / 0.1;
  if (t < 0.8) return 1;
  if (t < 0.9) return 1 - (t - 0.8) / 0.1;
  return 0;
}

// Returns 0–1 for sunset intensity (peaks at ~0.4)
export function getSunsetFactor(t) {
  if (t < 0.35) return 0;
  if (t < 0.4) return (t - 0.35) / 0.05;
  if (t < 0.45) return 1 - (t - 0.4) / 0.05;
  return 0;
}

// Returns contrast offset: ramps to -0.1 during sunset, holds through night, ramps back during sunrise
export function getNightContrastOffset(t) {
  if (t < 0.35) return 0;
  if (t < 0.45) return -0.1 * ((t - 0.35) / 0.1);
  if (t < 0.8) return -0.1;
  if (t < 0.9) return -0.1 * (1 - (t - 0.8) / 0.1);
  return 0;
}

// Returns 0–1 for sunrise intensity (peaks at ~0.85)
export function getSunriseFactor(t) {
  if (t < 0.8) return 0;
  if (t < 0.85) return (t - 0.8) / 0.05;
  if (t < 0.9) return 1 - (t - 0.85) / 0.05;
  return 0;
}

// Reusable temp colors to avoid allocations
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

// Cache parsed hex colors to avoid re-parsing every frame
const _colorCache = new Map();
function cachedColor(hex, dest) {
  let cached = _colorCache.get(hex);
  if (!cached) {
    cached = new THREE.Color(hex);
    _colorCache.set(hex, cached);
  }
  dest.copy(cached);
}

// Lerp between day, sunset, and night colors based on timeOfDay
export function lerpDayNightColor(
  target,
  dayHex,
  nightHex,
  nightFactor,
  sunsetHex,
  sunsetFactor,
) {
  cachedColor(dayHex, _c1);
  cachedColor(nightHex, _c2);
  target.copy(_c1).lerp(_c2, nightFactor);
  if (sunsetHex && sunsetFactor > 0) {
    cachedColor(sunsetHex, _c3);
    target.lerp(_c3, sunsetFactor * 0.6);
  }
}
