const fs = require("fs")
const path = require("path")

const outDir = path.join(__dirname, "public", "icons")
fs.mkdirSync(outDir, { recursive: true })

// Build a minimal valid PNG programmatically
// PNG structure: signature + IHDR + IDAT + IEND
function createPNG(size, r, g, b) {
  const PNG_SIG = Buffer.from([137,80,78,71,13,10,26,10])
  
  function crc32(buf) {
    let c = 0xFFFFFFFF
    const table = []
    for (let i = 0; i < 256; i++) {
      let v = i
      for (let j = 0; j < 8; j++) v = (v & 1) ? 0xEDB88320 ^ (v >>> 1) : v >>> 1
      table[i] = v
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii")
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crcBuf = Buffer.concat([typeBytes, data])
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf))
    return Buffer.concat([len, typeBytes, data, crcVal])
  }
  
  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  
  // IDAT — raw pixel data (no compression, filter byte 0 per row)
  const rowSize = size * 3
  const raw = Buffer.alloc((rowSize + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (rowSize + 1)] = 0 // filter byte
    for (let x = 0; x < size; x++) {
      const off = y * (rowSize + 1) + 1 + x * 3
      // Draw rounded square background
      const cx = x - size/2, cy = y - size/2
      const radius = size * 0.22
      const inRounded = (Math.abs(cx) < size/2 - radius || Math.abs(cy) < size/2 - radius) &&
                        Math.sqrt(Math.pow(Math.max(0, Math.abs(cx) - (size/2 - radius)), 2) +
                                  Math.pow(Math.max(0, Math.abs(cy) - (size/2 - radius)), 2)) < radius
      if (inRounded || (Math.abs(cx) < size/2 && Math.abs(cy) < size/2 &&
          Math.sqrt(Math.pow(Math.max(0, Math.abs(cx) - (size/2 - radius)), 2) +
                    Math.pow(Math.max(0, Math.abs(cy) - (size/2 - radius)), 2)) < radius)) {
        // Simple filled square with rounded corners approximation
        const dx = Math.max(0, Math.abs(cx) - (size/2 - radius))
        const dy = Math.max(0, Math.abs(cy) - (size/2 - radius))
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          raw[off] = r; raw[off+1] = g; raw[off+2] = b
        } else {
          raw[off] = 23; raw[off+1] = 33; raw[off+2] = 43 // dark bg
        }
      } else {
        raw[off] = 23; raw[off+1] = 33; raw[off+2] = 43
      }
    }
  }
  
  // Use zlib deflate
  const zlib = require("zlib")
  const compressed = zlib.deflateSync(raw, { level: 9 })
  
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))])
}

// Telegram blue: #2AABEE = rgb(42, 171, 238)
const icon192 = createPNG(192, 42, 171, 238)
const icon512 = createPNG(512, 42, 171, 238)

fs.writeFileSync(path.join(outDir, "icon-192.png"), icon192)
fs.writeFileSync(path.join(outDir, "icon-512.png"), icon512)

console.log("Icons generated:", fs.statSync(path.join(outDir, "icon-192.png")).size, "bytes (192)")
console.log("Icons generated:", fs.statSync(path.join(outDir, "icon-512.png")).size, "bytes (512)")
