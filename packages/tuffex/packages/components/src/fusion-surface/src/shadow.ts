import { parseShadow } from '../../liquid/src/shadow'

/** Splits on top-level commas, leaving `var(…, …)` and `rgba(…)` whole. */
function layers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth++
    else if (char === ')')
      depth--
    if (char === ',' && depth === 0) {
      if (current.trim())
        out.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  if (current.trim())
    out.push(current.trim())
  return out
}

/**
 * The `shadow` prop (`box-shadow` syntax) as the silhouette's `filter`, or
 * `undefined` to keep the stylesheet default.
 *
 * `drop-shadow()` follows the path's alpha, so the shadow hugs every bud,
 * neck and drop; its blur radius means what box-shadow's does, and it is the
 * same conversion TxLiquid applies to its blurred outer layers. It has no
 * spread and no inset, so those layers are skipped. A `var()` layer is
 * passed through whole: `var(--tx-elevation-4)` works because each elevation
 * token is a single `x y blur colour` layer.
 */
export function shadowFilter(shadow: string | null | undefined): string | undefined {
  if (shadow == null)
    return undefined
  const filters: string[] = []
  for (const layer of layers(shadow)) {
    if (/^var\(/i.test(layer)) {
      filters.push(`drop-shadow(${layer})`)
      continue
    }
    for (const parsed of parseShadow(layer)) {
      if (!parsed.inset && parsed.spread === 0)
        filters.push(`drop-shadow(${parsed.x}px ${parsed.y}px ${parsed.blur}px ${parsed.color})`)
    }
  }
  return filters.length ? filters.join(' ') : 'none'
}
