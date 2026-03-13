import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../store'

const PARTICLE_COUNT = 40

export default function AmbientParticles() {
  const meshRef = useRef()

  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        0.5 + Math.random() * 3,
        -Math.random() * 30
      ),
      baseY: 0,
      speed: 0.2 + Math.random() * 0.4,
      drift: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
      scale: 0.015 + Math.random() * 0.02,
    }))
  }, [])

  const _dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    const time = state.clock.elapsedTime
    const scrollSpeed = gameState.gameOver ? 0 : gameState.speed.current

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]

      // Float gently
      p.position.y = p.baseY + 0.8 + Math.sin(time * p.speed + p.phase) * 0.5
      p.position.x += p.drift * delta

      // Scroll with the world
      p.position.z += scrollSpeed * delta

      // Wrap around when behind camera
      if (p.position.z > 5) {
        p.position.z = -25 - Math.random() * 10
        p.position.x = (Math.random() - 0.5) * 8
        p.baseY = 0.5 + Math.random() * 3
      }

      // Gentle twinkle
      const twinkle = 0.6 + Math.sin(time * 3 + p.phase) * 0.4

      _dummy.position.copy(p.position)
      _dummy.scale.setScalar(p.scale * twinkle)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])

  return (
    <instancedMesh ref={meshRef} args={[geo, null, PARTICLE_COUNT]} frustumCulled={false}>
      <meshBasicMaterial
        color="#ffe8a0"
        transparent
        opacity={0.7}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
