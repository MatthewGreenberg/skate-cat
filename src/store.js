import { createRef } from 'react'

export const gameState = {
  speed: createRef(),
  baseSpeed: 5,
  kickflip: createRef(),
}
gameState.speed.current = 5
gameState.kickflip.current = { triggered: false, position: [0, 0, 0] }
