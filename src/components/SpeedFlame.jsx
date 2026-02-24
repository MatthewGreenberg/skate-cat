import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../store'

const SPEED_THRESHOLD = 8
const MAX_SPEED = 30

export default function SpeedFlame() {
  const outerRef = useRef()
  const innerRef = useRef()
  const groupRef = useRef()

  const outerGeo = useMemo(() => new THREE.ConeGeometry(0.15, 1, 8), [])
  const innerGeo = useMemo(() => new THREE.ConeGeometry(0.08, 0.8, 8), [])

  useFrame((state) => {
    if (!groupRef.current) return

    const speed = gameState.speed.current
    const t = Math.max(0, (speed - SPEED_THRESHOLD) / (MAX_SPEED - SPEED_THRESHOLD))

    if (t <= 0) {
      groupRef.current.visible = false
      return
    }

    groupRef.current.visible = true

    const flicker = 0.9 + Math.sin(state.clock.elapsedTime * 25) * 0.1
    const flicker2 = 0.95 + Math.sin(state.clock.elapsedTime * 35 + 1) * 0.05
    const length = (0.5 + t * 1.5) * flicker
    const width = (0.5 + t * 0.5) * flicker2

    if (outerRef.current) {
      outerRef.current.scale.set(width, length, width)
    }
    if (innerRef.current) {
      innerRef.current.scale.set(width * 0.7, length * 0.9, width * 0.7)
    }

    const opacity = Math.min(t * 2, 0.9)
    if (outerRef.current) outerRef.current.material.opacity = opacity * 0.7
    if (innerRef.current) innerRef.current.material.opacity = opacity
  })

  return (
    <group ref={groupRef} position={[0, 0.2, 1.6]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
      <mesh ref={outerRef} geometry={outerGeo}>
        <meshBasicMaterial
          color="#FF4500"
          toneMapped={false}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={innerRef} geometry={innerGeo}>
        <meshBasicMaterial
          color="#FFD700"
          toneMapped={false}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
