import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../store'

const PARTICLE_COUNT = 60
const PARTICLE_LIFETIME = 0.8

const _dummy = new THREE.Object3D()

export default function DustTrail() {
  const meshRef = useRef()

  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      life: 0,
      maxLife: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  )

  const spawnTimer = useRef(0)

  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Spawn new particles while game is running
    if (!gameState.gameOver && gameState.speed.current > 0.5) {
      spawnTimer.current += delta
      const spawnRate = 0.02 // spawn every 20ms
      while (spawnTimer.current >= spawnRate) {
        spawnTimer.current -= spawnRate
        const p = particles.current.find(p => !p.active)
        if (p) {
          p.active = true
          p.maxLife = PARTICLE_LIFETIME * (0.6 + Math.random() * 0.4)
          p.life = p.maxLife
          // Spawn behind the skateboard (z ~ 0.6 behind, slight random offset)
          p.position.set(
            (Math.random() - 0.5) * 0.4,
            0.02 + Math.random() * 0.05,
            0.5 + Math.random() * 0.3
          )
          const speedFactor = gameState.speed.current * 0.06
          p.velocity.set(
            (Math.random() - 0.5) * 0.8,
            0.3 + Math.random() * 0.5,
            speedFactor + Math.random() * 0.3
          )
        }
      }
    }

    // Update particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles.current[i]
      if (!p.active) {
        _dummy.scale.setScalar(0)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        continue
      }

      p.life -= delta
      if (p.life <= 0) {
        p.active = false
        _dummy.scale.setScalar(0)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        continue
      }

      // Slow down and drift
      p.velocity.y -= 0.5 * delta
      p.velocity.multiplyScalar(1 - delta * 2)
      p.position.addScaledVector(p.velocity, delta)

      const t = p.life / p.maxLife
      const scale = (1 - t) * 0.06 + 0.02 // grow as they age, then small

      _dummy.position.copy(p.position)
      _dummy.scale.setScalar(scale * t) // fade out by shrinking
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])

  return (
    <instancedMesh ref={meshRef} args={[geo, null, PARTICLE_COUNT]} frustumCulled={false}>
      <meshBasicMaterial
        color="#c4a882"
        transparent
        opacity={0.4}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
