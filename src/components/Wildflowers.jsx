import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const FLOWER_COUNT = 50
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12
const ROAD_HALF = 1.8

function mulberry32(seed) {
  let t = seed
  return function random() {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTE = [
  '#ff5a5f', // coral red
  '#ff9f43', // orange
  '#ffd93d', // bright yellow
  '#f06595', // pink
  '#845ef7', // violet
  '#4d96ff', // sky blue
  '#fff1c1', // pale cream
]

export default function Wildflowers() {
  const meshRef = useRef()
  const uniformsRef = useRef({
    uTime: { value: 0 },
  })

  const { matrices, colors } = useMemo(() => {
    const random = mulberry32(1337)
    const dummy = new THREE.Object3D()
    const mats = []
    const cols = []

    for (let i = 0; i < FLOWER_COUNT; i++) {
      const side = random() < 0.5 ? -1 : 1
      const x = side * (ROAD_HALF + 0.3 + random() * (SEGMENT_WIDTH / 2 - ROAD_HALF - 0.5))
      const z = (random() - 0.5) * SEGMENT_LENGTH
      const scale = 0.06 + random() * 0.08
      const y = 0.32 + random() * 0.32

      dummy.position.set(x, y, z)
      dummy.rotation.set(
        random() * 0.3,
        random() * Math.PI * 2,
        random() * 0.3
      )
      dummy.scale.set(scale, scale * 1.2, scale * 0.7)
      dummy.updateMatrix()
      mats.push(dummy.matrix.clone())

      const color = new THREE.Color(PALETTE[Math.floor(random() * PALETTE.length)])
      cols.push(color)
    }

    return { matrices: mats, colors: cols }
  }, [])

  useFrame((state) => {
    uniformsRef.current.uTime.value = state.clock.elapsedTime
  })

  return (
    <instancedMesh
      ref={(el) => {
        meshRef.current = el
        if (!el) return
        for (let i = 0; i < FLOWER_COUNT; i++) {
          el.setMatrixAt(i, matrices[i])
          el.setColorAt(i, colors[i])
        }
        el.instanceMatrix.needsUpdate = true
        if (el.instanceColor) el.instanceColor.needsUpdate = true
        if (el.material) el.material.needsUpdate = true
        el.computeBoundingSphere()
      }}
      args={[null, null, FLOWER_COUNT]}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshToonMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={0.25}
      />
    </instancedMesh>
  )
}
