// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentsRoot = resolve(here, '..')
const variables = readFileSync(resolve(componentsRoot, '../style/variables.scss'), 'utf8')

/**
 * One light source, top-left. Every shadow in the library casts down and to the
 * right at roughly x:y = 1:2 — that is what `--tx-elevation-1..5` encode, and
 * hand-written shadows have to agree or a card and the panel next to it look
 * lit from different places.
 *
 * A straight-down shadow (`0 8px 18px`) has no light source at all. Thirty-three
 * of them had accumulated across twenty components.
 *
 * Two carve-outs, both deliberate:
 *   - Offsets under 2px. The horizontal half of a 1px offset is sub-pixel, so
 *     the shadow reads as a hairline edge rather than a cast. `TxKbd`'s keycap
 *     bevel is the clearest case: an x offset would skew the cap, not light it.
 *   - `TxDrawer` casts away from the edge it is anchored to, or the shadow
 *     lands off screen. Each of its four still carries a light-consistent
 *     component on the other axis.
 */
const MIN_OFFSET = 2

function collectSfcs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      collectSfcs(full, out)
    else if (entry.name.endsWith('.vue'))
      out.push(full)
  }
  return out
}

/** Splits a shadow list on top-level commas, leaving `var()` and `color-mix()` whole. */
function splitLayers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth++
    else if (char === ')')
      depth--
    if (char === ',' && depth === 0) {
      out.push(current)
      current = ''
    }
    else {
      current += char
    }
  }
  out.push(current)
  return out
}

const NUMBER = /(?<![\w.-])(-?\d*\.?\d+)(?:px|rem|em)?(?![\w.%(])/g

/** The first two length values of a layer, ignoring anything inside a function. */
function offsets(layer: string): [number, number] | null {
  const bare = layer.replace(/\w+\([^()]*(?:\([^()]*\))?[^()]*\)/g, '')
  const found = [...bare.matchAll(NUMBER)].map(m => Number(m[1]))
  if (found.length < 2)
    return null
  return [found[0]!, found[1]!]
}

interface Offender { file: string, layer: string }

function straightDownShadows(): Offender[] {
  const offenders: Offender[] = []

  for (const file of collectSfcs(componentsRoot)) {
    const source = readFileSync(file, 'utf8')
    const styleAt = source.indexOf('<style')
    if (styleAt < 0)
      continue
    const style = source.slice(styleAt)

    // Not just `box-shadow:` — a custom property that *holds* a shadow is the
    // same declaration one indirection away, and four of the slider's hid there.
    const declarations = /(?:box-shadow|--[\w-]*shadow[\w-]*)\s*:\s*([^;]+);/g

    for (const match of style.matchAll(declarations)) {
      // `//` comments never reach the bundle; they are kept history.
      const lineStart = style.lastIndexOf('\n', match.index!) + 1
      if (style.slice(lineStart, match.index!).trimStart().startsWith('//'))
        continue

      for (const layer of splitLayers(match[1]!)) {
        const trimmed = layer.trim()
        if (!trimmed || trimmed.startsWith('inset'))
          continue
        const parsed = offsets(trimmed)
        if (!parsed)
          continue
        const [x, y] = parsed
        if (x === 0 && Math.abs(y) >= MIN_OFFSET)
          offenders.push({ file: relative(componentsRoot, file), layer: trimmed })
      }
    }
  }

  return offenders
}

describe('shadow light source', () => {
  it('finds shadows to check', () => {
    // Guards the parser itself: a regex that matched nothing would make the
    // assertion below pass for the wrong reason.
    const all = collectSfcs(componentsRoot)
      .map(file => readFileSync(file, 'utf8'))
      .filter(source => source.includes('box-shadow'))
    expect(all.length).toBeGreaterThan(40)
  })

  it('never casts a shadow straight down', () => {
    expect(
      straightDownShadows(),
      'give it the x offset a top-left light would cast — roughly half the y',
    ).toEqual([])
  })

  it('keeps the elevation ramp on the same 1:2 diagonal', () => {
    const ramp = [...variables.matchAll(/--tx-elevation-(\d):\s*(-?[\d.]+)px\s+(-?[\d.]+)px/g)]
    expect(ramp.length).toBeGreaterThanOrEqual(5)

    for (const [, level, x, y] of ramp) {
      const ratio = Number(x) / Number(y)
      expect(ratio, `--tx-elevation-${level} is ${x}px / ${y}px`).toBeGreaterThan(0.35)
      expect(ratio, `--tx-elevation-${level} is ${x}px / ${y}px`).toBeLessThan(0.65)
    }
  })
})
