import { useMemo } from 'react'
import { useGLTF, Clone } from '@react-three/drei'
import { useControls } from 'leva'

const SEGMENT_LENGTH = 20

export default function Trees() {
  const { scene } = useGLTF('/low_poly_pine.glb')

  const { count, treeScale, spread, minDistance } = useControls('Trees', {
    count: { value: 6, min: 1, max: 20, step: 1 },
    treeScale: { value: 1.2, min: 0.1, max: 5, step: 0.1 },
    spread: { value: 3, min: 1, max: 8, step: 0.5 },
    minDistance: { value: 5, min: 3, max: 10, step: 0.5 },
  })

  const placements = useMemo(() => {
    const trees = []
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const x = side * (minDistance + Math.random() * spread)
      const z = (Math.random() - 0.5) * SEGMENT_LENGTH
      const scale = treeScale * (0.7 + Math.random() * 0.6)
      const rotY = Math.random() * Math.PI * 2
      trees.push({ x, z, scale, rotY })
    }
    return trees
  }, [count, treeScale, spread, minDistance])

  return (
    <group>
      {placements.map((t, i) => (
        <Clone
          key={i}
          object={scene}
          position={[t.x, 0, t.z]}
          scale={t.scale}
          rotation={[0, t.rotY, 0]}
        />
      ))}
    </group>
  )
}

useGLTF.preload('/low_poly_pine.glb')
