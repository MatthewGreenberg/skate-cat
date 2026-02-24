import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import { gameState } from '../store'

const POOL_SIZE = 6

export default function Obstacles() {
  const log = useGLTF('/large_tree_log.glb')
  const refs = useRef([])
  const active = useRef(
    Array.from({ length: POOL_SIZE }, () => ({ z: 0, visible: false, scaleY: 1, rotY: 0 }))
  )
  const nextSpawn = useRef(0)

  const { minGap, maxGap, logScale } = useControls('Obstacles', {
    minGap: { value: 15, min: 5, max: 40, step: 1 },
    maxGap: { value: 30, min: 10, max: 60, step: 1 },
    logScale: { value: 0.8, min: 0.1, max: 3, step: 0.1 },
  })

  // Schedule first spawn
  useMemo(() => {
    nextSpawn.current = 20
  }, [])

  const wasGameOver = useRef(false)

  useFrame((_, delta) => {
    // Reset obstacles when game restarts
    if (wasGameOver.current && !gameState.gameOver) {
      for (let i = 0; i < POOL_SIZE; i++) {
        active.current[i].visible = false
        active.current[i].scored = false
        if (refs.current[i]) refs.current[i].visible = false
      }
      nextSpawn.current = 20
      wasGameOver.current = false
      return
    }
    if (gameState.gameOver) {
      wasGameOver.current = true
      return
    }

    const speed = gameState.speed.current

    // Collision detection — cat is at z=0, check if log is near
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (!ob.visible) continue
      // Log is near the cat (z ~ 0) and cat is not jumping
      if (ob.z > -1.5 && ob.z < 1.5 && !ob.scored) {
        if (!gameState.jumping) {
          // HIT — game over
          gameState.gameOver = true
          gameState.speed.current = 0
          if (gameState.onGameOver) gameState.onGameOver()
          return
        }
        ob.scored = true
        gameState.score++
      }
    }

    // Move all active obstacles toward camera
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (!ob.visible) continue

      ob.z += speed * delta

      if (ob.z > 15) {
        // passed behind camera, deactivate
        ob.visible = false
      }

      if (refs.current[i]) {
        refs.current[i].position.z = -ob.z + ob.z * 0 // stay at world z
        refs.current[i].position.z = ob.z
        refs.current[i].visible = ob.visible
      }
    }

    // Spawn check
    nextSpawn.current -= speed * delta
    if (nextSpawn.current <= 0) {
      // Find an inactive slot
      const slot = active.current.find(o => !o.visible)
      if (slot) {
        slot.z = -60 // spawn far ahead
        slot.visible = true
        slot.scored = false
        slot.rotY = Math.random() * Math.PI * 2
        slot.scaleY = 0.7 + Math.random() * 0.6

        // Random X offset on the road (-1 to 1)
        slot.x = (Math.random() - 0.5) * 2
      }
      nextSpawn.current = minGap + Math.random() * (maxGap - minGap)
    }

    // Update transforms
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (refs.current[i]) {
        refs.current[i].position.set(ob.x || 0, 0, ob.z)
        refs.current[i].rotation.y = ob.rotY || 0
        refs.current[i].visible = ob.visible
      }
    }
  })

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group
          key={i}
          ref={(el) => (refs.current[i] = el)}
          visible={false}
        >
          <primitive
            object={log.scene.clone()}
            scale={logScale}
            rotation={[0, Math.PI / 2, 0]}
          />
        </group>
      ))}
    </group>
  )
}

useGLTF.preload('/large_tree_log.glb')
