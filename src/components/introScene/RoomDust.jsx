/**
 * Slow-drifting dust motes for the intro room. Per-mote color tinted by
 * distance to the TV so the nearer ones feel lit by the screen glow.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 30
const BOUNDS = {
  minX: -3.0, maxX: 3.0,
  minY: 0.4, maxY: 2.8,
  minZ: -2.6, maxZ: 1.6,
}

const WARM_COLOR = new THREE.Color('#ffcf96')
const COOL_COLOR = new THREE.Color('#89baff')
const _tint = new THREE.Color()

export function RoomDust({ tvCenter, bootVisualMix = 1, opacity = 0.45 }) {
  const pointsRef = useRef()
  const materialRef = useRef()

  const { geometry, motion } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const motionData = []

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const x = THREE.MathUtils.lerp(BOUNDS.minX, BOUNDS.maxX, Math.random())
      const y = THREE.MathUtils.lerp(BOUNDS.minY, BOUNDS.maxY, Math.random())
      const z = THREE.MathUtils.lerp(BOUNDS.minZ, BOUNDS.maxZ, Math.random())
      positions[i * 3 + 0] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      // Tint by proximity to TV: nearest motes glow warm, farthest read cool.
      const dx = x - (tvCenter?.x ?? 0)
      const dy = y - (tvCenter?.y ?? 1.9)
      const dz = z - (tvCenter?.z ?? 0)
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const warmth = THREE.MathUtils.clamp(1 - dist / 3.5, 0, 1)
      _tint.copy(COOL_COLOR).lerp(WARM_COLOR, warmth)
      colors[i * 3 + 0] = _tint.r
      colors[i * 3 + 1] = _tint.g
      colors[i * 3 + 2] = _tint.b

      sizes[i] = 0.018 + Math.random() * 0.022

      motionData.push({
        driftY: 0.04 + Math.random() * 0.06,
        swayAmpX: 0.05 + Math.random() * 0.08,
        swayAmpZ: 0.04 + Math.random() * 0.07,
        swaySpeed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        baseX: x,
        baseZ: z,
      })
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    return { geometry: geo, motion: motionData }
  }, [tvCenter?.x, tvCenter?.y, tvCenter?.z])

  const uniforms = useMemo(() => ({
    uOpacity: { value: opacity },
    uPixelRatio: { value: typeof window !== 'undefined' ? window.devicePixelRatio : 1 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame((state, delta) => {
    const points = pointsRef.current
    if (!points) return

    const positionAttr = points.geometry.attributes.position
    const positions = positionAttr.array

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const m = motion[i]
      const t = state.clock.elapsedTime

      let y = positions[i * 3 + 1] + m.driftY * delta
      if (y > BOUNDS.maxY) y = BOUNDS.minY

      positions[i * 3 + 0] = m.baseX + Math.sin(t * m.swaySpeed + m.phase) * m.swayAmpX
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = m.baseZ + Math.cos(t * m.swaySpeed * 0.8 + m.phase) * m.swayAmpZ
    }

    positionAttr.needsUpdate = true

    if (materialRef.current) {
      uniforms.uOpacity.value = opacity * bootVisualMix
    }
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={/* glsl */`
          attribute float size;
          varying vec3 vColor;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={/* glsl */`
          uniform float uOpacity;
          varying vec3 vColor;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p);
            if (d > 0.5) discard;
            float soft = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor, soft * uOpacity);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
        toneMapped={false}
      />
    </points>
  )
}
