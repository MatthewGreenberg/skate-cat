import { Canvas } from '@react-three/fiber'

export default function App() {
  return (
    <Canvas
      camera={{ position: [2, 1, 4], fov: 50 }}
      style={{ width: '100vw', height: '100vh', background: '#87CEEB' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  )
}
