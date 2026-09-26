import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * The toolbar's motion rules, read from the compiled stylesheets — vitest never compiles `<style>`,
 * and a rule that reads right in source can still land outside the block it was meant for:
 *
 * - a hover changes colour at once, so fill / ink / ring transition only under `.is-morphing`
 *   (`tuffex-design-rules.md` › Motion);
 * - every transition and animation is declared inside `prefers-reduced-motion: no-preference`, so
 *   reduced motion never starts one and each element rests in its declared, final style — the one
 *   form this directory uses (the same rule's inverse form, as TxChoiceCard does).
 */
const DIR = dirname(fileURLToPath(import.meta.url))
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)'
const COLOUR =
  /^(?:all|color|background|background-color|border-color|outline-color|box-shadow|fill|stroke)$/

interface Rule {
  file: string
  selectors: string[]
  declarations: Map<string, string>
  atRules: string[]
}

function compile(file: string): string {
  const source = readFileSync(resolve(DIR, file), 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
    (match) => match[1] ?? ''
  )
  return (
    blocks
      .map(
        (block) =>
          sass.compileString(block, { url: pathToFileURL(resolve(DIR, file)), syntax: 'scss' }).css
      )
      .join('\n')
      // Loud comments would ride into the next selector, and non-ASCII copy makes Sass open with a
      // `@charset` statement the brace parser below would take for a block.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@charset[^;]*;/g, '')
  )
}

/** Flat rules with every at-rule they sit in. Sass's expanded output never nests braces in a declaration. */
function parse(file: string, css: string): Rule[] {
  const rules: Rule[] = []
  const atRules: string[] = []
  let prelude = ''
  let index = 0
  while (index < css.length) {
    const char = css[index++]!
    if (char === '{') {
      const head = prelude.trim()
      prelude = ''
      if (head.startsWith('@')) {
        atRules.push(head)
        continue
      }
      const end = css.indexOf('}', index)
      const declarations = new Map<string, string>()
      for (const part of css.slice(index, end).split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
      }
      rules.push({
        file,
        selectors: head.split(',').map((s) => s.trim()),
        declarations,
        atRules: [...atRules]
      })
      index = end + 1
    } else if (char === '}') {
      atRules.pop()
      prelude = ''
    } else {
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
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  out.push(current.trim())
  return out
}

function transitioned(rule: Rule): string[] {
  const names: string[] = []
  const shorthand = rule.declarations.get('transition')
  if (shorthand && shorthand !== 'none')
    names.push(...splitList(shorthand).map((item) => item.split(/\s+/)[0]!))
  const property = rule.declarations.get('transition-property')
  if (property) names.push(...splitList(property))
  return names
}

const files = readdirSync(DIR).filter((name) => name.endsWith('.vue'))
const rules = files.flatMap((file) => parse(file, compile(file)))
const insideKeyframes = (rule: Rule): boolean =>
  rule.atRules.some((at) => at.startsWith('@keyframes'))
const styleRules = rules.filter((rule) => !insideKeyframes(rule))

describe('composer toolbar style contract', () => {
  it('positive control: every SFC compiled, and the rules under test exist', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'ComposerChip.vue',
        'ComposerControl.vue',
        'ComposerMic.vue',
        'ComposerModelPill.vue',
        'ComposerSendIsland.vue',
        'ComposerToolbar.vue'
      ])
    )
    for (const file of ['ComposerChip.vue', 'ComposerSendIsland.vue', 'ComposerMic.vue']) {
      const morphs = styleRules.filter(
        (rule) =>
          rule.file === file &&
          transitioned(rule).some((name) => COLOUR.test(name)) &&
          rule.selectors.every((selector) => selector.includes('.is-morphing'))
      )
      expect(morphs.length, `${file} recolours under .is-morphing`).toBeGreaterThan(0)
    }
    expect(styleRules.some((rule) => rule.declarations.has('animation'))).toBe(true)
  })

  it('eases fill, ink and ring only while a state change is morphing', () => {
    for (const rule of styleRules) {
      const colour = transitioned(rule).filter((name) => COLOUR.test(name))
      if (!colour.length) continue
      for (const selector of rule.selectors) {
        expect(selector, `${rule.file}: ${selector} transitions ${colour.join(', ')}`).toContain(
          '.is-morphing'
        )
      }
    }
  })

  it('changes colour on hover without any transition of its own', () => {
    const hovers = styleRules.filter((rule) =>
      rule.selectors.some((selector) => selector.includes(':hover'))
    )
    expect(hovers.length).toBeGreaterThan(0)
    for (const rule of hovers) {
      expect(transitioned(rule), `${rule.file}: ${rule.selectors.join(', ')}`).toEqual([])
      expect(rule.declarations.has('animation'), rule.selectors.join(', ')).toBe(false)
    }
  })

  it('declares every transition and animation inside prefers-reduced-motion: no-preference', () => {
    const moving = styleRules.filter((rule) =>
      [...rule.declarations.keys()].some((name) => /^(?:transition|animation)(?:-|$)/.test(name))
    )
    expect(moving.length).toBeGreaterThan(0)
    for (const rule of moving) {
      expect(rule.atRules, `${rule.file}: ${rule.selectors.join(', ')}`).toContain(NO_PREFERENCE)
    }
  })

  it('keeps the two slots a fixed 32×32 that never participates in the morph', () => {
    const slot = styleRules.find(
      (rule) =>
        rule.file === 'ComposerToolbar.vue' &&
        rule.selectors.includes('.ComposerToolbar-MicSlot') &&
        rule.selectors.includes('.ComposerToolbar-SendSlot')
    )
    expect(slot?.declarations.get('width')).toBe('32px')
    expect(slot?.declarations.get('height')).toBe('32px')
    expect(slot?.declarations.get('flex')).toBe('none')
    // The keys inside them are absolutely placed at the slot's right edge.
    for (const [file, selector] of [
      ['ComposerSendIsland.vue', '.ComposerSendIsland'],
      ['ComposerMic.vue', '.ComposerMic']
    ] as const) {
      const key = styleRules.find((rule) => rule.file === file && rule.selectors.includes(selector))
      expect(key?.declarations.get('position'), selector).toBe('absolute')
      expect(key?.declarations.get('right'), selector).toBe('0')
    }
  })

  it('casts every shadow from the one top-left light source (x:y = 1:2)', () => {
    for (const rule of styleRules) {
      for (const [name, value] of rule.declarations) {
        if (!/shadow$/.test(name) || /^inset\b/.test(value)) continue
        for (const layer of splitList(value)) {
          const lengths = [...layer.matchAll(/(-?\d*\.?\d+)px/g)].map((match) => Number(match[1]))
          if (lengths.length < 2 || (lengths[0] === 0 && lengths[1] === 0)) continue
          expect(lengths[1], `${rule.file}: ${name}: ${layer}`).toBe(lengths[0]! * 2)
        }
      }
    }
  })
})
