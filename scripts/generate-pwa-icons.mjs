/**
 * PWA Icon Generator
 * ------------------
 * Reads your source icon (source.png OR icon.svg fallback)
 * and generates all required PWA sizes into public/icons/
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 *
 * To use YOUR OWN image:
 *   Copy your PNG to:  telegram-clone/public/icons/source.png
 *   Then run this script.
 */

import { createCanvas, loadImage } from 'canvas'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createCanvas as createC } from 'canvas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const OUT_DIR   = join(ROOT, 'public', 'icons')

mkdirSync(OUT_DIR, { recursive: true })

// All sizes required for full PWA coverage
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

// Source priority: source.png > icon.svg
const SOURCE_PNG = join(OUT_DIR, 'source.png')
const SOURCE_SVG = join(OUT_DIR, 'icon.svg')

const sourcePath = existsSync(SOURCE_PNG) ? SOURCE_PNG : SOURCE_SVG

console.log(`\n📦 PWA Icon Generator`)
console.log(`   Source : ${sourcePath}`)
console.log(`   Output : ${OUT_DIR}\n`)

let sourceImage
try {
  sourceImage = await loadImage(sourcePath)
  console.log(`✅ Source loaded: ${sourceImage.width}×${sourceImage.height}`)
} catch (e) {
  console.error('❌ Failed to load source image:', e.message)
  console.error('   Make sure canvas is installed: npm install canvas')
  process.exit(1)
}

for (const size of SIZES) {
  const canvas = createCanvas(size, size)
  const ctx    = canvas.getContext('2d')

  // Clear with transparency
  ctx.clearRect(0, 0, size, size)

  // Draw source image scaled to fill the canvas
  ctx.drawImage(sourceImage, 0, 0, size, size)

  const outPath = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(outPath, canvas.toBuffer('image/png'))
  console.log(`   ✓ icon-${size}.png  (${size}×${size})`)
}

console.log('\n✅ All icons generated successfully!\n')
console.log('Next steps:')
console.log('  1. Verify icons look correct in public/icons/')
console.log('  2. manifest.json is already updated')
console.log('  3. Deploy and test PWA install on Android Chrome\n')
