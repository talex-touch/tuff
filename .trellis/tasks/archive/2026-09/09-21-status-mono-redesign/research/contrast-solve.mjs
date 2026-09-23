// Contrast solver for the mono status chip.
//
// Round 1 proved the reference design's "white glyph on a solid semantic disc"
// is not portable to our token set: it clears 3:1 only in hc-light. (The 1.74:1
// already recorded in tuffex-design-rules.md is dark-theme success #4ade80 —
// same measurement, independently reproduced.)
//
// Round 2 tests the portable alternative: keep the solid disc in the semantic
// hue, but derive the glyph colour FROM that hue by mixing toward black, so the
// pairing self-adjusts per theme instead of assuming a light-on-dark direction.

const THEMES = {
  'default-light': {
    primary: '#409eff', success: '#67c23a', warning: '#e6a23c',
    danger: '#f56c6c', info: '#909399',
  },
  'hc-light': {
    primary: '#005fcc', success: '#166534', warning: '#9a5b00',
    danger: '#b42318', info: '#475569',
  },
  'default-dark': {
    primary: '#409eff', success: '#4ade80', warning: '#fbbf24',
    danger: '#f87171', info: '#909399',
  },
  'hc-dark': {
    primary: '#7cc4ff', success: '#86efac', warning: '#facc15',
    danger: '#fda4af', info: '#cbd5e1',
  },
}

const srgb = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const mixBlack = (rgb, p) => rgb.map((c) => {
  const lin = srgb(c) * p
  const v = lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
})

const TARGET = 3.0
const CANDIDATES = [0.3, 0.25, 0.2, 0.18, 0.15, 0.12, 0.1]

// Pick one mix ratio that clears TARGET for every hue in every theme, so the
// component can ship a single constant rather than per-tone special cases.
let chosen = null
for (const p of CANDIDATES) {
  const worst = Object.values(THEMES).flatMap((hues) =>
    Object.values(hues).map((h) => {
      const base = hex2rgb(h)
      return ratio(base, mixBlack(base, p))
    }),
  ).reduce((a, b) => Math.min(a, b), Infinity)
  console.log(`glyph = color-mix(in oklab, <hue> ${Math.round(p * 100)}%, black) -> worst ${worst.toFixed(2)}:1`)
  if (worst >= TARGET && chosen === null) chosen = { p, worst }
}

console.log(`\nCHOSEN: ${Math.round(chosen.p * 100)}% (worst case ${chosen.worst.toFixed(2)}:1)\n`)
for (const [theme, hues] of Object.entries(THEMES)) {
  console.log(`## ${theme}`)
  for (const [name, h] of Object.entries(hues)) {
    const base = hex2rgb(h)
    const glyph = mixBlack(base, chosen.p)
    console.log(`  ${name.padEnd(8)} disc ${h}  glyph ${hex(glyph)}  ${ratio(base, glyph).toFixed(2)}:1`)
  }
}
