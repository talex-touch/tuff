import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule that
// reads right in source can still lose to a nesting or a specificity change.
const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxFusionSurface.vue')
const REDUCED = '@media (prefers-reduced-motion: reduce)'

interface Rule {
  selectors: string[]
  declarations: Map<string, string>
  media: string | null
}

function compileStyles(): string {
  const source = readFileSync(SFC, 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map(block => sass.compileString(block, { url: pathToFileURL(SFC), syntax: 'scss' }).css)
    .join('\n')
}

/** Flat rules with the at-rule they sit in. Sass's expanded output never nests a brace inside a declaration block. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  const atRules: string[] = []
  let prelude = ''
  let i = 0
  while (i < css.length) {
    const char = css[i++]!
    if (char === '{') {
      const head = prelude.trim()
      prelude = ''
      if (head.startsWith('@')) {
        atRules.push(head)
        continue
      }
      const end = css.indexOf('}', i)
      const declarations = new Map<string, string>()
      for (const part of css.slice(i, end).split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0)
          declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
      }
      rules.push({ selectors: head.split(',').map(s => s.trim()), declarations, media: atRules.at(-1) ?? null })
      i = end + 1
    }
    else if (char === '}') {
      atRules.pop()
      prelude = ''
    }
    else {
      prelude += char
    }
  }
  return rules
}

/** Splits on top-level commas, leaving `var(…, cubic-bezier(…))` whole. */
function splitList(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth++
    else if (char === ')')
      depth--
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  out.push(current.trim())
  return out
}

/** Property names a rule's transition declarations would animate. */
function transitioned(rule: Rule): string[] {
  const names: string[] = []
  const shorthand = rule.declarations.get('transition')
  if (shorthand && shorthand !== 'none')
    names.push(...splitList(shorthand).map(item => item.split(/\s+/)[0]!))
  const property = rule.declarations.get('transition-property')
  if (property)
    names.push(...splitList(property))
  return names
}

/** The value with every `var(…)` removed, fallbacks included: what is left
 *  is what the stylesheet says outright. */
function withoutVars(value: string): string {
  let out = ''
  let i = 0
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let depth = 0
      for (; i < value.length; i++) {
        if (value[i] === '(')
          depth++
        else if (value[i] === ')' && --depth === 0)
          break
      }
      i++
      continue
    }
    out += value[i++]
  }
  return out
}

const css = compileStyles()
const rules = parseRules(css)
const outside = rules.filter(rule => rule.media !== REDUCED)
const reduced = rules.filter(rule => rule.media === REDUCED)
const find = (selector: string) => outside.find(rule => rule.selectors.some(s => s.startsWith(selector)))?.declarations

describe('txFusionSurface style contract', () => {
  it('positive control: the compile produced the surface, its silhouette, shape and bud layer', () => {
    for (const selector of ['.tx-fusion-surface', '.tx-fusion-surface__silhouette', '.tx-fusion-surface__shape', '.tx-fusion-surface__bud'])
      expect(find(selector), selector).toBeDefined()
    expect(css).toContain('var(--tx-')
  })

  it('leaves all motion to the frame loop', () => {
    // The driver writes transform, opacity and filter every frame. A CSS
    // transition on any of them would ease each write again and trail the
    // silhouette by its own duration.
    for (const rule of outside) {
      expect(transitioned(rule), rule.selectors.join(', ')).toEqual([])
      expect(rule.declarations.has('animation'), rule.selectors.join(', ')).toBe(false)
      expect(rule.declarations.has('animation-name'), rule.selectors.join(', ')).toBe(false)
    }
  })

  it('never eases colour on hover, and stops any tween under reduced motion', () => {
    // Holds today because nothing transitions; it is here so a later hover
    // state or tween cannot slip in without its guard.
    for (const rule of outside.filter(rule => rule.selectors.some(selector => selector.includes(':hover'))))
      expect(transitioned(rule).filter(name => /^(?:all|color|background(?:-color)?|border-color|fill|stroke)$/.test(name))).toEqual([])
    const stopped = reduced.filter(rule => rule.declarations.get('transition') === 'none').flatMap(rule => rule.selectors)
    for (const rule of outside.filter(rule => transitioned(rule).length || rule.declarations.has('animation'))) {
      for (const selector of rule.selectors)
        expect(stopped, selector).toContain(selector)
    }
  })

  it('takes every colour from a --tx-* token, with a fallback', () => {
    // A host that loads the component's CSS without variables.scss still gets colour.
    expect(css.match(/var\(--[\w-]+\)/g) ?? []).toEqual([])
    for (const name of css.matchAll(/var\((--[\w-]+)/g)) {
      // The component's own hooks and the tokens behind them, nothing else.
      expect(name[1]!.startsWith('--tx-'), name[1]).toBe(true)
    }
    for (const rule of rules) {
      for (const [property, value] of rule.declarations) {
        const bare = withoutVars(value)
        expect(bare, `${rule.selectors.join(', ')} { ${property} }`).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(|\b(?:white|black|red|blue|green|gray|grey)\b/i)
      }
    }
  })

  it('casts the default shadow from the shared elevation scale', () => {
    // --tx-elevation-* carries the library's one top-left light source.
    expect(find('.tx-fusion-surface__silhouette')?.get('filter')).toMatch(/^var\(--tx-fusion-surface-filter, drop-shadow\(var\(--tx-elevation-\d, /)
    expect(find('.tx-fusion-surface__shape')?.get('fill')).toMatch(/^var\(--tx-fusion-surface-fill, var\(--tx-bg-color-overlay, /)
  })

  it('keeps bud content hidden until the loop has placed it', () => {
    // Server-rendered content would otherwise sit in the corner, off any surface.
    expect(find('.tx-fusion-surface__bud')?.get('opacity')).toBe('0')
    expect(find('.tx-fusion-surface__silhouette')?.get('pointer-events')).toBe('none')
  })
})
