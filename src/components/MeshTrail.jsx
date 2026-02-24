import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TRAIL_LENGTH = 80
const TRAIL_WIDTH = 0.15

export default function MeshTrail({ targetRef }) {
  const meshRef = useRef()

  const { positions, geometry } = useMemo(() => {
    const pos = new Float32Array(TRAIL_LENGTH * 2 * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

    const indices = []
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
      const a = i * 2
      const b = i * 2 + 1
      const c = (i + 1) * 2
      const d = (i + 1) * 2 + 1
      indices.push(a, b, c, b, d, c)
    }
    geo.setIndex(indices)
    return { positions: pos, geometry: geo }
  }, [])

  const points = useRef(
    Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3(0, 0.1, 0))
  )

  const _worldPos = useMemo(() => new THREE.Vector3(), [])
  const _tangent = useMemo(() => new THREE.Vector3(), [])
  const _side = useMemo(() => new THREE.Vector3(), [])
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame(() => {
    if (!targetRef?.current) return

    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
      points.current[i].copy(points.current[i - 1])
    }

    targetRef.current.getWorldPosition(_worldPos)
    _worldPos.z += 0.5
    _worldPos.y = 0.15
    points.current[0].copy(_worldPos)

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const p = points.current[i]
      const next = points.current[Math.min(i + 1, TRAIL_LENGTH - 1)]
      _tangent.subVectors(next, p).normalize()
      _side.crossVectors(_tangent, _up).normalize()

      const fade = 1 - i / TRAIL_LENGTH
      const w = TRAIL_WIDTH * fade

      const idx = i * 2 * 3
      positions[idx] = p.x - _side.x * w
      positions[idx + 1] = p.y - _side.y * w
      positions[idx + 2] = p.z - _side.z * w
      positions[idx + 3] = p.x + _side.x * w
      positions[idx + 4] = p.y + _side.y * w
      positions[idx + 5] = p.z + _side.z * w
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeBoundingSphere()
  })

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial
        color="#FF6B35"
        transparent
        opacity={0.8}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
