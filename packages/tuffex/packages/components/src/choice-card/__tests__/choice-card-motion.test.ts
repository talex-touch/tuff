import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule that
// reads right in source can still lose to a nesting or a specificity change.
const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxChoiceCard.vue')
const REDUCED = '@media (prefers-reduced-motion: reduce)'
const MOTION = '@media (prefers-reduced-motion: no-preference)'
const CONTAINER = '@container tx-choice-card (width >= 480px)'

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

/** The value with every `var(…)` removed, fallbacks included: what is left is what the stylesheet says outright. */
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
const styleRules = rules.filter(rule => !rule.media?.startsWith('@keyframes'))
const outside = styleRules.filter(rule => rule.media !== REDUCED)
const reduced = styleRules.filter(rule => rule.media === REDUCED)
const gated = styleRules.filter(rule => rule.media === MOTION)
const keyframes = rules.filter(rule => rule.media?.startsWith('@keyframes'))

/**
 * What the top-level rules naming `selector` declare between them, later rules winning.
 * The sheet groups shared declarations (the two buttons' reset, the regular ink), so one
 * rule alone is not what an element gets.
 */
function find(selector: string): Map<string, string> | undefined {
  const matching = styleRules.filter(rule => rule.media === null && rule.selectors.includes(selector))
  if (!matching.length)
    return undefined
  const merged = new Map<string, string>()
  for (const rule of matching) {
    for (const [property, value] of rule.declarations)
      merged.set(property, value)
  }
  return merged
}

describe('txChoiceCard style contract', () => {
  it('positive control: the compile produced the card, its rows, both entrances and their gate', () => {
    for (const selector of ['.tx-choice-card', '.tx-choice-card__option', '.tx-choice-card__title', '.tx-choice-card__desc'])
      expect(find(selector), selector).toBeDefined()
    expect(keyframes.length).toBeGreaterThan(0)
    expect(gated.filter(rule => rule.declarations.has('animation'))).toHaveLength(2)
  })

  it('never transitions colour, and changes it on hover at once', () => {
    // A hover is a sub-100ms interaction; easing its colour makes the row trail the pointer.
    for (const rule of styleRules) {
      const colour = transitioned(rule).filter(name => /^(?:all|color|background(?:-color)?|border(?:-color)?|box-shadow)$/.test(name))
      expect(colour, rule.selectors.join(', ')).toEqual([])
    }

    const hovers = outside.filter(rule => rule.selectors.some(selector => selector.includes(':hover')))
    expect(hovers.length).toBeGreaterThan(0)
    for (const rule of hovers) {
      expect(transitioned(rule), rule.selectors.join(', ')).toEqual([])
      expect(rule.declarations.has('background-color'), rule.selectors.join(', ')).toBe(true)
    }
  })

  it('declares motion only under prefers-reduced-motion: no-preference', () => {
    // The opt-in form of the reduced-motion escape (as in TxStatCard): under `reduce` there
    // is no animation to cancel. Anything animated outside the gate needs a `reduce` stop.
    const stopped = reduced
      .filter(rule => rule.declarations.get('animation') === 'none' || rule.declarations.get('transition') === 'none')
      .flatMap(rule => rule.selectors)

    const moving = (rule: Rule) => rule.declarations.has('animation') || rule.declarations.has('animation-name') || transitioned(rule).length > 0
    expect(gated.filter(moving).length).toBeGreaterThan(0)
    for (const rule of styleRules.filter(rule => rule.media !== MOTION && rule.media !== REDUCED && moving(rule))) {
      for (const selector of rule.selectors)
        expect(stopped, selector).toContain(selector)
    }
  })

  it('animates only from a start frame, so the resting style is the end frame', () => {
    // Dropping an animation under reduced motion then leaves the rows placed and visible.
    expect(keyframes.length).toBeGreaterThan(0)
    for (const rule of keyframes)
      expect(rule.selectors, rule.media!).toEqual(['from'])
  })

  it('takes every colour from a --tx-* token, with a fallback', () => {
    // A host that loads the component's CSS without variables.scss still gets colour.
    expect(css.match(/var\(--[\w-]+\)/g) ?? []).toEqual([])
    for (const name of css.matchAll(/var\((--[\w-]+)/g))
      expect(name[1]!.startsWith('--tx-'), name[1]).toBe(true)

    for (const rule of rules) {
      for (const [property, value] of rule.declarations) {
        const bare = withoutVars(value)
        // `color-mix()` of tokens is allowed; a literal inside it is not, and withoutVars
        // leaves any literal behind.
        expect(bare, `${rule.selectors.join(', ')} { ${property} }`).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(|\b(?:white|black|red|blue|green|gray|grey)\b/i)
      }
    }
  })

  it('fills rows with the light fill and deepens it one step on hover', () => {
    expect(find('.tx-choice-card__option')?.get('background')).toMatch(/^var\(--tx-fill-color-light, /)
    // `:enabled`, not `:not(:disabled)`: the same for a button, and the skeleton's plain
    // row boxes never match it.
    expect(find('.tx-choice-card__option:enabled:hover')?.get('background-color')).toMatch(/^var\(--tx-fill-color, /)
  })

  it('backs the card with an opaque surface and a ring, not a border', () => {
    const card = find('.tx-choice-card')!
    expect(card.get('background')).toMatch(/^var\(--tx-bg-color, /)
    expect(card.get('box-shadow')).toMatch(/^0 0 0 1px var\(--tx-border-color-lighter, /)
    for (const rule of styleRules) {
      const border = rule.declarations.get('border')
      if (border !== undefined)
        expect(border, rule.selectors.join(', ')).toBe('0')
    }
  })

  it('keeps the card corner concentric with the option corner', () => {
    expect(find('.tx-choice-card')?.get('padding')).toBe('var(--tx-choice-card-pad, 8px)')
    expect(find('.tx-choice-card')?.get('border-radius')).toBe('calc(var(--tx-choice-card-option-radius, 10px) + var(--tx-choice-card-pad, 8px))')
    expect(find('.tx-choice-card__option')?.get('border-radius')).toBe('var(--tx-choice-card-option-radius, 10px)')
  })

  it('sets the type scale: 14/600 question, 14/500 label, 12px description in regular ink', () => {
    expect(find('.tx-choice-card__title')?.get('font-size')).toBe('14px')
    expect(find('.tx-choice-card__title')?.get('font-weight')).toBe('600')
    expect(find('.tx-choice-card__label')?.get('font-size')).toBe('14px')
    expect(find('.tx-choice-card__label')?.get('font-weight')).toBe('500')
    expect(find('.tx-choice-card__desc')?.get('font-size')).toBe('12px')
    // Not the secondary grey: it measures 2.87:1 on the row fill.
    expect(find('.tx-choice-card__desc')?.get('color')).toMatch(/^var\(--tx-text-color-regular, /)

    for (const rule of styleRules) {
      expect(rule.declarations.has('letter-spacing'), rule.selectors.join(', ')).toBe(false)
      expect(rule.declarations.get('font-weight'), rule.selectors.join(', ')).not.toBe('700')
    }
  })

  it('lays out two columns only from a 480px card up', () => {
    expect(find('.tx-choice-card')?.get('container')).toBe('tx-choice-card/inline-size')
    expect(find('.tx-choice-card__options')?.get('grid-template-columns')).toBe('minmax(0, 1fr)')
    // No unconditional two-column rule: below 480px the one-column base is what applies.
    expect(find('.tx-choice-card.is-two-columns .tx-choice-card__options')).toBeUndefined()

    const wide = styleRules.find(rule => rule.media === CONTAINER && rule.selectors.includes('.tx-choice-card.is-two-columns .tx-choice-card__options'))
    expect(wide?.declarations.get('grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('gives every control a pointer and a visible focus ring', () => {
    for (const selector of ['.tx-choice-card__option', '.tx-choice-card__nav']) {
      expect(find(selector)?.get('cursor'), selector).toBe('pointer')
      expect(find(`${selector}:focus-visible`)?.get('outline'), selector).toMatch(/^2px solid var\(--tx-color-primary, /)
    }
  })
})
