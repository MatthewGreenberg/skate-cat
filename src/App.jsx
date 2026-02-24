import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import Sky from './components/Sky'
import Ground from './components/Ground'
import SkateCat from './components/SkateCat'
import MeshTrail from './components/MeshTrail'
import CameraRig from './components/CameraRig'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

export default function App() {
  const trailTarget = useRef()

  return (
    <Canvas
      style={{ width: '100vw', height: '100vh' }}
    >
      <CameraRig />
      <Sky />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <Ground />
      <SkateCat trailTargetRef={trailTarget} />
      <MeshTrail targetRef={trailTarget} />
      <EffectComposer>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.3}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <Vignette offset={0.3} darkness={0.4} />
      </EffectComposer>
    </Canvas>
  )
}
