/**
 * Clones a GLTF scene for intro props, enables shadows, and computes TV screen plane pose for UI placement.
 */

import * as THREE from 'three'

export function prepareAsset(scene, { screenMaterialName = null } = {}) {
  const root = scene.clone(true)
  let screenMesh = null

  root.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone())
      if (screenMaterialName && child.material.some((material) => material.name === screenMaterialName)) {
        screenMesh = child
      }
    } else if (child.material) {
      child.material = child.material.clone()
      if (screenMaterialName && child.material.name === screenMaterialName) {
        screenMesh = child
      }
    }
  })

  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const screenBox = screenMesh ? new THREE.Box3().setFromObject(screenMesh) : null
  let screenPlanePosition = null
  let screenPlaneRotation = null

  if (screenMesh?.geometry?.attributes?.position && screenBox) {
    const position = screenMesh.geometry.attributes.position
    const index = screenMesh.geometry.index
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const ab = new THREE.Vector3()
    const ac = new THREE.Vector3()
    const triangleNormal = new THREE.Vector3()
    const averageNormalLocal = new THREE.Vector3()
    const triangleIndexCount = index
      ? Math.min(index.count, 180)
      : Math.min(position.count, 180)

    for (let i = 0; i < triangleIndexCount; i += 3) {
      const ai = index ? index.getX(i) : i
      const bi = index ? index.getX(i + 1) : i + 1
      const ci = index ? index.getX(i + 2) : i + 2

      a.fromBufferAttribute(position, ai)
      b.fromBufferAttribute(position, bi)
      c.fromBufferAttribute(position, ci)
      ab.subVectors(b, a)
      ac.subVectors(c, a)
      triangleNormal.crossVectors(ab, ac)

      if (triangleNormal.lengthSq() > 1e-10) {
        averageNormalLocal.add(triangleNormal.normalize())
      }
    }

    if (averageNormalLocal.lengthSq() > 1e-10) {
      averageNormalLocal.normalize()
      const screenMeshWorldQuat = screenMesh.getWorldQuaternion(new THREE.Quaternion())
      const screenNormalWorld = averageNormalLocal.clone().applyQuaternion(screenMeshWorldQuat).normalize()
      const screenFixQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        averageNormalLocal
      )
      const screenPlaneQuat = screenMeshWorldQuat.clone().multiply(screenFixQuat)

      screenPlanePosition = screenBox
        .getCenter(new THREE.Vector3())
        .add(screenNormalWorld.multiplyScalar(0.02))
      screenPlaneRotation = new THREE.Euler().setFromQuaternion(screenPlaneQuat, 'XYZ')
    }
  }

  return {
    root,
    min: box.min.clone(),
    max: box.max.clone(),
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
    screenBox: screenBox ? screenBox.clone() : null,
    screenPlanePosition: screenPlanePosition ? screenPlanePosition.clone() : null,
    screenPlaneRotation: screenPlaneRotation ? screenPlaneRotation.clone() : null,
  }
}
