import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import Sky from './components/Sky'
import Ground from './components/Ground'
import SkateCat from './components/SkateCat'
import CameraRig from './components/CameraRig'

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
    </Canvas>
  )
}
