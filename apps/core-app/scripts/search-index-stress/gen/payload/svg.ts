import type { PayloadSpec } from '../../types'
import { asciiFiller, xorshift } from './bytes'

const COMMENT_OVERHEAD = 8

export function encodeSvg(spec: PayloadSpec): Buffer {
  const width = spec.width ?? 640
  const height = spec.height ?? 480
  const next = xorshift(spec.seed ^ 0x51ed270b)
  const shapes: string[] = []
  for (let index = 0; index < 6; index += 1) {
    const n = next()
    const x = n % width
    const y = (n >>> 12) % height
    const colour = (next() & 0xffffff).toString(16).padStart(6, '0')
    shapes.push(
      `  <rect x="${x}" y="${y}" width="${1 + ((n >>> 5) % width)}" height="${1 + ((n >>> 9) % height)}" fill="#${colour}"/>\n`
    )
  }
  const head =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    shapes.join('')
  const tail = '</svg>\n'
  const gap = spec.bytes - head.length - tail.length
  if (gap >= COMMENT_OVERHEAD) {
    const comment = `<!--${asciiFiller(gap - COMMENT_OVERHEAD, spec.seed).toString('latin1')}-->\n`
    return Buffer.from(head + comment + tail, 'latin1')
  }
  return Buffer.from(head + tail + '\n'.repeat(Math.max(0, gap)), 'latin1')
}
