import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule that
// reads right in source can still lose to a nesting or a specificity change.
const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxModeChip.vue')
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

const css = compileStyles()
const rules = parseRules(css)
const outside = rules.filter(rule => rule.media !== REDUCED)
const reduced = rules.filter(rule => rule.media === REDUCED)

describe('txModeChip motion contract', () => {
  it('positive control: the compile produced the chip, its morph and its guard', () => {
    expect(outside.some(rule => rule.selectors.includes('.tx-mode-chip'))).toBe(true)
    expect(outside.some(rule => transitioned(rule).includes('color'))).toBe(true)
    expect(reduced.length).toBeGreaterThan(0)
  })

  it('transitions fill and ink only while a morph is running', () => {
    // A hover is a sub-100ms interaction; easing its colour makes the chip trail the
    // pointer. `all` would carry colour in by the back door.
    for (const rule of outside) {
      const colour = transitioned(rule).filter(name => /^(?:all|color|background(?:-color)?)$/.test(name))
      if (!colour.length)
        continue
      for (const selector of rule.selectors)
        expect(selector, `${selector} transitions ${colour.join(', ')}`).toContain('.is-morphing')
    }
  })

  it('keeps colour out of the transformer layers it inherits ink through', () => {
    // TxTextTransformer's layers tween `color` on their own; inherited from a chip
    // whose hover changes ink, that tween would ease every hover.
    const layer = outside.find(rule => rule.selectors.includes('.tx-mode-chip__label :deep(.tx-text-transformer__layer)'))
    expect(layer?.declarations.get('transition-property')).toBe('opacity, filter')
  })

  it('switches colour on hover without any transition of its own', () => {
    const hovers = outside.filter(rule => rule.selectors.some(selector => selector.includes(':hover')))
    expect(hovers.length).toBeGreaterThan(0)
    for (const rule of hovers)
      expect(transitioned(rule), rule.selectors.join(', ')).toEqual([])
  })

  it('answers every tween with a reduced-motion stop', () => {
    const stopped = reduced
      .filter(rule => rule.declarations.get('transition') === 'none')
      .flatMap(rule => rule.selectors)

    for (const rule of outside.filter(rule => transitioned(rule).length || rule.declarations.has('transition-duration'))) {
      for (const selector of rule.selectors) {
        // The outgoing layer's shorter duration is stopped by the rule that stops every layer.
        expect(stopped, selector).toContain(selector.replace('__layer--prev', '__layer'))
      }
    }
  })

  it('lands the icon swap on its end state under reduced motion', () => {
    // Vue holds enter-from / leave-active for two frames before it measures a
    // transition; the incoming glyph must be visible and the outgoing one gone.
    const enter = reduced.find(rule => rule.selectors.includes('.tx-mode-chip-icon-enter-from'))
    expect(enter?.declarations.get('opacity')).toBe('1')
    expect(enter?.declarations.get('transform')).toBe('none')

    for (const rule of reduced.filter(rule => rule.declarations.get('opacity') === '0'))
      expect(rule.selectors).toEqual(['.tx-mode-chip-icon-leave-active'])
  })

  it('tints each tone with its -light-9 fill under the measured ink', () => {
    const tone = (name: string) => outside.find(rule => rule.selectors.includes(`.tx-mode-chip.is-${name}`))!.declarations
    // The shares are the ones the SFC's contrast table was measured with: re-measure
    // before changing either side of this.
    const expected = {
      success: ['success', 45],
      warning: ['warning', 45],
      danger: ['danger', 55],
      info: ['primary', 50],
    } as const
    for (const [name, [hue, share]] of Object.entries(expected)) {
      expect(tone(name).get('--tx-mode-chip-fill'), name).toContain(`var(--tx-color-${hue}-light-9`)
      expect(tone(name).get('--tx-mode-chip-ink'), name).toMatch(
        new RegExp(`^color-mix\\(in srgb, var\\(--tx-color-${hue}, #[0-9a-f]{6}\\) ${share}%, var\\(--tx-text-color-primary, #[0-9a-f]{6}\\)\\)$`),
      )
      // A tone keeps its ink on hover; only the fill deepens.
      expect(tone(name).has('--tx-mode-chip-ink-hover'), name).toBe(false)
    }

    const base = outside.find(rule => rule.selectors.includes('.tx-mode-chip'))!.declarations
    expect(base.get('--tx-mode-chip-fill')).toBe('transparent')
    // Not the secondary grey: it measures 2.87:1 on the composer tray.
    expect(base.get('--tx-mode-chip-ink')).toContain('var(--tx-text-color-regular')
    expect(tone('muted').get('--tx-mode-chip-ink-hover')).toContain('var(--tx-text-color-primary')
  })

  it('gives every var() a fallback', () => {
    // A host that loads the component's CSS without variables.scss still gets colour.
    expect(css.match(/var\(--[\w-]+\)/g) ?? []).toEqual([])
  })
})
