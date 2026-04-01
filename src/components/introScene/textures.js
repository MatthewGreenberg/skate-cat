/**
 * Procedural canvas textures for wood floor / wall detail (SSR-safe: no document on server).
 */

import * as THREE from 'three'

function createSeededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function createFloorTexture() {
  if (typeof document === 'undefined') return null

  const width = 1024
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const random = createSeededRandom(0xCA7F00)

  ctx.fillStyle = '#26181d'
  ctx.fillRect(0, 0, width, height)

  const plankCount = 14
  const plankHeight = height / plankCount
  for (let i = 0; i < plankCount; i += 1) {
    const y = i * plankHeight
    const lightness = 16 + (i % 2) * 2 + random() * 4
    ctx.fillStyle = `hsl(${330 + random() * 8}, 24%, ${lightness}%)`
    ctx.fillRect(0, y, width, plankHeight + 2)

    ctx.fillStyle = 'rgba(255, 220, 170, 0.055)'
    ctx.fillRect(0, y, width, 2)
    ctx.fillStyle = 'rgba(20, 9, 12, 0.35)'
    ctx.fillRect(0, y + plankHeight - 3, width, 3)
  }

  for (let i = 0; i < 180; i += 1) {
    const x = random() * width
    const y = random() * height
    const length = 40 + random() * 160
    const alpha = 0.025 + random() * 0.035
    ctx.strokeStyle = `rgba(255, 214, 178, ${alpha})`
    ctx.lineWidth = 1 + random() * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(
      x + length * 0.25,
      y + (random() - 0.5) * 10,
      x + length * 0.65,
      y + (random() - 0.5) * 18,
      x + length,
      y + (random() - 0.5) * 14
    )
    ctx.stroke()
  }

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.46, width * 0.08, width * 0.5, height * 0.5, width * 0.7)
  vignette.addColorStop(0, 'rgba(255, 210, 158, 0.08)')
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.8, 2.8)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createWallTexture() {
  if (typeof document === 'undefined') return null

  const width = 1024
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const random = createSeededRandom(0x0FACADE)

  ctx.fillStyle = '#1d141d'
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 16; i += 1) {
    const stripeWidth = width / 16
    const x = i * stripeWidth
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 214, 194, 0.025)' : 'rgba(70, 44, 65, 0.06)'
    ctx.fillRect(x, 0, stripeWidth, height)
  }

  for (let y = 64; y < height; y += 170) {
    for (let x = 64; x < width; x += 170) {
      const size = 18 + random() * 10
      ctx.strokeStyle = 'rgba(255, 208, 178, 0.08)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y - size)
      ctx.lineTo(x + size, y)
      ctx.lineTo(x, y + size)
      ctx.lineTo(x - size, y)
      ctx.closePath()
      ctx.stroke()

      ctx.fillStyle = 'rgba(255, 227, 188, 0.06)'
      ctx.beginPath()
      ctx.arc(x, y, 2 + random() * 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (let i = 0; i < 450; i += 1) {
    const x = random() * width
    const y = random() * height
    const alpha = 0.015 + random() * 0.025
    ctx.fillStyle = `rgba(255, 235, 215, ${alpha})`
    ctx.fillRect(x, y, 1 + random() * 2, 1 + random() * 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.5, 1.1)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
