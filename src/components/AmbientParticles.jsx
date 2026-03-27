import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState, getGameDelta, getNightFactor } from '../store'

const PARTICLE_COUNT = 40

export default function AmbientParticles({ active = true }) {
  const meshRef = useRef()
  const matRef = useRef()
  const motionTime = useRef(0)

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

  useEffect(() => {
    if (active || !meshRef.current) return

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      _dummy.scale.setScalar(0)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true

    if (matRef.current) {
      matRef.current.opacity = 0
    }
  }, [active, _dummy])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    if (!active) return

    const gameDelta = getGameDelta(delta)
    motionTime.current += gameDelta

    const time = motionTime.current
    const scrollSpeed = gameState.gameOver ? 0 : gameState.speed.current
    const nightFactor = getNightFactor(gameState.timeOfDay.current)

    // At night: particles get bigger and brighter (firefly effect)
    const nightScale = 1 + nightFactor * 2.5
    const nightOpacity = THREE.MathUtils.lerp(0.7, 1.0, nightFactor)

    if (matRef.current) {
      matRef.current.opacity = nightOpacity
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]

      // Float gently
      p.position.y = p.baseY + 0.8 + Math.sin(time * p.speed + p.phase) * 0.5
      p.position.x += p.drift * gameDelta

      // Scroll with the world
      p.position.z += scrollSpeed * gameDelta

      // Wrap around when behind camera
      if (p.position.z > 5) {
        p.position.z = -25 - Math.random() * 10
        p.position.x = (Math.random() - 0.5) * 8
        p.baseY = 0.5 + Math.random() * 3
      }

      // Gentle twinkle — more pronounced at night
      const twinkleSpeed = THREE.MathUtils.lerp(3, 1.5, nightFactor)
      const twinkleRange = THREE.MathUtils.lerp(0.4, 0.6, nightFactor)
      const twinkle = (1 - twinkleRange) + Math.sin(time * twinkleSpeed + p.phase) * twinkleRange

      _dummy.position.copy(p.position)
      _dummy.scale.setScalar(p.scale * twinkle * nightScale)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])

  return (
    <instancedMesh ref={meshRef} args={[geo, null, PARTICLE_COUNT]} frustumCulled={false}>
      <meshBasicMaterial
        ref={matRef}
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
