import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ToonMaxwell from './CustomToonMesh';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#3a3a5c' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <OrbitControls />
        <ToonMaxwell />
      </Canvas>
    </div>
  );
}

export default App;
