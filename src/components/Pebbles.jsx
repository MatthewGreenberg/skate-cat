import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const PEBBLE_COUNT = 50
const ROAD_HALF = 1.5
const SEGMENT_WIDTH = 12
const SEGMENT_LENGTH = 20

function mulberry32(seed) {
  let t = seed
  return function random() {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export default function Pebbles({ segmentSeed = 0 }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const { transforms, colors } = useMemo(() => {
    const random = mulberry32(segmentSeed + 1)
    const generated = []
    const generatedColors = []

    for (let i = 0; i < PEBBLE_COUNT; i++) {
      const onRoad = false
      let x
      if (onRoad) {
        // Keep road pebbles subtle and inside the strip.
        x = (random() - 0.5) * (ROAD_HALF * 1.7)
      } else {
        const onLeftSide = random() < 0.5
        const sideMin = ROAD_HALF + 0.15
        const sideMax = SEGMENT_WIDTH / 2 - 0.2
        const xMag = sideMin + random() * (sideMax - sideMin)
        x = onLeftSide ? -xMag : xMag
      }
      const z = (random() - 0.5) * SEGMENT_LENGTH
      const y = onRoad ? 0.006 + random() * 0.018 : 0.012 + random() * 0.03

      const sizeScale = onRoad ? 0.6 : 0.8
      const sx = (0.02 + random() * 0.03) * sizeScale
      const sy = (0.012 + random() * 0.015) * sizeScale
      const sz = (0.02 + random() * 0.03) * sizeScale

      dummy.position.set(x, y, z)
      dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()

      generated.push(dummy.matrix.clone())

      const pebbleColor = new THREE.Color().setHSL(
        0.085 + random() * 0.03,
        0.08 + random() * 0.12,
        (onRoad ? 0.6 : 0.52) + random() * 0.18
      )
      generatedColors.push(pebbleColor)
    }

    return { transforms: generated, colors: generatedColors }
  }, [segmentSeed, dummy])

  return (
    <instancedMesh
      ref={(el) => {
        meshRef.current = el
        if (!el) return
        for (let i = 0; i < PEBBLE_COUNT; i++) {
          el.setMatrixAt(i, transforms[i])
          el.setColorAt(i, colors[i])
        }
        el.instanceMatrix.needsUpdate = true
        if (el.instanceColor) el.instanceColor.needsUpdate = true
        el.computeBoundingSphere()
      }}
      args={[null, null, PEBBLE_COUNT]}
      receiveShadow
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshToonMaterial
        vertexColors
        color="#ffffff"
      />
    </instancedMesh>
  )
}
