/**
 * Unpacks a Claude Design .dc.html bundle into design/unpacked/:
 * the real design HTML plus every embedded asset as a normal file.
 *
 * Usage: node design/unpack.mjs design/pisga.dc.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'

const src = process.argv[2] ?? 'design/pisga.dc.html'
const outDir = path.join(path.dirname(src), 'unpacked')
mkdirSync(outDir, { recursive: true })

const html = readFileSync(src, 'utf8')

function island(type) {
  const re = new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`, 'i')
  const m = html.match(re)
  return m ? JSON.parse(m[1]) : null
}

const template = island('template')
writeFileSync(path.join(outDir, 'design.html'), template)
console.log('design.html', template.length, 'chars')

const manifest = island('manifest') ?? {}
const ext = new Set((island('ext_resources') ?? []).map((e) => e.uuid))
const index = []

for (const [uuid, entry] of Object.entries(manifest)) {
  let bytes = Buffer.from(entry.data, 'base64')
  if (entry.compressed) bytes = gunzipSync(bytes)

  const kind = ext.has(uuid) ? 'vendor' : 'asset'
  const extension = (entry.mime.split('/')[1] ?? 'bin').replace(/[^\w.-]/g, '')
  const name = `${kind}-${uuid.slice(0, 8)}.${extension}`
  writeFileSync(path.join(outDir, name), bytes)
  index.push({ uuid, name, mime: entry.mime, bytes: bytes.length })
}

writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2))
console.table(index.map(({ name, mime, bytes }) => ({ name, mime, bytes })))
