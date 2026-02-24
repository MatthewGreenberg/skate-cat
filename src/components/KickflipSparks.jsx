import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../store'

const PARTICLE_COUNT = 30
const PARTICLE_LIFETIME = 0.5

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

export default function KickflipSparks() {
  const meshRef = useRef()

  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      life: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  )

  const colorArray = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), [])

  useFrame((_, delta) => {
    const kick = gameState.kickflip.current
    if (kick.triggered) {
      kick.triggered = false
      const spawnPos = kick.position
      for (const p of particles.current) {
        if (p.active) continue
        p.active = true
        p.life = PARTICLE_LIFETIME
        p.position.set(spawnPos[0], spawnPos[1] + 0.5, spawnPos[2])
        p.velocity.set(
          (Math.random() - 0.5) * 4,
          Math.random() * 3 + 2,
          (Math.random() - 0.5) * 4
        )
      }
    }

    if (!meshRef.current) return

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

      p.velocity.y -= 6 * delta // gravity
      p.position.addScaledVector(p.velocity, delta)

      const t = p.life / PARTICLE_LIFETIME
      const scale = t * 0.08

      _dummy.position.copy(p.position)
      _dummy.scale.setScalar(scale)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)

      // Color: white-yellow at start, orange at end
      _color.setHSL(0.1 * t, 1, 0.5 + t * 0.5)
      colorArray[i * 3] = _color.r
      colorArray[i * 3 + 1] = _color.g
      colorArray[i * 3 + 2] = _color.b
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.geometry.attributes.color.needsUpdate = true
  })

  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  return (
    <instancedMesh ref={meshRef} args={[geo, null, PARTICLE_COUNT]} frustumCulled={false}>
      <meshBasicMaterial
        toneMapped={false}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexColors
      />
      <instancedBufferAttribute attach="geometry-attributes-color" args={[colorArray, 3]} />
    </instancedMesh>
  )
}
