import { useRef, useEffect, useMemo } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import { createToonMaterial, createOutlineMaterial, createContactShadowTexture } from '../lib/toonMaterials'
import useToonShaderSync from '../hooks/useToonShaderSync'
import useCatAnimation from '../hooks/useCatAnimation'
import { useOptionalControls } from '../lib/debugControls'
import { gameState } from '../store'

function applyOriginalMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.userData.__originalMaterial) return
    child.material = child.userData.__originalMaterial
    if (child.userData.__outlineMesh) child.userData.__outlineMesh.visible = false
  })
}

function applyToonMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.userData.__toonMaterial) return
    child.material = child.userData.__toonMaterial
    if (child.userData.__outlineMesh) child.userData.__outlineMesh.visible = true
  })
}

export default function SkateCat({
  trailTargetRef,
  controlsEnabled = true,
  isTransitioning = false,
  useOriginalMaterials = false,
  freezeMotion = false,
  musicRef,
  onJumpSfx,
  shadowMode = 'map',
}) {
  const useShadowMap = shadowMode === 'map'
  const useContactShadow = shadowMode === 'contact'
  const { catRotX, catRotY, catRotZ } = useOptionalControls('Game', {
    Cat: folder({
      catRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
      catRotY: { value: 1.3, min: -Math.PI, max: Math.PI, step: 0.05 },
      catRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  const toonControls = useOptionalControls('Game', {
    'Cat Toon Shader': folder({
      lightX: { value: 4.0, min: -20, max: 20, step: 0.5 },
      lightY: { value: -7.5, min: -20, max: 20, step: 0.5 },
      lightZ: { value: 3.0, min: -20, max: 20, step: 0.5 },
      glossiness: { value: 1, min: 1, max: 100, step: 1 },
      rimAmount: { value: 0.84, min: 0, max: 1, step: 0.01 },
      rimThreshold: { value: 0.28, min: 0, max: 1, step: 0.01 },
      rimColor: '#d7dcff',
      steps: { value: 3, min: 1, max: 8, step: 1 },
      shadowBrightness: { value: 0.20, min: 0, max: 1, step: 0.05 },
      brightness: { value: 1.70, min: 0.5, max: 4, step: 0.05 },
      outlineThickness: { value: 0.04, min: 0, max: 0.15, step: 0.005 },
      outlineColor: '#000000',
    }, { collapsed: true }),
  }, [])

  const blinkControls = useOptionalControls('Game', {
    'Cat Blink': folder({
      leftEyeX: { value: 0.84, min: 0, max: 1, step: 0.005 },
      leftEyeY: { value: 0.60, min: 0, max: 1, step: 0.005 },
      rightEyeX: { value: 0.66, min: 0, max: 1, step: 0.005 },
      rightEyeY: { value: 0.57, min: 0, max: 1, step: 0.005 },
      eyeRadiusX: { value: 0.08, min: 0.005, max: 0.15, step: 0.005 },
      eyeRadiusY: { value: 0.05, min: 0.005, max: 0.15, step: 0.005 },
      lidColor: '#1a1a2e',
      forceClose: false,
    }, { collapsed: true }),
  }, [])

  const blinkState = useRef({ timer: 3, blinking: false, blinkTime: 0, amount: 0, blinksLeft: 0 })

  // --- Refs ---
  const groupRef = useRef()
  const boardRef = useRef()
  const catRef = useRef()
  const grindLightRef = useRef()
  const catModelRef = useRef()
  const contactShadowRef = useRef()
  const contactShadowMaterialRef = useRef()

  // --- Model loading ---
  const skateboard = useGLTF('/skateboard.glb')
  const { scene: catScene } = useGLTF('/maxwell_the_cat_dingus/scene.gltf')
  const paintedBodyMapSource = useTexture('/maxwell_the_cat_dingus/textures/dingus_baseColor_painted-2.jpg')
  const originalBodyMapSource = useTexture('/maxwell_the_cat_dingus/textures/dingus_baseColor.jpeg')

  const paintedBodyMap = useMemo(() => {
    const map = paintedBodyMapSource.clone()
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
    return map
  }, [paintedBodyMapSource])

  const originalBodyMap = useMemo(() => {
    const map = originalBodyMapSource.clone()
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
    return map
  }, [originalBodyMapSource])

  const contactShadowTexture = useMemo(() => {
    if (!useContactShadow || typeof document === 'undefined') return null
    return createContactShadowTexture()
  }, [useContactShadow])

  const skateClone = useMemo(() => {
    const clone = skateboard.scene.clone()
    clone.traverse((child) => {
      if (child.isMesh) child.castShadow = useShadowMap
    })
    return clone
  }, [skateboard, useShadowMap])

  // --- Toon material setup ---
  const catWithToon = useMemo(() => {
    const clone = catScene.clone(true)
    const originals = new Map()
    clone.traverse((child) => {
      if (child.isMesh) originals.set(child, child.material.clone())
    })
    clone.traverse((child) => {
      if (!child.isMesh) return
      const oldMat = originals.get(child)
      if (!oldMat) return
      const mat = createToonMaterial()
      const map = oldMat.name === 'dingus' ? paintedBodyMap : oldMat.map
      if (map) { mat.uniforms.uMap.value = map; mat.uniforms.uHasMap.value = 1.0 }
      if (oldMat.transparent) { mat.transparent = true; mat.uniforms.uAlphaTest.value = 0.5; mat.depthWrite = false }
      if (oldMat.side === THREE.DoubleSide) mat.side = THREE.DoubleSide
      child.castShadow = useShadowMap
      const flatMat = new THREE.MeshBasicMaterial({
        map: oldMat.name === 'dingus' ? originalBodyMap : oldMat.map,
        color: oldMat.color,
        transparent: !!oldMat.transparent,
        alphaTest: oldMat.transparent ? 0.5 : 0,
        side: oldMat.side,
        depthWrite: !oldMat.transparent,
      })
      child.material = flatMat
      child.userData.__originalMaterial = flatMat
      child.userData.__toonMaterial = mat
      if (!oldMat.transparent && child.geometry) {
        const outlineMat = createOutlineMaterial()
        const outlineMesh = new THREE.Mesh(child.geometry, outlineMat)
        outlineMesh.matrixAutoUpdate = false
        outlineMesh.userData.__toonOutline = true
        outlineMesh.visible = false
        child.add(outlineMesh)
        child.userData.__outlineMesh = outlineMesh
      }
    })
    return clone
  }, [catScene, paintedBodyMap, originalBodyMap, useShadowMap])

  // --- Cache mesh refs for per-frame shader sync ---
  const toonMeshesRef = useRef([])
  const outlineMeshesRef = useRef([])
  useEffect(() => {
    const toonMeshes = []
    const outlineMeshes = []
    catWithToon.traverse((child) => {
      if (!child.isMesh || !child.material?.isShaderMaterial) return
      if (child.userData.__toonOutline) {
        outlineMeshes.push(child)
      } else if (child.material.uniforms?.uLightDirection) {
        toonMeshes.push(child)
      }
    })
    toonMeshesRef.current = toonMeshes
    outlineMeshesRef.current = outlineMeshes
  }, [catWithToon])

  // Swap materials based on intro/game mode
  useEffect(() => {
    const fn = useOriginalMaterials ? applyOriginalMaterials : applyToonMaterials
    fn(catWithToon)
  }, [useOriginalMaterials, catWithToon])

  useEffect(() => {
    return () => {
      contactShadowTexture?.dispose()
    }
  }, [contactShadowTexture])

  // --- Hooks ---
  const { introStateRef } = useCatAnimation({
    groupRef, boardRef, catRef, grindLightRef, catModelRef,
    blinkStateRef: blinkState,
    musicRef, controlsEnabled, onJumpSfx,
    catRotX, catRotY, catRotZ,
    isTransitioning,
    freezeMotion,
  })

  useToonShaderSync({
    toonControls, blinkControls,
    toonMeshesRef, outlineMeshesRef,
    useOriginalMaterials,
    introStateRef,
    blinkStateRef: blinkState,
  })

  useFrame(() => {
    if (!useContactShadow || !contactShadowRef.current || !contactShadowMaterialRef.current || !groupRef.current) return

    const shadowHeight = THREE.MathUtils.clamp(gameState.catHeight.current - 0.05, 0, 2.8)
    const leanAmount = Math.min(Math.abs(groupRef.current.rotation.x) + Math.abs(groupRef.current.rotation.z), 0.3)
    const depthStretch = 1 + shadowHeight * 0.32

    contactShadowRef.current.position.set(
      groupRef.current.position.x,
      0.003,
      groupRef.current.position.z + 0.04 + shadowHeight * 0.08
    )
    contactShadowRef.current.scale.set(
      1.35 + shadowHeight * 0.24 + leanAmount * 0.2,
      1.95 * depthStretch + leanAmount * 0.3,
      1
    )
    contactShadowMaterialRef.current.opacity = THREE.MathUtils.clamp(0.42 - shadowHeight * 0.11, 0.16, 0.42)
  })

  // --- Render ---
  return (
    <>
      {useContactShadow && contactShadowTexture && (
        <mesh ref={contactShadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={contactShadowMaterialRef}
            map={contactShadowTexture}
            color="#050301"
            transparent
            opacity={0.42}
            blending={THREE.MultiplyBlending}
            premultipliedAlpha
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}
      <group ref={groupRef} position={[0, 0.05, 0]}>
        <group ref={boardRef}>
          <primitive
            object={skateClone}
            scale={2}
            rotation={[0, Math.PI / 2, 0]}
            position={[0, 0, 0]}
          />
          <pointLight
            ref={grindLightRef}
            position={[0.14, 0.04, 0.38]}
            intensity={0}
            distance={0.01}
            decay={2}
            color="#ffb764"
          />
        </group>
        <group ref={catRef} position={[0, 0.2, 0]}>
          <primitive
            ref={catModelRef}
            object={catWithToon}
            scale={0.03}
            rotation={[catRotX, catRotY, catRotZ]}
          />
        </group>
        <group ref={trailTargetRef} position={[0, 0.2, 1.5]} />
        <pointLight
          position={[0.3, 0.8, 0.3]}
          intensity={3}
          distance={1.2}
          decay={2}
          color="#ffe8cc"
        />
      </group>
    </>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/maxwell_the_cat_dingus/scene.gltf')
