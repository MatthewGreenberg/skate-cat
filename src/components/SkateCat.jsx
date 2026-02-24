import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { gameState } from '../store'
import SpeedFlame from './SpeedFlame'

export default function SkateCat({ trailTargetRef }) {
  const groupRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const cat = useGLTF('/cat/scene.gltf')
  const jumpState = useRef({ active: false, velocity: 0 })

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowUp' && !jumpState.current.active) {
        jumpState.current.active = true
        jumpState.current.velocity = 5

        const wp = new THREE.Vector3()
        if (groupRef.current) {
          groupRef.current.getWorldPosition(wp)
        }
        gameState.kickflip.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Idle bob
      const bob = Math.sin(state.clock.elapsedTime * 3) * 0.03
      const tilt = Math.sin(state.clock.elapsedTime * 2) * 0.02

      // Jump physics
      if (jumpState.current.active) {
        jumpState.current.velocity -= 15 * delta
        groupRef.current.position.y += jumpState.current.velocity * delta
        if (groupRef.current.position.y <= 0) {
          groupRef.current.position.y = 0
          jumpState.current.active = false
          jumpState.current.velocity = 0
        }
        // Kickflip rotation during jump
        groupRef.current.rotation.z += delta * 12
      } else {
        groupRef.current.position.y = bob
        groupRef.current.rotation.x = tilt
        groupRef.current.rotation.z = 0
      }
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive
        object={skateboard.scene.clone()}
        scale={0.5}
        position={[0, 0, 0]}
      />
      <primitive
        object={cat.scene.clone()}
        scale={0.4}
        position={[0, 0.15, 0]}
      />
      {/* Trail attachment point at back of skateboard */}
      <group ref={trailTargetRef} position={[0, 0.1, 0.5]} />
      <SpeedFlame />
    </group>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/cat/scene.gltf')
