import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky as DreiSky, Clouds, Cloud } from '@react-three/drei'
import * as THREE from 'three'

export default function Sky() {
  const cloudsRef = useRef()

  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.02
    }
  })

  return (
    <>
      <DreiSky
        sunPosition={[10, 20, -50]}
        turbidity={0.8}
        rayleigh={1.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      <group ref={cloudsRef}>
        <Clouds material={THREE.MeshBasicMaterial}>
          <Cloud
            segments={40}
            bounds={[50, 10, 50]}
            volume={20}
            color="#ffffff"
            position={[0, 15, -40]}
            opacity={0.5}
          />
        </Clouds>
      </group>
    </>
  )
}
