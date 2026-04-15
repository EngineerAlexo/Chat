const { createCanvas } = (() => {
  try { return require('canvas') } catch { return null }
})() ?? {}

const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '../public/icons')
fs.mkdirSync(outDir, { recursive: true })

if (createCanvas) {
  function gen(size) {
    const c = createCanvas(size, size)
    const ctx = c.getContext('2d')
    const r = size * 0.22
    ctx.beginPath()
    ctx.moveTo(r,0); ctx.lineTo(size-r,0); ctx.quadraticCurveTo(size,0,size,r)
    ctx.lineTo(size,size-r); ctx.quadraticCurveTo(size,size,size-r,size)
    ctx.lineTo(r,size); ctx.quadraticCurveTo(0,size,0,size-r)
    ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0); ctx.closePath()
    ctx.fillStyle='#2AABEE'; ctx.fill()
    const s=size/512
    ctx.fillStyle='white'; ctx.globalAlpha=0.95
    ctx.beginPath()
    ctx.moveTo(380*s,140*s); ctx.lineTo(160*s,230*s); ctx.lineTo(160*s,280*s)
    ctx.lineTo(220*s,300*s); ctx.lineTo(250*s,370*s); ctx.lineTo(290*s,310*s)
    ctx.lineTo(360*s,360*s); ctx.closePath(); ctx.fill()
    return c.toBuffer('image/png')
  }
  fs.writeFileSync(path.join(outDir,'icon-192.png'), gen(192))
  fs.writeFileSync(path.join(outDir,'icon-512.png'), gen(512))
  console.log('Icons generated with canvas')
} else {
  // Minimal valid 1x1 transparent PNG — browsers accept this as placeholder
  const b = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=','base64')
  fs.writeFileSync(path.join(outDir,'icon-192.png'), b)
  fs.writeFileSync(path.join(outDir,'icon-512.png'), b)
  console.log('Placeholder icons created (install canvas for real icons)')
}
