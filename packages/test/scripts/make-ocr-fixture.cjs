'use strict'

/**
 * Regenerates src/native/fixtures/tuff-ocr-fixture.png.
 *
 * The OCR contract test needs an image containing known text. It used to point at
 * shots/LogoBanner.png, a 7.8MB marketing asset, which a docs media migration
 * (bd4a98bf1) deleted -- taking the test with it. A fixture the test owns cannot be
 * removed by unrelated housekeeping, and at 3.6KB it costs nothing to keep.
 *
 * Deliberately plain: large, high-contrast block letters with generous padding, which
 * Apple Vision reads as exactly "TUFF". No font or image dependency, so it stays
 * reproducible anywhere Node runs.
 */

const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const GLYPHS = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000']
}

const WORD = 'TUFF'
const SCALE = 24
const PADDING = 40
const GAP_COLUMNS = 2

const glyphWidth = (5 + GAP_COLUMNS) * SCALE
const width = PADDING * 2 + WORD.length * glyphWidth - GAP_COLUMNS * SCALE
const height = PADDING * 2 + 7 * SCALE

const pixels = Buffer.alloc(width * height * 3, 255)

function paint(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const offset = (y * width + x) * 3
  pixels[offset] = 0
  pixels[offset + 1] = 0
  pixels[offset + 2] = 0
}

WORD.split('').forEach((character, index) => {
  const glyph = GLYPHS[character]
  const originX = PADDING + index * glyphWidth
  glyph.forEach((row, rowIndex) => {
    row.split('').forEach((cell, columnIndex) => {
      if (cell !== '1') return
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          paint(originX + columnIndex * SCALE + dx, PADDING + rowIndex * SCALE + dy)
        }
      }
    })
  })
})

const stride = 1 + width * 3
const raw = Buffer.alloc(height * stride)
for (let y = 0; y < height; y += 1) {
  raw[y * stride] = 0
  pixels.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3)
}

const CRC_TABLE = []
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typedData = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typedData))
  return Buffer.concat([length, typedData, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8
ihdr[9] = 2

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

const outPath = path.join(__dirname, '..', 'src', 'native', 'fixtures', 'tuff-ocr-fixture.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, png)
console.warn(`wrote ${outPath} (${width}x${height}, ${png.length} bytes)`)
