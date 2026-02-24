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
}
gameState.speed.current = 5
