/**
 * Bowed plane geometry so the TV UI reads as a curved CRT panel.
 */

import * as THREE from 'three'

export function createCurvedScreenGeometry(width, height, curveDepth, widthSegments = 28, heightSegments = 20) {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments)
  const position = geometry.attributes.position
  const vertex = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i)
    const xNorm = width === 0 ? 0 : vertex.x / (width * 0.5)
    const yNorm = height === 0 ? 0 : vertex.y / (height * 0.5)
    const falloff = Math.max(0, 1 - (xNorm * xNorm + yNorm * yNorm) * 0.5)
    vertex.z = curveDepth * falloff
    position.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}
