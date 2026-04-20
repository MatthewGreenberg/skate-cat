/**
 * Shared Selection + custom Pass for selective DOF: render TV / CRT meshes sharp on top of the blurred composer output.
 *
 * Pipeline (single EffectComposer, single lighting pass):
 *   1. Main RenderPass renders the whole scene (including TV) → depth buffer captures TV depth.
 *   2. DepthOfFieldEffect blurs the entire frame.
 *   3. SharpOverlayPass re-renders only the meshes in `sharpSelection` on top of the DOF result,
 *      reusing the existing depth buffer so occluders (e.g. the cat in front of the TV) still hide it.
 *
 * Lights must be on every layer (see `enableAllLayersOnLights`) so the re-render stays lit.
 */

import { Pass, Selection } from 'postprocessing'

// Use a layer outside the ranges r3f-postprocessing's SelectiveBloom / Outline default to (10),
// and outside THREE.js scene-graph convention (layer 0 = default visible).
export const SHARP_LAYER = 11

export const sharpSelection = new Selection(undefined, SHARP_LAYER)

export function registerSharpMesh(mesh) {
  if (!mesh || !mesh.isMesh) return () => {}
  sharpSelection.add(mesh)
  return () => {
    sharpSelection.delete(mesh)
    mesh.layers.disable(SHARP_LAYER)
  }
}

export function registerSharpGroup(group) {
  if (!group) return () => {}
  const meshes = []
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj)
  })
  meshes.forEach((mesh) => sharpSelection.add(mesh))
  return () => {
    meshes.forEach((mesh) => {
      sharpSelection.delete(mesh)
      mesh.layers.disable(SHARP_LAYER)
    })
  }
}

export function enableAllLayersOnLights(scene) {
  if (!scene) return
  scene.traverse((obj) => {
    if (obj.isLight) obj.layers.enableAll()
  })
}

// Mutable ref so TvScreen can publish its CRT screen mesh and PostEffects
// (a sibling in the tree, mounted separately) can feed it to GodRaysEffect
// without prop-drilling through App → SceneCanvas.
export const godRaysSourceRef = { current: null }

export function setGodRaysSource(mesh) {
  godRaysSourceRef.current = mesh ?? null
}

export class SharpOverlayPass extends Pass {
  constructor(scene, camera) {
    super('SharpOverlayPass')
    this.overlayScene = scene
    this.overlayCamera = camera
    this.needsSwap = false
  }

  render(renderer, inputBuffer) {
    if (sharpSelection.size === 0) return
    const camera = this.overlayCamera
    if (!camera || !this.overlayScene || !inputBuffer) return

    const prevLayerMask = camera.layers.mask
    const prevAutoClear = renderer.autoClear
    const prevAutoClearColor = renderer.autoClearColor
    const prevAutoClearDepth = renderer.autoClearDepth
    const prevAutoClearStencil = renderer.autoClearStencil
    const prevBackground = this.overlayScene.background

    camera.layers.set(SHARP_LAYER)
    renderer.autoClear = false
    renderer.autoClearColor = false
    renderer.autoClearDepth = false
    renderer.autoClearStencil = false
    this.overlayScene.background = null

    renderer.setRenderTarget(inputBuffer)
    renderer.render(this.overlayScene, camera)

    camera.layers.mask = prevLayerMask
    renderer.autoClear = prevAutoClear
    renderer.autoClearColor = prevAutoClearColor
    renderer.autoClearDepth = prevAutoClearDepth
    renderer.autoClearStencil = prevAutoClearStencil
    this.overlayScene.background = prevBackground
  }
}
