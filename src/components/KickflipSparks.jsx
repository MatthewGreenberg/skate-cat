import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../store'

const PARTICLE_COUNT = 60
const PARTICLE_LIFETIME = 0.5
const LAND_PARTICLE_LIFETIME = 0.6

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

export default function KickflipSparks() {
  const meshRef = useRef()

  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      life: 0,
      maxLife: PARTICLE_LIFETIME,
      type: 'jump',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  )

  const colorArray = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), [])

  useFrame((_, delta) => {
    // Jump sparks — upward burst
    const kick = gameState.kickflip.current
    if (kick.triggered) {
      kick.triggered = false
      const spawnPos = kick.position
      let spawned = 0
      for (const p of particles.current) {
        if (p.active || spawned >= 25) continue
        p.active = true
        p.life = PARTICLE_LIFETIME
        p.maxLife = PARTICLE_LIFETIME
        p.type = 'jump'
        p.position.set(spawnPos[0], spawnPos[1] - 0.1, spawnPos[2])
        p.velocity.set(
          (Math.random() - 0.5) * 3,
          Math.random() * 1.5 + 0.5,
          (Math.random() - 0.5) * 3
        )
        spawned++
      }
    }

    // Landing burst — radial outward explosion
    const land = gameState.landed.current
    if (land.triggered) {
      land.triggered = false
      const spawnPos = land.position
      let spawned = 0
      for (const p of particles.current) {
        if (p.active || spawned >= 30) continue
        p.active = true
        p.life = LAND_PARTICLE_LIFETIME
        p.maxLife = LAND_PARTICLE_LIFETIME
        p.type = 'land'
        p.position.set(spawnPos[0], spawnPos[1] + 0.05, spawnPos[2])
        const angle = Math.random() * Math.PI * 2
        const speed = 1.5 + Math.random() * 3
        p.velocity.set(
          Math.cos(angle) * speed,
          Math.random() * 0.8 + 0.2,
          Math.sin(angle) * speed
        )
        spawned++
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

      const t = p.life / p.maxLife

      if (p.type === 'land') {
        // Landing particles: bigger, dust-colored, fan outward
        const scale = t * 0.05
        _dummy.position.copy(p.position)
        _dummy.scale.setScalar(scale)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        // Warm dust color
        _color.setRGB(0.9, 0.75, 0.5)
        colorArray[i * 3] = _color.r
        colorArray[i * 3 + 1] = _color.g
        colorArray[i * 3 + 2] = _color.b
      } else {
        // Jump sparks: small, bright
        const scale = t * 0.03
        _dummy.position.copy(p.position)
        _dummy.scale.setScalar(scale)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        _color.setHSL(0.1 * t, 1, 0.5 + t * 0.5)
        colorArray[i * 3] = _color.r
        colorArray[i * 3 + 1] = _color.g
        colorArray[i * 3 + 2] = _color.b
      }
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
