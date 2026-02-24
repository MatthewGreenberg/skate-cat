import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState } from '../store'


const JUMP_HEIGHT = 1.2
const JUMP_DURATION = 0.6
const KICKFLIP_ROTATIONS = 1
const PUSH_BOOST = 3
const SPEED_DECAY = 8

// Death animation params
const DEATH_HOP_HEIGHT = 1.5
const DEATH_HOP_SIDE = 2.5
const DEATH_DURATION = 1.0
const DEATH_TUMBLE_SPEED = 8

export default function SkateCat({ trailTargetRef }) {
  const { catRotX, catRotY, catRotZ } = useControls('Cat', {
    catRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    catRotY: { value: 1.3, min: -Math.PI, max: Math.PI, step: 0.05 },
    catRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
  })

  const groupRef = useRef()
  const boardRef = useRef()
  const catRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const cat = useGLTF('/maxwell_the_cat_dingus.glb')

  const jumpState = useRef({
    active: false,
    time: 0,
    direction: 1,
  })

  const deathState = useRef({
    active: false,
    time: 0,
  })

  const keys = useRef({ right: false })
  const wasGameOver = useRef(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (gameState.gameOver) return
      if (e.key === 'ArrowUp' && !jumpState.current.active) {
        jumpState.current.active = true
        jumpState.current.time = 0
        jumpState.current.direction = Math.random() < 0.5 ? 1 : -1

        const wp = new THREE.Vector3()
        if (groupRef.current) {
          groupRef.current.getWorldPosition(wp)
        }
        gameState.kickflip.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
      }
      if (e.key === 'ArrowRight') keys.current.right = true
    }
    const onKeyUp = (e) => {
      if (e.key === 'ArrowRight') keys.current.right = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame((state, delta) => {
    if (!groupRef.current || !catRef.current) return

    // Reset on restart
    if (wasGameOver.current && !gameState.gameOver) {
      wasGameOver.current = false
      deathState.current.active = false
      deathState.current.time = 0
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      if (boardRef.current) boardRef.current.rotation.z = 0
      jumpState.current.active = false
      return
    }

    // Death animation
    if (gameState.gameOver) {
      wasGameOver.current = true

      if (!deathState.current.active) {
        deathState.current.active = true
        deathState.current.time = 0
      }

      deathState.current.time += delta
      const t = Math.min(deathState.current.time / DEATH_DURATION, 1)

      // Cat hops off to the side with a tumble
      const hopHeight = 4 * DEATH_HOP_HEIGHT * t * (1 - t)
      catRef.current.position.x = t * DEATH_HOP_SIDE
      catRef.current.position.y = 0.2 + hopHeight
      catRef.current.rotation.z = deathState.current.time * DEATH_TUMBLE_SPEED

      return
    }

    // Speed control
    if (keys.current.right) {
      gameState.speed.current = Math.min(
        gameState.speed.current + PUSH_BOOST * delta,
        30
      )
    } else {
      gameState.speed.current = Math.max(
        gameState.speed.current - SPEED_DECAY * delta,
        gameState.baseSpeed
      )
    }

    const jump = jumpState.current
    gameState.jumping = jump.active

    if (jump.active) {
      jump.time += delta
      const t = jump.time / JUMP_DURATION

      if (t >= 1) {
        jump.active = false
        jump.time = 0
        groupRef.current.position.y = 0.05
        if (boardRef.current) boardRef.current.rotation.z = 0
      } else {
        const height = 4 * JUMP_HEIGHT * t * (1 - t)
        groupRef.current.position.y = 0.05 + height

        if (boardRef.current) {
          boardRef.current.rotation.z = t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
        }
      }
    } else {
      groupRef.current.position.y = 0.05 + Math.sin(state.clock.elapsedTime * 4) * 0.04
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.03
      groupRef.current.rotation.x = -0.05 + Math.sin(state.clock.elapsedTime * 2.5) * 0.02

      if (boardRef.current) boardRef.current.rotation.z = 0
    }


  })

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <group ref={boardRef}>
        <primitive
          object={skateboard.scene.clone()}
          scale={2}
          rotation={[0, Math.PI / 2, 0]}
          position={[0, 0, 0]}
        />
      </group>
      <group ref={catRef} position={[0, 0.2, 0]}>
        <primitive
          object={cat.scene.clone()}
          scale={0.03}
          rotation={[catRotX, catRotY, catRotZ]}
        />
      </group>
      <group ref={trailTargetRef} position={[0, 0.2, 1.5]} />
      <pointLight
        position={[0.5, 1.5, 0.5]}
        intensity={5}
        distance={2.5}
        decay={2}
        color="#ffe8cc"
      />
    </group>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/maxwell_the_cat_dingus.glb')
