// Run: node scripts/generate-icons.mjs
// Generates PWA icons from SVG using sharp (if available) or creates placeholder PNGs

import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  const radius = size * 0.225
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fillStyle = '#2AABEE'
  ctx.fill()

  // Paper plane icon
  const s = size / 512
  ctx.fillStyle = 'white'
  ctx.globalAlpha = 0.95
  ctx.beginPath()
  // Simple paper plane
  ctx.moveTo(380 * s, 140 * s)
  ctx.lineTo(160 * s, 230 * s)
  ctx.lineTo(160 * s, 280 * s)
  ctx.lineTo(220 * s, 300 * s)
  ctx.lineTo(250 * s, 370 * s)
  ctx.lineTo(290 * s, 310 * s)
  ctx.lineTo(360 * s, 360 * s)
  ctx.closePath()
  ctx.fill()

  return canvas.toBuffer('image/png')
}

try {
  writeFileSync(join(outDir, 'icon-192.png'), generateIcon(192))
  writeFileSync(join(outDir, 'icon-512.png'), generateIcon(512))
  console.log('Icons generated successfully')
} catch (e) {
  console.log('canvas not available, creating placeholder icons')
  // Create minimal valid 1x1 PNG as placeholder
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  writeFileSync(join(outDir, 'icon-192.png'), png1x1)
  writeFileSync(join(outDir, 'icon-512.png'), png1x1)
}
