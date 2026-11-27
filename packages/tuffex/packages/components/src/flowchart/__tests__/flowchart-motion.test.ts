import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxFlowchart.vue')
const REDUCED = '@media (prefers-reduced-motion: reduce)'
const MOTION = '@media (prefers-reduced-motion: no-preference)'

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
const styleRules = rules.filter(rule => !rule.media?.startsWith('@keyframes'))
const outside = styleRules.filter(rule => rule.media !== REDUCED)
const reduced = styleRules.filter(rule => rule.media === REDUCED)
const gated = styleRules.filter(rule => rule.media === MOTION)

describe('txFlowchart style & motion contract', () => {
  it('gates all looping animations inside prefers-reduced-motion: no-preference', () => {
    const animatedOutside = styleRules.filter(
      rule => rule.media !== MOTION && (rule.declarations.has('animation') || rule.declarations.has('animation-name')),
    )
    expect(animatedOutside).toEqual([])
    expect(gated.filter(rule => rule.declarations.has('animation')).length).toBeGreaterThanOrEqual(3)
  })

  it('never transitions hover colours and answers every transition with a reduced-motion stop', () => {
    for (const rule of styleRules) {
      const colour = transitioned(rule).filter(name => /^(?:all|color|background(?:-color)?|border(?:-color)?)$/.test(name))
      expect(colour, rule.selectors.join(', ')).toEqual([])
    }

    const stopped = reduced
      .filter(rule => rule.declarations.get('transition') === 'none')
      .flatMap(rule => rule.selectors)

    for (const rule of outside.filter(rule => transitioned(rule).length > 0)) {
      for (const selector of rule.selectors)
        expect(stopped, selector).toContain(selector)
    }
  })

  it('uses ring shadows instead of layout borders and supplies a fallback on every var()', () => {
    expect(css.match(/var\(--[\w-]+\)/g) ?? []).toEqual([])
    for (const rule of styleRules) {
      const border = rule.declarations.get('border')
      if (border !== undefined)
        expect(border, rule.selectors.join(', ')).toBe('0')
    }
  })
})
