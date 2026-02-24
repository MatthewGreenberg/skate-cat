import { createRef } from 'react'

// Shared mutable game state (refs avoid re-renders)
export const gameState = {
  speed: createRef(),
  baseSpeed: 5,
  jumping: false,
  gameOver: false,
  score: 0,
  onGameOver: null, // callback to trigger React re-render
  onRestart: null,
  kickflip: createRef(),
}
gameState.speed.current = 5
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] }
