import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'

export default function SkateCat({ trailTargetRef }) {
  const groupRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const cat = useGLTF('/cat/scene.gltf')

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.03
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 2) * 0.02
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive
        object={skateboard.scene.clone()}
        scale={0.5}
        position={[0, 0, 0]}
      />
      <primitive
        object={cat.scene.clone()}
        scale={0.4}
        position={[0, 0.15, 0]}
      />
      {/* Trail attachment point at back of skateboard */}
      <group ref={trailTargetRef} position={[0, 0.1, 0.5]} />
    </group>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/cat/scene.gltf')
