// Generates build/icon.ico (multi-resolution) and build/icon.png (512) from icon.svg.
// One-off build tool. Run: npm install --no-save sharp png-to-ico && node build/make-icon.mjs
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const svg = await readFile(path.join(dir, 'icon.svg'))

// Rasterize the vector once at high resolution, then downscale crisply.
const master = await sharp(svg, { density: 512 })
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = []
for (const s of sizes) {
  pngs.push(await sharp(master).resize(s, s).png().toBuffer())
}

await writeFile(path.join(dir, 'icon.png'), await sharp(master).resize(512, 512).png().toBuffer())
const ico = await pngToIco(pngs)
await writeFile(path.join(dir, 'icon.ico'), ico)
console.log(`wrote icon.ico (${ico.length} bytes, sizes ${sizes.join('/')}) and icon.png (512)`)
