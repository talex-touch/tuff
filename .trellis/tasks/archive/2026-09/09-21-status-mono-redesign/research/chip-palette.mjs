// Solve the status chip palette.
//
// Round 1/2 proved the reference design's "white glyph on a solid semantic disc"
// does not survive our `--tx-color-*` ramp: those hues are tuned to be *ink on a
// light page*, so they are far lighter than BUI's (`--tx-color-danger #f56c6c`
// = 2.88:1 against white, vs `--tx-bui-red #e3474c` = 3.97:1).
//
// Round 3: stop deriving the disc from the text hue. Give the chip its own
// per-theme token, dark enough for a white glyph in light themes and light
// enough for a dark glyph in high-contrast dark. Verify every pairing here so
// the numbers can go into the source comment, as tuffex-design-rules.md demands.

const srgb = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const ratio = (a, b) => {
  const [hi, lo] = [lum(hex2rgb(a)), lum(hex2rgb(b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Candidate palettes. Light/dark use a white glyph; high-contrast dark inverts.
const THEMES = {
  'light (:root)': {
    glyph: '#ffffff',
    chips: {
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
      info: '#1d4ed8',
      muted: '#52525b',
    },
  },
  'dark': {
    glyph: '#ffffff',
    chips: {
      success: '#16a34a',
      warning: '#c2620a',
      danger: '#dc2626',
      info: '#2563eb',
      muted: '#6b7280',
    },
  },
  'high-contrast light': {
    glyph: '#ffffff',
    chips: {
      success: '#166534',
      warning: '#9a5b00',
      danger: '#b42318',
      info: '#005fcc',
      muted: '#475569',
    },
  },
  // Its palette is deliberately light-on-dark, so a dark disc would vanish into
  // the page. Invert the pairing instead of fighting the theme.
  'high-contrast dark': {
    glyph: '#0a2540',
    chips: {
      success: '#86efac',
      warning: '#facc15',
      danger: '#fda4af',
      info: '#7cc4ff',
      muted: '#cbd5e1',
    },
  },
}

const TARGET = 3.0 // WCAG non-text minimum for a graphical object
let worst = Number.POSITIVE_INFINITY
let failures = 0

for (const [theme, { glyph, chips }] of Object.entries(THEMES)) {
  console.log(`\n## ${theme}  (glyph ${glyph})`)
  for (const [tone, disc] of Object.entries(chips)) {
    const r = ratio(disc, glyph)
    worst = Math.min(worst, r)
    const ok = r >= TARGET
    if (!ok)
      failures += 1
    console.log(`  ${tone.padEnd(8)} disc ${disc}  ${r.toFixed(2)}:1  ${ok ? 'PASS' : 'FAIL'}`)
  }
}

console.log(`\nworst pairing: ${worst.toFixed(2)}:1 — ${failures === 0 ? 'ALL PASS' : `${failures} FAIL`}`)
