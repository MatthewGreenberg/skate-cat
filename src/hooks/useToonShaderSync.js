import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getGameDelta } from '../store'

// Intro toon shader overrides (lerp to gameplay values on start)
const INTRO_TOON = {
  lightX: 20.0, lightY: 13.0, lightZ: 2.0,
  rimAmount: 0.45, shadowBrightness: 0.05,
  brightness: 2.05, outlineThickness: 0.0,
}

/**
 * Syncs toon shader uniforms and drives blink animation each frame.
 * Skips when useOriginalMaterials is true (intro PBR mode).
 */
export default function useToonShaderSync({
  toonControls,
  blinkControls,
  toonMeshesRef,
  outlineMeshesRef,
  useOriginalMaterials,
  introStateRef,
  blinkStateRef,
}) {
  const introLerp = useRef(1) // 0 = intro look, 1 = gameplay look
  const lastBlinkAmount = useRef(0)

  useEffect(() => {
    if (useOriginalMaterials) return

    for (const child of toonMeshesRef.current) {
      const u = child.material.uniforms
      if (!u) continue
      u.uGlossiness.value = toonControls.glossiness
      u.uRimThreshold.value = toonControls.rimThreshold
      u.uRimColor.value.set(toonControls.rimColor)
      u.uSteps.value = toonControls.steps
      u.uLeftEyeCenter.value.set(blinkControls.leftEyeX, blinkControls.leftEyeY)
      u.uRightEyeCenter.value.set(blinkControls.rightEyeX, blinkControls.rightEyeY)
      u.uEyeRadius.value.set(blinkControls.eyeRadiusX, blinkControls.eyeRadiusY)
      u.uLidColor.value.set(blinkControls.lidColor)
    }

    for (const child of outlineMeshesRef.current) {
      child.material.uniforms.uOutlineColor.value.set(toonControls.outlineColor)
    }
  }, [
    blinkControls.eyeRadiusX,
    blinkControls.eyeRadiusY,
    blinkControls.leftEyeX,
    blinkControls.leftEyeY,
    blinkControls.lidColor,
    blinkControls.rightEyeX,
    blinkControls.rightEyeY,
    outlineMeshesRef,
    toonControls.glossiness,
    toonControls.outlineColor,
    toonControls.rimColor,
    toonControls.rimThreshold,
    toonControls.steps,
    toonMeshesRef,
    useOriginalMaterials,
  ])

  useFrame((_, delta) => {
    const gameDelta = getGameDelta(delta)

    // --- Blink animation ---
    const BLINK_DURATION = 0.35
    const PAUSE_BETWEEN = 0.08
    const MIN_INTERVAL = 1.5
    const MAX_INTERVAL = 4.0
    const s = blinkStateRef.current

    if (blinkControls.forceClose) {
      s.amount = 1.0
    } else {
      if (!s.blinking) {
        s.timer -= gameDelta
        if (s.timer <= 0) {
          s.blinking = true
          s.blinkTime = 0
          const r = Math.random()
          s.blinksLeft = r < 0.1 ? 2 : r < 0.4 ? 1 : 0
        }
      } else {
        s.blinkTime += gameDelta
        if (s.blinkTime >= BLINK_DURATION) {
          if (s.blinksLeft > 0) {
            s.blinksLeft--
            s.blinkTime = -PAUSE_BETWEEN
          } else {
            s.blinking = false
            s.timer = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
          }
        }
      }
      if (s.blinking && s.blinkTime >= 0) {
        s.amount = Math.sin((s.blinkTime / BLINK_DURATION) * Math.PI)
      } else {
        s.amount = 0
      }
    }

    // --- Lerp intro -> gameplay shader values ---
    const targetLerp = introStateRef.current.phase === 'idle' ? 0 : 1
    introLerp.current = THREE.MathUtils.lerp(introLerp.current, targetLerp, gameDelta * 3)
    const il = introLerp.current
    const mix = (intro, gameplay) => intro + (gameplay - intro) * il

    // --- Update toon + blink uniforms on cached meshes ---
    /* eslint-disable react-hooks/immutability */
    if (!useOriginalMaterials) {
      for (const child of toonMeshesRef.current) {
        const u = child.material.uniforms
        if (!u) continue
        u.uLightDirection.value.set(
          mix(INTRO_TOON.lightX, toonControls.lightX),
          mix(INTRO_TOON.lightY, toonControls.lightY),
          mix(INTRO_TOON.lightZ, toonControls.lightZ),
        )
        u.uRimAmount.value = mix(INTRO_TOON.rimAmount, toonControls.rimAmount)
        u.uShadowBrightness.value = mix(INTRO_TOON.shadowBrightness, toonControls.shadowBrightness)
        u.uBrightness.value = mix(INTRO_TOON.brightness, toonControls.brightness)
        if (lastBlinkAmount.current !== s.amount) {
          u.uBlinkAmount.value = s.amount
        }
      }
      for (const child of outlineMeshesRef.current) {
        child.material.uniforms.uThickness.value = mix(INTRO_TOON.outlineThickness, toonControls.outlineThickness)
      }
    }
    /* eslint-enable react-hooks/immutability */

    lastBlinkAmount.current = s.amount
  })
}
