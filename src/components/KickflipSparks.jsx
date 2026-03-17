import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState, getGameDelta } from '../store'

const PARTICLE_COUNT = 60
const PARTICLE_LIFETIME = 0.5
const LAND_PARTICLE_LIFETIME = 0.6
const GRIND_PARTICLE_LIFETIME = 0.22
const GRIND_IMPACT_PARTICLE_LIFETIME = 0.28
const MAX_GRIND_SPARK_INTENSITY = 1.4

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()
const _colorArray = new Float32Array(PARTICLE_COUNT * 3)

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

  const grindSpawnTimer = useRef(0)
  const lastGrindImpactId = useRef(0)

  useFrame((_, delta) => {
    const gameDelta = getGameDelta(delta)
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

    const grind = gameState.grindSpark.current
    if (grind?.impactId && grind.impactId !== lastGrindImpactId.current) {
      lastGrindImpactId.current = grind.impactId
      const burstCount = 10 + Math.round((grind.intensity || 1) * 8)
      let spawned = 0
      for (const p of particles.current) {
        if (p.active || spawned >= burstCount) continue
        p.active = true
        p.life = GRIND_IMPACT_PARTICLE_LIFETIME * (0.7 + Math.random() * 0.5)
        p.maxLife = p.life
        p.type = 'grindImpact'
        p.position.set(
          grind.position[0] + (Math.random() - 0.5) * 0.04,
          grind.position[1] + (Math.random() - 0.5) * 0.03,
          grind.position[2] + (Math.random() - 0.5) * 0.08
        )
        p.velocity.set(
          -grind.direction * (0.6 + Math.random() * 1.8),
          0.8 + Math.random() * 1.6,
          1.8 + Math.random() * 2.5
        )
        spawned++
      }
    }

    if (grind?.active) {
      const intensity = Math.min(MAX_GRIND_SPARK_INTENSITY, grind.intensity || 1)
      const spawnRate = THREE.MathUtils.lerp(0.02, 0.008, intensity / MAX_GRIND_SPARK_INTENSITY)
      const sparksPerTick = intensity > 1.05 ? 3 : intensity > 0.8 ? 2 : 1
      grindSpawnTimer.current += gameDelta
      while (grindSpawnTimer.current >= spawnRate) {
        grindSpawnTimer.current -= spawnRate
        let spawned = 0
        for (const p of particles.current) {
          if (p.active || spawned >= sparksPerTick) continue
          p.active = true
          p.life = GRIND_PARTICLE_LIFETIME * (0.8 + Math.random() * 0.4) * intensity
          p.maxLife = p.life
          p.type = 'grind'
          p.position.set(
            grind.position[0] + (Math.random() - 0.5) * 0.03,
            grind.position[1] + (Math.random() - 0.5) * 0.02,
            grind.position[2] + (Math.random() - 0.5) * 0.05
          )
          p.velocity.set(
            -grind.direction * (0.25 + Math.random() * 0.7) * intensity,
            (0.3 + Math.random() * 1.1) * intensity,
            (1 + Math.random() * 1.8) * intensity
          )
          spawned++
        }
      }
    } else {
      grindSpawnTimer.current = 0
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

      p.life -= gameDelta
      if (p.life <= 0) {
        p.active = false
        _dummy.scale.setScalar(0)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        continue
      }

      if (p.type === 'grindImpact') {
        p.velocity.y -= 10 * gameDelta
        p.velocity.z += gameDelta * 0.45
      } else if (p.type === 'grind') {
        p.velocity.y -= 8 * gameDelta
        p.velocity.z += gameDelta * 0.3
      } else {
        p.velocity.y -= 6 * gameDelta // gravity
      }
      p.position.addScaledVector(p.velocity, gameDelta)

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
        _colorArray[i * 3] = _color.r
        _colorArray[i * 3 + 1] = _color.g
        _colorArray[i * 3 + 2] = _color.b
      } else if (p.type === 'grindImpact') {
        const scale = 0.018 + (1 - t) * 0.035
        _dummy.position.copy(p.position)
        _dummy.scale.set(scale * 2.2, scale * 0.8, scale * 0.8)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        _color.setRGB(1, 0.95 - (1 - t) * 0.1, 0.55 + t * 0.2)
        _colorArray[i * 3] = _color.r
        _colorArray[i * 3 + 1] = _color.g
        _colorArray[i * 3 + 2] = _color.b
      } else if (p.type === 'grind') {
        const scale = 0.012 + (1 - t) * 0.02
        _dummy.position.copy(p.position)
        _dummy.scale.set(scale * 1.8, scale * 0.55, scale * 0.55)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        _color.setRGB(1, 0.84 - (1 - t) * 0.16, 0.32 + t * 0.18)
        _colorArray[i * 3] = _color.r
        _colorArray[i * 3 + 1] = _color.g
        _colorArray[i * 3 + 2] = _color.b
      } else {
        // Jump sparks: small, bright
        const scale = t * 0.03
        _dummy.position.copy(p.position)
        _dummy.scale.setScalar(scale)
        _dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, _dummy.matrix)
        _color.setHSL(0.1 * t, 1, 0.5 + t * 0.5)
        _colorArray[i * 3] = _color.r
        _colorArray[i * 3 + 1] = _color.g
        _colorArray[i * 3 + 2] = _color.b
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
      <instancedBufferAttribute attach="geometry-attributes-color" args={[_colorArray, 3]} />
    </instancedMesh>
  )
}
