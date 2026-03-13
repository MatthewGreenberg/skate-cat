import { createRef } from 'react'

export const isDebug = new URLSearchParams(window.location.search).has('debug')

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
  onGameOver: null, // callback to trigger React re-render
  onRestart: null,
  kickflip: createRef(),
  screenShake: createRef(),
  landed: createRef(),
  streak: createRef(),
}
gameState.speed.current = 0
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] }
gameState.screenShake.current = 0
gameState.landed.current = { triggered: false, position: [0, 0, 0] }
gameState.streak.current = 0
