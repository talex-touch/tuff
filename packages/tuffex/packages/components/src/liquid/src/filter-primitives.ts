// Ported from liquid-gooey/src/filter.tsx
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// The React JSX filter tree is rebuilt imperatively (createElementNS) so the
// SVG namespace is unambiguous; pass order and attribute values are upstream's.

import type { ShadowLayer } from './shadow'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Alpha-binarize matrix used before spread dilation: the goo alpha has a soft
 *  fringe past the opaque edge — dilating it directly pushes a spread ring a
 *  pixel out and the fringe reads as a second hairline. */
const BINARIZE = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -29.5'

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

/** CSS inset emulation on the LIQUID: paint the colour where the silhouette
 *  is NOT covered by a shrunk/offset/blurred copy of itself, clipped back to
 *  the silhouette — an inner ring (spread), inner edge line (offset) or soft
 *  inner shadow (blur) that follows the merged goo through every state. */
function insetPass(i: number, s: ShadowLayer): SVGElement[] {
  const parts: SVGElement[] = []
  // `bin` is computed once for the whole stack (see buildGooFilter) — every
  // full-region pass costs real milliseconds on WebKit's CPU rasterizer.
  let src = 'bin'
  // Erode by the SPREAD only. An offset-only inset (`inset 0 1px 0 0`) must
  // leave a 1px strip along the TOP edge and nothing else — eroding for it
  // too shrinks the shape all round and paints a spurious ring on the sides
  // and bottom, doubling up with a real inner ring in the same stack.
  if (s.spread !== 0) {
    parts.push(el('feMorphology', {
      in: src,
      operator: s.spread > 0 ? 'erode' : 'dilate',
      radius: Math.abs(s.spread),
      result: `s${i}-er`,
    }))
    src = `s${i}-er`
  }
  if (s.x !== 0 || s.y !== 0) {
    parts.push(el('feOffset', { in: src, dx: s.x, dy: s.y, result: `s${i}-o` }))
    src = `s${i}-o`
  }
  if (s.blur > 0) {
    parts.push(el('feGaussianBlur', { in: src, stdDeviation: s.blur / 2, result: `s${i}-b` }))
    src = `s${i}-b`
  }
  parts.push(
    // The band: silhouette minus its shrunk/offset self.
    el('feComposite', { in: 'bin', in2: src, operator: 'out', result: `s${i}-band` }),
    el('feFlood', { 'flood-color': s.color, 'result': `s${i}-c` }),
    el('feComposite', { in: `s${i}-c`, in2: `s${i}-band`, operator: 'in', result: `s${i}` }),
  )
  return parts
}

function shadowPass(i: number, s: ShadowLayer): SVGElement[] {
  const parts: SVGElement[] = []
  let src = 'shape'
  if (s.spread !== 0) {
    parts.push(el('feMorphology', {
      in: 'bin',
      operator: s.spread > 0 ? 'dilate' : 'erode',
      radius: Math.abs(s.spread),
      result: `s${i}-sp`,
    }))
    src = `s${i}-sp`
  }
  if (s.blur > 0) {
    parts.push(el('feGaussianBlur', { in: src, stdDeviation: s.blur / 2, result: `s${i}-b` }))
    src = `s${i}-b`
  }
  if (s.x !== 0 || s.y !== 0) {
    parts.push(el('feOffset', { in: src, dx: s.x, dy: s.y, result: `s${i}-o` }))
    src = `s${i}-o`
  }
  parts.push(
    el('feFlood', { 'flood-color': s.color, 'result': `s${i}-c` }),
    el('feComposite', { in: `s${i}-c`, in2: src, operator: 'in', result: `s${i}` }),
  )
  return parts
}

/** (Re)build the goo + shadow filter chain inside `filter`. Only the spread
 *  rings and inset layers run here — blurred/offset outer shadows are cheaper
 *  as CSS drop-shadow() on the svg element (see TxLiquid.vue). */
export function buildGooFilter(
  filter: SVGElement,
  blur: number,
  contrast: number,
  shadows: ShadowLayer[],
): void {
  while (filter.firstChild) filter.removeChild(filter.firstChild)

  // Intercept tracks the slope so the alpha threshold stays near the same
  // crossing as the classic 18/-7 goo pairing.
  const intercept = Math.round((0.5 - contrast * (5 / 12)) * 100) / 100
  const parts: SVGElement[] = [
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'blur' }),
    el('feColorMatrix', {
      in: 'blur',
      type: 'matrix',
      values: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${contrast} ${intercept}`,
      result: 'goo',
    }),
    el('feComposite', { in: 'SourceGraphic', in2: 'goo', operator: 'atop', result: 'shape' }),
  ]

  // Binarized silhouette, computed ONCE and shared by every pass that needs it.
  if (shadows.some(s => s.inset || s.spread !== 0))
    parts.push(el('feColorMatrix', { in: 'shape', type: 'matrix', values: BINARIZE, result: 'bin' }))

  shadows.forEach((s, i) => {
    parts.push(...(s.inset ? insetPass(i, s) : shadowPass(i, s)))
  })

  if (shadows.length > 0) {
    const merge = el('feMerge', {})
    // CSS paints the first shadow of the list on top: outer passes merge in
    // reverse (among themselves) BELOW the shape; inset passes paint ABOVE it
    // — they live inside the liquid edge.
    shadows
      .map((s, i) => (!s.inset ? i : -1))
      .filter(i => i >= 0)
      .reverse()
      .forEach(i => merge.appendChild(el('feMergeNode', { in: `s${i}` })))
    merge.appendChild(el('feMergeNode', { in: 'shape' }))
    shadows.forEach((s, i) => {
      if (s.inset)
        merge.appendChild(el('feMergeNode', { in: `s${i}` }))
    })
    parts.push(merge)
  }

  for (const part of parts) filter.appendChild(part)
}
