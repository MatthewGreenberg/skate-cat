import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const SEGMENT_COUNT = 8
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12
const SPEED = 12

export default function Ground() {
  const groupRefs = useRef([])
  const positions = useRef(
    Array.from({ length: SEGMENT_COUNT }, (_, i) => -i * SEGMENT_LENGTH)
  )

  useFrame((_, delta) => {
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      positions.current[i] += SPEED * delta

      if (positions.current[i] > SEGMENT_LENGTH) {
        const minZ = Math.min(...positions.current)
        positions.current[i] = minZ - SEGMENT_LENGTH
      }

      if (groupRefs.current[i]) {
        groupRefs.current[i].position.z = -positions.current[i]
      }
    }
  })

  return (
    <group>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[0, 0, -positions.current[i]]}
        >
          {/* Green ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[SEGMENT_WIDTH, SEGMENT_LENGTH]} />
            <meshStandardMaterial color="#7EC850" />
          </mesh>
          {/* Tan road strip */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[3, SEGMENT_LENGTH]} />
            <meshStandardMaterial color="#D4A574" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
