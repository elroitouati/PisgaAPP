/**
 * Regenerates the PWA icon set from a single inline SVG source.
 *
 * Built from the summit glyph the handoff puts beside the PISGA wordmark.
 * Re-run after changing the palette: `node scripts/generate-icons.mjs`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = path.join(root, 'public', 'icons')

// The real palette from the handoff, not a brand hue: Pisga is monochrome
// (PRD 7). The icon uses the dark background with the light foreground, which
// reads on both a light and a dark home screen.
const BRAND = '#0d0e10'
const ON_BRAND = '#fbfbfa'

/** Summit glyph on a 48x48 grid, matching src/components/Brand.tsx. */
const glyph = (stroke, fill) => `
  <path d="M4 38 18 14l8 12 5-7 13 19H4Z" fill="${fill}" fill-opacity="0.25"
        stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M18 14l5 7.5" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`

/**
 * @param size    output edge length in px
 * @param inset   fraction of the canvas reserved as safe zone (maskable icons)
 * @param rounded corner radius as a fraction of size (0 for full-bleed)
 */
function iconSvg({ size, inset = 0, rounded = 0 }) {
  const scale = (size * (1 - inset * 2)) / 48
  const offset = (size * inset * 2) / 2
  const radius = size * rounded

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${glyph(ON_BRAND, ON_BRAND)}</g>
</svg>`
}

const targets = [
  { file: path.join(iconsDir, 'icon-192.png'), svg: iconSvg({ size: 192 }) },
  { file: path.join(iconsDir, 'icon-512.png'), svg: iconSvg({ size: 512 }) },
  // Maskable icons get cropped to a platform-chosen shape — keep the glyph
  // inside the inner 80% so nothing important is cut off.
  {
    file: path.join(iconsDir, 'icon-512-maskable.png'),
    svg: iconSvg({ size: 512, inset: 0.1 }),
  },
  {
    file: path.join(root, 'public', 'apple-touch-icon.png'),
    svg: iconSvg({ size: 180, rounded: 0.2 }),
  },
]

await mkdir(iconsDir, { recursive: true })

for (const { file, svg } of targets) {
  await sharp(Buffer.from(svg)).png().toFile(file)
  console.log('wrote', path.relative(root, file))
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="${BRAND}"/>
  <g transform="translate(4.8 4.8) scale(0.8)">${glyph(ON_BRAND, ON_BRAND)}</g>
</svg>
`
await writeFile(path.join(root, 'public', 'favicon.svg'), favicon)
console.log('wrote public/favicon.svg')
