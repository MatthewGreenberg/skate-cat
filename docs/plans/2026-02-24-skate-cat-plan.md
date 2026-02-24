# Skate Cat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an endless-runner visual diorama with a cat on a skateboard — cartoony style, glowing mesh trail, bloom post-processing.

**Architecture:** R3F Canvas with object-pooled ground segments scrolling toward camera. Cat+skateboard GLB models parented together with bobbing animation. Ribbon mesh trail behind skateboard updated per frame. Bloom post-processing for glow.

**Tech Stack:** React, @react-three/fiber, @react-three/drei, @react-three/postprocessing, three

---

### Task 1: Install Dependencies & Clean Boilerplate

**Files:**
- Modify: `package.json`
- Modify: `src/App.jsx`
- Modify: `src/main.jsx`
- Delete: `src/App.css` (unused)

**Step 1: Install R3F dependencies**

Run: `npm install three @react-three/fiber @react-three/drei @react-three/postprocessing`

**Step 2: Clean App.jsx to empty shell**

Replace `src/App.jsx` with:

```jsx
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
```

**Step 3: Clean main.jsx — remove CSS import if referencing App.css**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 4: Update index.css for fullscreen**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { width: 100%; height: 100%; overflow: hidden; }
```

**Step 5: Verify it runs**

Run: `npm run build`
Expected: Builds successfully.

**Step 6: Commit**

```bash
git init && git add -A && git commit -m "feat: scaffold R3F canvas with dependencies"
```

---

### Task 2: Sky Background

**Files:**
- Create: `src/components/Sky.jsx`
- Modify: `src/App.jsx`

**Step 1: Create Sky component**

```jsx
// src/components/Sky.jsx
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect } from 'react'

export default function Sky() {
  const { scene } = useThree()

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, '#4A90D9')   // top: bright blue
    gradient.addColorStop(0.6, '#87CEEB') // mid: sky blue
    gradient.addColorStop(1, '#E8F4F8')   // horizon: pale
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1, 256)
    const texture = new THREE.CanvasTexture(canvas)
    texture.mapping = THREE.EquirectangularReflectionMapping
    scene.background = texture
    return () => { texture.dispose() }
  }, [scene])

  return null
}
```

**Step 2: Add Sky to App.jsx**

Add `<Sky />` inside `<Canvas>`. Remove the inline `background` style from Canvas.

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/Sky.jsx src/App.jsx && git commit -m "feat: add gradient sky background"
```

---

### Task 3: Ground with Object Pooling

**Files:**
- Create: `src/components/Ground.jsx`
- Modify: `src/App.jsx`

**Step 1: Create Ground component**

```jsx
// src/components/Ground.jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

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

      // recycle segment that passed behind camera
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
```

**Step 2: Add Ground to App.jsx, remove placeholder box**

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/Ground.jsx src/App.jsx && git commit -m "feat: add object-pooled scrolling ground"
```

---

### Task 4: Cat + Skateboard Models

**Files:**
- Create: `src/components/SkateCat.jsx`
- Modify: `src/App.jsx`

**Step 1: Create SkateCat component**

```jsx
// src/components/SkateCat.jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'

export default function SkateCat() {
  const groupRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const cat = useGLTF('/cat/scene.gltf')

  useFrame((state) => {
    if (groupRef.current) {
      // gentle bobbing
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.03
      // subtle forward-back rock
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 2) * 0.02
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Skateboard */}
      <primitive
        object={skateboard.scene.clone()}
        scale={0.5}
        position={[0, 0, 0]}
      />
      {/* Cat sitting on board — adjust Y to sit on top */}
      <primitive
        object={cat.scene.clone()}
        scale={0.4}
        position={[0, 0.15, 0]}
      />
    </group>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/cat/scene.gltf')
```

NOTE: Scale and position values are initial guesses. The implementing agent should adjust after visual inspection to make the cat sit properly on the skateboard. Check by running `npm run dev` if needed, or adjust based on model bounding boxes.

**Step 2: Add SkateCat to App.jsx**

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/SkateCat.jsx src/App.jsx && git commit -m "feat: add cat and skateboard models"
```

---

### Task 5: Camera Rig

**Files:**
- Create: `src/components/CameraRig.jsx`
- Modify: `src/App.jsx`

**Step 1: Create CameraRig**

```jsx
// src/components/CameraRig.jsx
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

const CAMERA_OFFSET = new THREE.Vector3(2.5, 0.8, 3)
const LOOK_AT = new THREE.Vector3(0, 0.3, -2)

export default function CameraRig() {
  const { camera } = useThree()
  const initialized = useRef(false)

  useFrame(() => {
    if (!initialized.current) {
      camera.position.copy(CAMERA_OFFSET)
      camera.lookAt(LOOK_AT)
      initialized.current = true
    }
    // Camera stays fixed — world moves toward us
    camera.lookAt(LOOK_AT)
  })

  return null
}
```

**Step 2: Add CameraRig to App.jsx. Remove the `camera` prop from Canvas (let CameraRig handle it).**

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/CameraRig.jsx src/App.jsx && git commit -m "feat: add low cinematic camera rig"
```

---

### Task 6: Mesh Trail

**Files:**
- Create: `src/components/MeshTrail.jsx`
- Modify: `src/App.jsx`

**Step 1: Create MeshTrail**

```jsx
// src/components/MeshTrail.jsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TRAIL_LENGTH = 80
const TRAIL_WIDTH = 0.15

export default function MeshTrail({ targetRef }) {
  const meshRef = useRef()

  const { positions, geometry } = useMemo(() => {
    const pos = new Float32Array(TRAIL_LENGTH * 2 * 3) // 2 verts per point (left+right)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

    // build index for triangle strip
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

  useFrame(() => {
    if (!targetRef?.current) return

    // shift points back
    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
      points.current[i].copy(points.current[i - 1])
    }

    // new point at target world position
    const worldPos = new THREE.Vector3()
    targetRef.current.getWorldPosition(worldPos)
    // offset slightly behind and low for tail-light feel
    worldPos.z += 0.5
    worldPos.y = 0.15
    points.current[0].copy(worldPos)

    // build ribbon vertices
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const p = points.current[i]
      const next = points.current[Math.min(i + 1, TRAIL_LENGTH - 1)]
      const tangent = new THREE.Vector3().subVectors(next, p).normalize()
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize()

      const fade = 1 - i / TRAIL_LENGTH
      const w = TRAIL_WIDTH * fade

      const idx = i * 2 * 3
      positions[idx] = p.x - side.x * w
      positions[idx + 1] = p.y - side.y * w
      positions[idx + 2] = p.z - side.z * w
      positions[idx + 3] = p.x + side.x * w
      positions[idx + 4] = p.y + side.y * w
      positions[idx + 5] = p.z + side.z * w
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
```

**Step 2: In SkateCat, expose a ref for the trail attachment point. Add a `<group ref={trailTargetRef}>` positioned at the back of the skateboard. Pass it up via a callback prop or use a shared ref.**

The simplest approach: In App.jsx, create a ref and pass it to both SkateCat (to set) and MeshTrail (to read).

Update SkateCat to accept a `trailTargetRef` prop and attach it to a small invisible group at the skateboard tail:

```jsx
// Inside SkateCat's return, add:
<group ref={trailTargetRef} position={[0, 0.1, 0.5]} />
```

Update App.jsx:
```jsx
const trailTarget = useRef()
// ...
<SkateCat trailTargetRef={trailTarget} />
<MeshTrail targetRef={trailTarget} />
```

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/MeshTrail.jsx src/components/SkateCat.jsx src/App.jsx && git commit -m "feat: add glowing mesh trail behind skateboard"
```

---

### Task 7: Post-Processing (Bloom + Vignette)

**Files:**
- Modify: `src/App.jsx`

**Step 1: Add post-processing to App.jsx**

```jsx
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

// Inside Canvas, after all scene components:
<EffectComposer>
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.3}
    luminanceSmoothing={0.9}
    mipmapBlur
  />
  <Vignette offset={0.3} darkness={0.4} />
</EffectComposer>
```

**Step 2: Verify**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/App.jsx && git commit -m "feat: add bloom and vignette post-processing"
```

---

### Task 8: Final Polish & Cleanup

**Files:**
- Modify: `src/App.jsx` — final lighting tweaks
- Delete: `src/assets/react.svg` (unused)

**Step 1: Tune lighting for cartoony feel**

Ensure App.jsx has:
- `ambientLight` intensity ~0.7 (bright, soft shadows)
- `directionalLight` position high and to the side, intensity ~1.2
- Optional: add a subtle hemisphere light for color fill: `<hemisphereLight args={['#87CEEB', '#7EC850', 0.4]} />`

**Step 2: Clean up unused files**

Delete `src/assets/react.svg`, `src/App.css`, `public/vite.svg` if still present.

**Step 3: Final build check**

Run: `npm run build`
Expected: Clean build, no warnings.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: final polish — lighting, cleanup"
```
