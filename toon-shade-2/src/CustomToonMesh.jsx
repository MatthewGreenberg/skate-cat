import { useEffect, useMemo } from 'react';
import { extend } from '@react-three/fiber';
import { shaderMaterial, useGLTF, useTexture } from '@react-three/drei';
import { useControls, folder } from 'leva';
import * as THREE from 'three';

const ToonShaderMaterial = shaderMaterial(
  {
    uColor: new THREE.Color('#ffffff'),
    uLightDirection: new THREE.Vector3(0, 5, 15),
    uGlossiness: 40.0,
    uRimAmount: 0.6,
    uRimThreshold: 0.2,
    uSteps: 4.0,
    uShadowBrightness: 0.3,
    uBrightness: 2.5,
    uRimColor: new THREE.Color('#ffffff'),
    uMap: null,
    uHasMap: 0.0,
    uAlphaTest: 0.0,
  },
  `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  
  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * viewPosition;
  }
  `,
  `
  uniform vec3 uColor;
  uniform vec3 uLightDirection;
  uniform float uGlossiness;
  uniform float uRimAmount;
  uniform float uRimThreshold;
  uniform float uSteps;
  uniform float uShadowBrightness;
  uniform float uBrightness;
  uniform vec3 uRimColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uAlphaTest;
  
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  
  void main() {
    vec4 texColor = vec4(1.0);
    if (uHasMap > 0.5) {
      texColor = texture2D(uMap, vUv);
    }
    if (texColor.a < uAlphaTest) discard;
  
    vec3 baseColor = uColor * pow(texColor.rgb, vec3(1.0 / uBrightness));
  
    float NdotL = dot(vNormal, normalize(uLightDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uSteps) / uSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);
  
    vec3 halfVector = normalize(normalize(uLightDirection) + vViewDir);
    float NdotH = dot(vNormal, halfVector);
    float specularIntensity = pow(max(NdotH, 0.0) * max(NdotL, 0.0), 1000.0 / uGlossiness);
    float specular = smoothstep(0.05, 0.1, specularIntensity);
  
    float rimDot = 1.0 - dot(vViewDir, vNormal);
    float rimIntensity = rimDot * pow(max(NdotL, 0.0), uRimThreshold);
    rimIntensity = smoothstep(uRimAmount - 0.01, uRimAmount + 0.01, rimIntensity);
  
    vec3 finalColor = baseColor * lightIntensity + specular * vec3(0.06) + rimIntensity * uRimColor;
    gl_FragColor = vec4(finalColor, texColor.a);
  }
  `
);

const OutlineMaterial = shaderMaterial(
  { uOutlineColor: new THREE.Color('#111122'), uThickness: 0.04 },
  `uniform float uThickness; void main() { vec3 pos = position + normal * uThickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); }`,
  `uniform vec3 uOutlineColor; void main() { gl_FragColor = vec4(uOutlineColor, 1.0); }`
);

extend({ ToonShaderMaterial, OutlineMaterial });
const originalMaterialsCache = new WeakMap();

function captureOriginalMaterials(scene) {
  if (originalMaterialsCache.has(scene)) return originalMaterialsCache.get(scene);
  const originals = new Map();
  scene.traverse((child) => {
    if (child.isMesh) originals.set(child, child.material.clone());
  });
  originalMaterialsCache.set(scene, originals);
  return originals;
}

export default function ToonMaxwell() {
  const { scene } = useGLTF('/maxwell_the_cat_dingus/scene.gltf');
  const paintedBodyMap = useTexture('/maxwell_the_cat_dingus/textures/dingus_baseColor_painted-2.jpg');

  paintedBodyMap.flipY = false;
  paintedBodyMap.colorSpace = THREE.SRGBColorSpace;
  // Make sure the texture wraps so shifting UVs doesn't break edges
  paintedBodyMap.wrapS = THREE.RepeatWrapping;
  paintedBodyMap.wrapT = THREE.RepeatWrapping;

  const { center, scale } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { center: c, scale: 3 / Math.max(size.x, size.y, size.z) };
  }, [scene]);

  const { toonMeshes, outlineMeshes } = useMemo(() => {
    const originals = captureOriginalMaterials(scene);
    const toon = [];
    const outlines = [];

    const toRemove = [];
    scene.traverse((child) => {
      if (child.userData.__toonOutline) toRemove.push(child);
      // Optional: Log all mesh names to the console to help you find the exact name of the eyes!
      if (child.isMesh) console.log("Mesh Name:", child.name);
    });
    toRemove.forEach((child) => child.parent?.remove(child));

    scene.traverse((child) => {
      if (!child.isMesh || child.userData.__toonOutline) return;
      const oldMat = originals.get(child);
      if (!oldMat) return;

      const mat = new ToonShaderMaterial();
      const map = oldMat.name === 'dingus' ? paintedBodyMap : oldMat.map;
      if (map) { mat.uMap = map; mat.uHasMap = 1.0; }
      if (oldMat.transparent) { mat.transparent = true; mat.uAlphaTest = 0.5; mat.depthWrite = false; }
      if (oldMat.side === THREE.DoubleSide) mat.side = THREE.DoubleSide;
      child.material = mat;
      toon.push({ material: mat });

      if (!oldMat.transparent && child.geometry) {
        const outlineMat = new OutlineMaterial();
        outlineMat.side = THREE.BackSide;
        const outlineMesh = new THREE.Mesh(child.geometry, outlineMat);
        outlineMesh.matrixAutoUpdate = false;
        outlineMesh.userData.__toonOutline = true;
        child.add(outlineMesh);
        outlines.push({ material: outlineMat });
      }
    });

    return { toonMeshes: toon, outlineMeshes: outlines };
  }, [scene, paintedBodyMap]);

  // NEW: Controls specifically for targeting the Cat's eyes
  const {
    tintColor, brightness, glossiness, rimAmount, rimThreshold, rimColor,
    steps, shadowBrightness, outlineThickness, outlineColor,
    lightX, lightY, lightZ,

    // De-structure new Eye Mesh offsets
    eyeOffsetX, eyeOffsetY, eyeOffsetZ, eyeScale,

    // De-structure new Texture UV offsets
    uvOffsetX, uvOffsetY
  } = useControls('Toon Shader', {
    tintColor: '#ffffff',
    brightness: { value: 1.85, min: 0.5, max: 5 },

    // 1. SHIFT THE EYE MESHES DIRECTLY
    'Cat Eyes (Mesh)': folder({
      eyeOffsetX: { value: 0, min: -2, max: 2, step: 0.001 },
      eyeOffsetY: { value: 0, min: -2, max: 2, step: 0.001 },
      eyeOffsetZ: { value: 0, min: -2, max: 2, step: 0.001 },
      eyeScale: { value: 1, min: 0.1, max: 3, step: 0.01 },
    }),

    // 2. SHIFT THE TEXTURE (if the eyes are painted onto the main texture)
    'Cat Eyes (Texture UV)': folder({
      uvOffsetX: { value: 0, min: -1, max: 1, step: 0.001 },
      uvOffsetY: { value: 0, min: -1, max: 1, step: 0.001 },
    }),

    Shading: folder({
      steps: { value: 4, min: 2, max: 10, step: 1 },
      shadowBrightness: { value: 0.5, min: 0, max: 1 },
      glossiness: { value: 12, min: 1, max: 100 },
    }),
    Rim: folder({
      rimAmount: { value: 0.84, min: 0, max: 1 },
      rimThreshold: { value: 0.35, min: 0, max: 1 },
      rimColor: '#d7dcff',
    }),
    Outline: folder({
      outlineThickness: { value: 0.04, min: 0, max: 0.1 },
      outlineColor: '#090b16',
    }),
    Light: folder({
      lightX: { value: 0, min: -20, max: 20 },
      lightY: { value: 5, min: -20, max: 20 },
      lightZ: { value: 15, min: -20, max: 20 },
    }),
  });

  // Effect: Shift the Texture Map UVs
  useEffect(() => {
    if (paintedBodyMap) {
      paintedBodyMap.offset.set(uvOffsetX, uvOffsetY);
      paintedBodyMap.needsUpdate = true;
    }
  }, [paintedBodyMap, uvOffsetX, uvOffsetY]);

  // Effect: Physically move the eye meshes on the 3D model
  const originalEyeTransforms = useMemo(() => new Map(), []);

  useEffect(() => {
    scene.traverse((child) => {
      // Look for meshes named "eye", "eyes", "pupil", etc.
      // Note: If your model names the eyes something weird like "Object_4", 
      // you will need to change this check to: child.name === 'Object_4'
      const name = child.name.toLowerCase();
      if (child.isMesh && (name.includes('eye') || name.includes('pupil'))) {

        // Cache original position so we apply offsets correctly on slider move
        if (!originalEyeTransforms.has(child.uuid)) {
          originalEyeTransforms.set(child.uuid, {
            pos: child.position.clone(),
            scale: child.scale.clone()
          });
        }

        const orig = originalEyeTransforms.get(child.uuid);

        // Apply Leva overrides to position and scale!
        child.position.set(
          orig.pos.x + eyeOffsetX,
          orig.pos.y + eyeOffsetY,
          orig.pos.z + eyeOffsetZ
        );
        child.scale.set(
          orig.scale.x * eyeScale,
          orig.scale.y * eyeScale,
          orig.scale.z * eyeScale
        );
      }
    });
  }, [scene, eyeOffsetX, eyeOffsetY, eyeOffsetZ, eyeScale, originalEyeTransforms]);

  // General Shader Sync
  useEffect(() => {
    const color = new THREE.Color(tintColor);
    const rim = new THREE.Color(rimColor);
    const dir = new THREE.Vector3(lightX, lightY, lightZ);
    for (const { material: m } of toonMeshes) {
      m.uColor = color; m.uBrightness = brightness; m.uGlossiness = glossiness;
      m.uRimAmount = rimAmount; m.uRimThreshold = rimThreshold; m.uRimColor = rim;
      m.uSteps = steps; m.uShadowBrightness = shadowBrightness; m.uLightDirection = dir;
    }
  }, [toonMeshes, tintColor, brightness, glossiness, rimAmount, rimThreshold, rimColor, steps, shadowBrightness, lightX, lightY, lightZ]);

  useEffect(() => {
    const color = new THREE.Color(outlineColor);
    for (const { material: m } of outlineMeshes) {
      m.uniforms.uThickness.value = outlineThickness;
      m.uniforms.uOutlineColor.value = color;
    }
  }, [outlineMeshes, outlineThickness, outlineColor]);

  return (
    <primitive
      object={scene}
      scale={scale}
      position={[-center.x * scale, -center.y * scale, -center.z * scale]}
      rotation={[0, Math.PI * 1.08, 0]}
    />
  );
}