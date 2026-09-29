// Glyph-overlay helpers for `TxMetalText`, lifted out of the SFC so the
// component keeps a single `<script setup>` block (module-scope code there
// would compile into `setup()`) without duplicating imports across two script
// blocks — `import/no-duplicates` is a lint error in this repo.
//
// Both the inner-shadow painter and the "bare" style sheet are upstream's own
// code from `MetalText.tsx`.

import { gaussBlur } from './engine/glow/bake'
import { paintTextRun } from './engine/text-mask'
import type { TextInnerShadow } from './types'

/**
 * MetalFx dresses its root as a button: fill, inset rims (::before/::after)
 * and the inner hairline. Bare text wants none of that — only the glyphs.
 */
export const BARE_STYLE_ID = 'mfx-bare-style'
export const BARE_CSS =
  '.metal-fx-root[data-mfx-bare]{background:transparent!important}'
  + '.metal-fx-root[data-mfx-bare]::before,.metal-fx-root[data-mfx-bare]::after{box-shadow:none!important}'
  + '.metal-fx-root[data-mfx-bare] .metal-fx-inner{display:none!important}'

/**
 * Figma inner shadow on the text (1471:40930): white 90 %, offset 0/1,
 * blur 0.5 — a hairline of light along the top inside edge of every glyph.
 * CSS has no inner shadow for text, so it's computed: glyph alpha minus the
 * same alpha shifted down by the offset leaves exactly that top rim, which is
 * then blurred and drawn white on an overlay above the metal.
 */
export function drawInnerShadow(cv: HTMLCanvasElement, root: HTMLElement, textEl: HTMLElement, sh: TextInnerShadow): void {
  const dpr = window.devicePixelRatio || 1
  const rr = root.getBoundingClientRect()
  const w = Math.max(1, Math.round(rr.width * dpr))
  const h = Math.max(1, Math.round(rr.height * dpr))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const og = off.getContext('2d', { willReadFrequently: true })
  const g = cv.getContext('2d')
  if (!og || !g) return
  og.fillStyle = '#fff'
  paintTextRun(og, root, textEl, dpr)
  const d = og.getImageData(0, 0, w, h).data
  const n = w * h
  const a = new Float32Array(n)
  for (let i = 0, j = 3; i < n; i++, j += 4) a[i] = (d[j] ?? 0) / 255
  const shift = Math.max(1, Math.round(sh.offsetY * dpr)) * w
  const rim = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const above = i >= shift ? (a[i - shift] ?? 0) : 0
    // Coverage the shifted glyph doesn't cover — the strip along the top
    // edge. A difference, not a product: on anti-aliased side edges both
    // values are partial and a product lit every edge of every glyph.
    rim[i] = Math.max(0, (a[i] ?? 0) - above)
  }
  const blurred = gaussBlur(rim, w, h, sh.blur * dpr)
  cv.width = w
  cv.height = h
  cv.style.width = `${rr.width}px`
  cv.style.height = `${rr.height}px`
  const img = g.createImageData(w, h)
  const o = img.data
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    o[j] = 255
    o[j + 1] = 255
    o[j + 2] = 255
    // Inner shadow: clipped to the glyph, so the blur never leaks outside
    // the letterform (it read as a halo, worst when zoomed in).
    o[j + 3] = Math.round(Math.min(1, (blurred[i] ?? 0) * (a[i] ?? 0) * sh.alpha) * 255)
  }
  g.putImageData(img, 0, 0)
}
