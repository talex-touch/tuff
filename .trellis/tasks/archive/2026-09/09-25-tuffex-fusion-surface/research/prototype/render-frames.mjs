import { writeFileSync } from 'node:fs'
import { bodyWithTopBud } from './profile-geometry.mjs'
const W = 420, H = 90, R = 22
const frames = [
  { e: 14, d: 0, pinch: 0 }, { e: 40, d: 0, pinch: 0 }, { e: 40, d: 6, pinch: 0.1 }, { e: 40, d: 12, pinch: 0.3 },
  { e: 40, d: 18, pinch: 0.55 }, { e: 40, d: 24, pinch: 0.78 }, { e: 40, d: 28, pinch: 0.92 }, { e: 40, d: 30, pinch: 0.99 },
  { e: 40, d: 24, pinch: 0.78, drift: 30 }, { e: 40, d: 30, pinch: 0.99, drift: 40 },
]
let i = 0
for (const fr of frames) {
  const path = bodyWithTopBud(W, H, R, { c: 150, l: 160, e: fr.e, m: 16, p: Math.min(12, fr.e / 2), d: fr.d, pinch: fr.pinch, drift: fr.drift ?? 0 })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="230" viewBox="-30 -130 480 230"><rect x="-30" y="-130" width="480" height="230" fill="#141414"/><path d="${path}" fill="#1c1c1e" stroke="#48484a" stroke-width="1"/><text x="-20" y="85" fill="#888" font-size="12" font-family="sans-serif">e=${fr.e} d=${fr.d} pinch=${fr.pinch} drift=${fr.drift ?? 0}</text></svg>`
  writeFileSync(`/tmp/fusion-proto/g${String(i++).padStart(2, '0')}.svg`, svg)
}
