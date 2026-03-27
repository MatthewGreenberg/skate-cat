import { useMemo, useRef } from 'react'
import { Sparkles, Text, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import TvScreen from './TvScreen'

function prepareSceneAsset(scene) {
  const root = scene.clone(true)
  root.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone())
    } else if (child.material) {
      child.material = child.material.clone()
    }
  })

  const box = new THREE.Box3().setFromObject(root)
  return {
    root,
    min: box.min.clone(),
    max: box.max.clone(),
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
  }
}

export default function IntroScene({ onStart, disabled = false }) {
  const tvGlowRef = useRef()
  const accentLightRef = useRef()
  const promptRef = useRef()

  const { scene: tvScene } = useGLTF('/intro/vintage_tv.glb')
  const { scene: chairScene } = useGLTF('/intro/sofa_chair.glb')

  const tv = useMemo(() => prepareSceneAsset(tvScene), [tvScene])
  const chair = useMemo(() => prepareSceneAsset(chairScene), [chairScene])

  // --- ALL LEVA CONTROLS ---

  const scene = useControls('Intro', {
    'Scene': folder({
      posX: { value: 0, min: -5, max: 5, step: 0.01 },
      posY: { value: 0, min: -5, max: 5, step: 0.01 },
      posZ: { value: 0, min: -5, max: 5, step: 0.01 },
      rotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      rotY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      rotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    }),
  })

  const room = useControls('Intro', {
    'Room': folder({
      backgroundColor: '#140b12',
      fogColor: '#140b12',
      fogNear: { value: 7, min: 0, max: 30, step: 0.1 },
      fogFar: { value: 14, min: 0, max: 40, step: 0.1 },
      wallColor: '#231720',
      wallPanelColor: '#31202b',
      sideWallColor: '#1d1219',
      floorColor: '#4b3136',
      trimColor: '#ff9347',
      trimEmissiveIntensity: { value: 0.16, min: 0, max: 1, step: 0.01 },
      sideTrimEmissiveIntensity: { value: 0.12, min: 0, max: 1, step: 0.01 },
    }),
  })

  const floorDecor = useControls('Intro', {
    'Floor Decor': folder({
      rugColor: '#6b4d43',
      rugBorderColor: '#e6b982',
      rugStripeColor: '#f0c999',
      shadowColor: '#1b0f18',
      shadowOpacity: { value: 0.34, min: 0, max: 1, step: 0.01 },
      glowColor: '#f59b54',
      glowOpacity: { value: 0.06, min: 0, max: 0.3, step: 0.005 },
      glowRadius: { value: 1.75, min: 0, max: 4, step: 0.05 },
    }),
  })

  const lighting = useControls('Intro', {
    'Lighting': folder({
      ambientIntensity: { value: 0.44, min: 0, max: 2, step: 0.01 },
      ambientColor: '#eadcf4',
      hemiSkyColor: '#8fd5ff',
      hemiGroundColor: '#2a1820',
      hemiIntensity: { value: 0.36, min: 0, max: 2, step: 0.01 },
      dirIntensity: { value: 0.9, min: 0, max: 4, step: 0.01 },
      dirColor: '#ffe4bc',
      dirPosX: { value: 3.4, min: -10, max: 10, step: 0.1 },
      dirPosY: { value: 6.4, min: -10, max: 10, step: 0.1 },
      dirPosZ: { value: 3.8, min: -10, max: 10, step: 0.1 },
      shadowBias: { value: -0.0008, min: -0.01, max: 0.01, step: 0.0001 },
    }),
  })

  const accentLight = useControls('Intro', {
    'Accent Light': folder({
      posX: { value: -1.9, step: 0.01 },
      posY: { value: 1.78, step: 0.01 },
      posZ: { value: 0.52, step: 0.01 },
      intensity: { value: 4.8, min: 0, max: 15, step: 0.1 },
      flickerAmount: { value: 0.45, min: 0, max: 2, step: 0.01 },
      flickerSpeed: { value: 2.6, min: 0, max: 10, step: 0.1 },
      distance: { value: 4.2, min: 0, max: 10, step: 0.1 },
      color: '#ff8b43',
    }),
  })

  const tvModel = useControls('Intro', {
    'TV Model': folder({
      posX: { value: 1.04, step: 0.01 },
      posZ: { value: -1.14, step: 0.01 },
      yaw: { value: -0.15, min: -Math.PI, max: Math.PI, step: 0.01 },
      scale: { value: 0.64, min: 0.1, max: 2, step: 0.01 },
    }),
  })

  const tvScreen = useControls('Intro', {
    'TV Screen': folder({
      posX: { value: -0.4, step: 0.001 },
      posY: { value: 0.08, step: 0.001 },
      posZ: { value: 1.05, step: 0.001 },
      sizeX: { value: 2.25, step: 0.001 },
      sizeY: { value: 1.65, step: 0.001 },
      rotX: { value: -0.05, step: 0.01 },
      rotY: { value: 0, step: 0.01 },
      rotZ: { value: 0, step: 0.01 },
    }),
  })

  const tvGlow = useControls('Intro', {
    'TV Glow': folder({
      enabled: false,
      screenScaleX: { value: 1.06, min: 1, max: 1.4, step: 0.01 },
      screenScaleY: { value: 1.08, min: 1, max: 1.4, step: 0.01 },
      screenOpacity: { value: 0.05, min: 0, max: 0.2, step: 0.005 },
      screenColor: '#64ebff',
      lightIntensity: { value: 3.2, min: 0, max: 12, step: 0.1 },
      lightDistance: { value: 2.8, min: 0, max: 6, step: 0.1 },
      lightColor: '#64ebff',
      lightOffsetX: { value: 0.03, step: 0.01 },
      lightOffsetY: { value: 1.24, step: 0.01 },
      lightOffsetZ: { value: 0.1, step: 0.01 },
      orangeRadius: { value: 0.58, min: 0, max: 1.5, step: 0.01 },
      orangeOpacity: { value: 0.035, min: 0, max: 0.15, step: 0.005 },
      orangeColor: '#ff8b43',
      cyanRadius: { value: 0.4, min: 0, max: 1.2, step: 0.01 },
      cyanOpacity: { value: 0.025, min: 0, max: 0.12, step: 0.005 },
      cyanColor: '#64ebff',
    }),
  })

  const tvStand = useControls('Intro', {
    'TV Stand': folder({
      cabinetWidth: { value: 2.6, min: 0.5, max: 5, step: 0.01 },
      cabinetHeight: { value: 0.44, min: 0.1, max: 1.5, step: 0.01 },
      cabinetDepth: { value: 0.9, min: 0.2, max: 2, step: 0.01 },
      cabinetColor: '#23151d',
      topWidth: { value: 2.76, min: 0.5, max: 5, step: 0.01 },
      topHeight: { value: 0.08, min: 0.01, max: 0.3, step: 0.01 },
      topDepth: { value: 0.98, min: 0.2, max: 2, step: 0.01 },
      topColor: '#4a2a31',
      topMetalness: { value: 0.12, min: 0, max: 1, step: 0.01 },
    }),
  })

  const chairCtrl = useControls('Intro', {
    'Chair': folder({
      posX: { value: -1.78, step: 0.01 },
      posY: { value: 0, step: 0.01 },
      posZ: { value: 0.92, step: 0.01 },
      rotY: { value: 0.42, min: -Math.PI, max: Math.PI, step: 0.01 },
      scale: { value: 0.72, min: 0.1, max: 2, step: 0.01 },
    }),
  })

  const lamp = useControls('Intro', {
    'Floor Lamp': folder({
      posX: { value: -2.12, step: 0.01 },
      posZ: { value: 0.28, step: 0.01 },
      baseColor: '#22141a',
      baseRadius: { value: 0.32, min: 0.1, max: 0.6, step: 0.01 },
      poleColor: '#ffbf79',
      poleMetalness: { value: 0.28, min: 0, max: 1, step: 0.01 },
      poleHeight: { value: 1.56, min: 0.5, max: 3, step: 0.01 },
      shadeColor: '#f4d0a2',
      shadeEmissive: '#ff9e54',
      shadeEmissiveIntensity: { value: 0.18, min: 0, max: 1, step: 0.01 },
      shadeTopRadius: { value: 0.28, min: 0.05, max: 0.6, step: 0.01 },
      shadeBottomRadius: { value: 0.24, min: 0.05, max: 0.6, step: 0.01 },
      shadeHeight: { value: 0.46, min: 0.1, max: 1, step: 0.01 },
    }),
  })

  const prompt = useControls('Intro', {
    'Prompt Text': folder({
      offsetX: { value: -0.02, step: 0.01 },
      offsetY: { value: 1.88, step: 0.01 },
      offsetZ: { value: 0.12, step: 0.01 },
      bobAmount: { value: 0.03, min: 0, max: 0.15, step: 0.005 },
      bobSpeed: { value: 2.4, min: 0, max: 8, step: 0.1 },
      titleSize: { value: 0.16, min: 0.04, max: 0.5, step: 0.01 },
      titleColor: '#fff3da',
      titleOutlineWidth: { value: 0.012, min: 0, max: 0.05, step: 0.001 },
      titleOutlineColor: '#351923',
      subtitleSize: { value: 0.07, min: 0.02, max: 0.2, step: 0.005 },
      subtitleColor: '#8eeaff',
      subtitleOffsetY: { value: -0.2, step: 0.01 },
      arrowColor: '#ff9a5c',
      arrowOffsetY: { value: -0.37, step: 0.01 },
      arrowSize: { value: 0.06, min: 0.01, max: 0.2, step: 0.005 },
      arrowHeight: { value: 0.14, min: 0.03, max: 0.4, step: 0.005 },
    }),
  })

  const sparkles = useControls('Intro', {
    'Sparkles': folder({
      count: { value: 8, min: 0, max: 50, step: 1 },
      scaleX: { value: 2.1, min: 0, max: 6, step: 0.1 },
      scaleY: { value: 1.35, min: 0, max: 6, step: 0.1 },
      scaleZ: { value: 1.8, min: 0, max: 6, step: 0.1 },
      offsetY: { value: 1.18, step: 0.01 },
      offsetZ: { value: -0.04, step: 0.01 },
      size: { value: 3, min: 0, max: 10, step: 0.5 },
      speed: { value: 0.2, min: 0, max: 2, step: 0.05 },
      opacity: { value: 0.1, min: 0, max: 1, step: 0.01 },
      color: '#64ebff',
    }),
  })

  // --- DERIVED VALUES ---

  const tvFloorY = 0.5 - tv.min.y * tvModel.scale
  const chairFloorY = -chair.min.y * chairCtrl.scale

  // --- ANIMATION ---

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (tvGlowRef.current) {
      tvGlowRef.current.intensity = tvGlow.enabled
        ? tvGlow.lightIntensity + Math.sin(t * 6.4) * 0.35 + Math.sin(t * 13.5) * 0.15
        : 0
    }
    if (accentLightRef.current) {
      accentLightRef.current.intensity = accentLight.intensity + Math.sin(t * accentLight.flickerSpeed) * accentLight.flickerAmount
    }
    if (promptRef.current) {
      promptRef.current.position.y = prompt.offsetY + Math.sin(t * prompt.bobSpeed) * prompt.bobAmount
    }
  })

  return (
    <>
      <color attach="background" args={[room.backgroundColor]} />
      <fog attach="fog" args={[room.fogColor, room.fogNear, room.fogFar]} />
      <group
        position={[scene.posX, scene.posY, scene.posZ]}
        rotation={[scene.rotX, scene.rotY, scene.rotZ]}
      >
        {/* Lighting */}
        <ambientLight intensity={lighting.ambientIntensity} color={lighting.ambientColor} />
        <hemisphereLight args={[lighting.hemiSkyColor, lighting.hemiGroundColor, lighting.hemiIntensity]} />
        <directionalLight
          position={[lighting.dirPosX, lighting.dirPosY, lighting.dirPosZ]}
          intensity={lighting.dirIntensity}
          color={lighting.dirColor}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-camera-near={0.5}
          shadow-camera-far={16}
          shadow-bias={lighting.shadowBias}
        />
        <pointLight
          ref={tvGlowRef}
          position={[tvModel.posX + tvGlow.lightOffsetX, tvGlow.lightOffsetY, tvModel.posZ + tvGlow.lightOffsetZ]}
          intensity={0}
          distance={tvGlow.lightDistance}
          decay={2}
          color={tvGlow.lightColor}
        />
        <pointLight
          ref={accentLightRef}
          position={[accentLight.posX, accentLight.posY, accentLight.posZ]}
          intensity={accentLight.intensity}
          distance={accentLight.distance}
          decay={2}
          color={accentLight.color}
        />

        {/* Back wall */}
        <mesh position={[0, 1.72, -3.35]} receiveShadow>
          <planeGeometry args={[7.8, 4.6]} />
          <meshStandardMaterial color={room.wallColor} roughness={0.95} />
        </mesh>
        {/* Side wall */}
        <mesh position={[-3.16, 1.65, -0.2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[6.7, 4.5]} />
          <meshStandardMaterial color={room.sideWallColor} roughness={0.95} />
        </mesh>
        {/* Wall panel */}
        <mesh position={[0.05, 1.64, -3.28]} receiveShadow>
          <planeGeometry args={[5.5, 2.9]} />
          <meshStandardMaterial color={room.wallPanelColor} roughness={0.88} metalness={0.04} />
        </mesh>
        {/* Back trim */}
        <mesh position={[0.02, 0.98, -3.24]}>
          <boxGeometry args={[5.7, 0.08, 0.08]} />
          <meshStandardMaterial color={room.trimColor} emissive={room.trimColor} emissiveIntensity={room.trimEmissiveIntensity} roughness={0.45} />
        </mesh>
        {/* Side trim */}
        <mesh position={[-3.08, 0.98, -0.04]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[6.6, 0.08, 0.08]} />
          <meshStandardMaterial color={room.trimColor} emissive={room.trimColor} emissiveIntensity={room.sideTrimEmissiveIntensity} roughness={0.5} />
        </mesh>

        {/* Wall glow patches */}
        {tvGlow.enabled && (
          <>
            <mesh position={[tvModel.posX + 0.08, 1.4, -3.22]}>
              <circleGeometry args={[tvGlow.orangeRadius, 64]} />
              <meshBasicMaterial
                color={tvGlow.orangeColor}
                toneMapped={false}
                transparent
                opacity={tvGlow.orangeOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh position={[tvModel.posX, 1.16, -3.2]}>
              <circleGeometry args={[tvGlow.cyanRadius, 64]} />
              <meshBasicMaterial
                color={tvGlow.cyanColor}
                toneMapped={false}
                transparent
                opacity={tvGlow.cyanOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </>
        )}

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color={room.floorColor} roughness={0.92} metalness={0.03} />
        </mesh>
        {/* Rug border */}
        <mesh rotation={[-Math.PI / 2, 0.03, 0]} position={[-0.15, 0.012, -0.06]} receiveShadow>
          <planeGeometry args={[4.7, 2.85]} />
          <meshStandardMaterial color={floorDecor.rugBorderColor} roughness={0.95} />
        </mesh>
        {/* Rug */}
        <mesh rotation={[-Math.PI / 2, 0.03, 0]} position={[-0.15, 0.016, -0.06]} receiveShadow>
          <planeGeometry args={[4.34, 2.5]} />
          <meshStandardMaterial color={floorDecor.rugColor} roughness={0.97} />
        </mesh>
        {/* Rug stripes */}
        {[-1.45, -0.45, 0.55, 1.55].map((x) => (
          <mesh key={x} rotation={[-Math.PI / 2, 0.03, 0]} position={[x - 0.15, 0.018, -0.06]} receiveShadow>
            <planeGeometry args={[0.12, 2.34]} />
            <meshStandardMaterial color={floorDecor.rugStripeColor} roughness={0.88} />
          </mesh>
        ))}
        {/* Floor shadow */}
        <mesh rotation={[-Math.PI / 2, 0.04, 0]} position={[0.08, 0.01, 0.26]}>
          <planeGeometry args={[4.6, 2.3]} />
          <meshBasicMaterial color={floorDecor.shadowColor} transparent opacity={floorDecor.shadowOpacity} depthWrite={false} />
        </mesh>
        {/* Floor glow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.22, 0.02, -0.28]}>
          <circleGeometry args={[floorDecor.glowRadius, 64]} />
          <meshBasicMaterial
            color={floorDecor.glowColor}
            toneMapped={false}
            transparent
            opacity={floorDecor.glowOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Floor Lamp */}
        <group position={[lamp.posX, 0, lamp.posZ]}>
          <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[lamp.baseRadius - 0.04, lamp.baseRadius, 0.08, 32]} />
            <meshStandardMaterial color={lamp.baseColor} roughness={0.82} />
          </mesh>
          <mesh position={[0, lamp.poleHeight / 2 + 0.06, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.03, 0.04, lamp.poleHeight, 20]} />
            <meshStandardMaterial color={lamp.poleColor} metalness={lamp.poleMetalness} roughness={0.36} />
          </mesh>
          <mesh position={[0, lamp.poleHeight + 0.06 - lamp.shadeHeight / 2 + 0.18, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[lamp.shadeTopRadius, lamp.shadeBottomRadius, lamp.shadeHeight, 24]} />
            <meshStandardMaterial color={lamp.shadeColor} emissive={lamp.shadeEmissive} emissiveIntensity={lamp.shadeEmissiveIntensity} roughness={0.5} />
          </mesh>
        </group>

        {/* TV + Screen */}
        <group position={[tvModel.posX, tvFloorY, tvModel.posZ]} rotation={[0, tvModel.yaw, 0]} scale={tvModel.scale}>
          <primitive object={tv.root} />
          <TvScreen
            position={[tvScreen.posX, tvScreen.posY, tvScreen.posZ]}
            rotation={[tvScreen.rotX, tvScreen.rotY, tvScreen.rotZ]}
            size={[tvScreen.sizeX, tvScreen.sizeY]}
            showGlow={tvGlow.enabled}
            glowScale={[tvGlow.screenScaleX, tvGlow.screenScaleY]}
            glowOpacity={tvGlow.screenOpacity}
            glowColor={tvGlow.screenColor}
            onStart={onStart}
            disabled={disabled}
          />
        </group>

        {/* Floating prompt */}
        <group ref={promptRef} position={[tvModel.posX + prompt.offsetX, prompt.offsetY, tvModel.posZ + prompt.offsetZ]} rotation={[0, tvModel.yaw, 0]}>
          <Text
            fontSize={prompt.titleSize}
            color={prompt.titleColor}
            outlineWidth={prompt.titleOutlineWidth}
            outlineColor={prompt.titleOutlineColor}
            anchorX="center"
            anchorY="middle"
          >
            PRESS START
          </Text>
          <Text
            position={[0, prompt.subtitleOffsetY, 0]}
            fontSize={prompt.subtitleSize}
            color={prompt.subtitleColor}
            outlineWidth={0.008}
            outlineColor="#24131d"
            anchorX="center"
            anchorY="middle"
          >
            Click the TV or press Enter
          </Text>
          <mesh position={[0, prompt.arrowOffsetY, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[prompt.arrowSize, prompt.arrowHeight, 3]} />
            <meshBasicMaterial color={prompt.arrowColor} toneMapped={false} />
          </mesh>
        </group>

        {/* TV Stand */}
        <mesh position={[tvModel.posX, tvStand.cabinetHeight / 2, tvModel.posZ]} rotation={[0, tvModel.yaw, 0]} castShadow receiveShadow>
          <boxGeometry args={[tvStand.cabinetWidth, tvStand.cabinetHeight, tvStand.cabinetDepth]} />
          <meshStandardMaterial color={tvStand.cabinetColor} roughness={0.7} metalness={0.08} />
        </mesh>
        <mesh position={[tvModel.posX, tvStand.cabinetHeight + tvStand.topHeight / 2, tvModel.posZ]} rotation={[0, tvModel.yaw, 0]} castShadow receiveShadow>
          <boxGeometry args={[tvStand.topWidth, tvStand.topHeight, tvStand.topDepth]} />
          <meshStandardMaterial color={tvStand.topColor} roughness={0.45} metalness={tvStand.topMetalness} />
        </mesh>

        {/* Chair */}
        <group position={[chairCtrl.posX, chairFloorY + chairCtrl.posY, chairCtrl.posZ]} rotation={[0, chairCtrl.rotY, 0]} scale={chairCtrl.scale}>
          <primitive object={chair.root} />
        </group>

        {/* Sparkles */}
        <Sparkles
          count={sparkles.count}
          scale={[sparkles.scaleX, sparkles.scaleY, sparkles.scaleZ]}
          position={[tvModel.posX, sparkles.offsetY, tvModel.posZ + sparkles.offsetZ]}
          size={sparkles.size}
          speed={sparkles.speed}
          opacity={sparkles.opacity}
          color={sparkles.color}
        />
      </group>
    </>
  )
}

useGLTF.preload('/intro/vintage_tv.glb')
useGLTF.preload('/intro/sofa_chair.glb')
