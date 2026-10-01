import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'
import { STREAM_REVEAL_DURATION_MS } from '../src/presets'

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule
// that reads right in source can still land outside its media query.
const HERE = dirname(fileURLToPath(import.meta.url))
const TEXT_SFC = resolve(HERE, '../src/TxStreamText.vue')
const CARET_SFC = resolve(HERE, '../src/TxStreamCaret.vue')
const VARIABLES = resolve(HERE, '../../../style/variables.scss')
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)'

interface Rule {
  selector: string
  body: string
  media: string | null
}

function compile(sfc: string): string {
  const source = readFileSync(sfc, 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks.map(block => sass.compileString(block, { url: pathToFileURL(sfc), syntax: 'scss' }).css).join('\n')
}

/** Style rules with the media query they sit in; keyframe blocks are returned separately. */
function parse(css: string): { rules: Rule[], keyframes: Map<string, string> } {
  const rules: Rule[] = []
  const keyframes = new Map<string, string>()
  let i = 0
  const readBlock = (): string => {
    let depth = 1
    const start = i
    while (i < css.length && depth > 0) {
      if (css[i] === '{')
        depth++
      else if (css[i] === '}')
        depth--
      i++
    }
    return css.slice(start, i - 1)
  }
  const walk = (media: string | null, end: number) => {
    let prelude = ''
    while (i < end) {
      const char = css[i++]!
      if (char === '{') {
        const head = prelude.trim()
        prelude = ''
        if (head.startsWith('@keyframes')) {
          keyframes.set(head.replace('@keyframes', '').trim(), readBlock())
        }
        else if (head.startsWith('@media')) {
          const inner = readBlock()
          const saved = i
          const nested = parse(inner)
          nested.rules.forEach(rule => rules.push({ ...rule, media: head }))
          nested.keyframes.forEach((body, name) => keyframes.set(name, body))
          i = saved
        }
        else {
          rules.push({ selector: head, body: readBlock(), media })
        }
      }
      else if (char === '}') {
        prelude = ''
      }
      else {
        prelude += char
      }
    }
  }
  walk(null, css.length)
  return { rules, keyframes }
}

const text = parse(compile(TEXT_SFC))
const caret = parse(compile(CARET_SFC))
const all = [...text.rules, ...caret.rules]

function animationFor(selector: string): string {
  const rule = text.rules.find(entry => entry.selector === selector)
  expect(rule, selector).toBeDefined()
  return /animation:\s*([^;]+);/.exec(rule!.body)?.[1] ?? ''
}

describe('stream text styles', () => {
  it('declares every animation and transition only when motion is allowed', () => {
    const moving = all.filter(rule => /(^|[\s;])(animation|transition)\s*:/.test(rule.body))
    expect(moving.length).toBeGreaterThan(6)
    for (const rule of moving)
      expect(rule.media, rule.selector).toBe(NO_PREFERENCE)
  })

  it('plays each preset with its keyframes, and none plays nothing', () => {
    const word = (preset: string) => `.tx-stream-text.is-reveal-${preset} .tx-stream-text__word`
    expect(animationFor(word('aurora'))).toMatch(/tx-stream-fade-blur .*tx-stream-hue/)
    expect(animationFor(word('hue'))).toMatch(/tx-stream-fade .*tx-stream-hue/)
    expect(animationFor(word('blur'))).toMatch(/^tx-stream-fade-blur /)
    expect(animationFor(word('blur'))).not.toContain('tx-stream-hue')
    expect(animationFor(word('languid'))).toMatch(/^tx-stream-languid /)
    expect(text.rules.some(rule => rule.selector.includes('is-reveal-none'))).toBe(false)
    // Every preset with a rule reads its duration from the one the component writes.
    for (const preset of ['aurora', 'hue', 'blur', 'languid'])
      expect(animationFor(word(preset))).toContain('var(--tx-stream-reveal-duration')
  })

  it('keeps the TS duration table and the stylesheet on the same presets', () => {
    const styled = new Set(text.rules.map(rule => /is-reveal-([a-z]+)/.exec(rule.selector)?.[1]).filter(Boolean))
    const timed = Object.entries(STREAM_REVEAL_DURATION_MS).filter(([, ms]) => ms > 0).map(([name]) => name)
    expect([...styled].sort()).toEqual(timed.sort())
    expect(STREAM_REVEAL_DURATION_MS.none).toBe(0)
  })

  it('gives code the same entrances without the colour sweep', () => {
    // Compiled on its own, so the check does not depend on TxCodeStream's sheet.
    const code = parse(sass.compileString(
      '@use \'../../../style/mixins.scss\' as *;\n@include stream-reveal-keyframes(code);\n.code { @include stream-reveal-presets(\'.word\', code); }',
      { url: pathToFileURL(TEXT_SFC), syntax: 'scss' },
    ).css)
    expect(code.keyframes.has('tx-stream-hue')).toBe(false)
    expect(code.rules.map(rule => rule.body).join('')).not.toContain('tx-stream-hue')
    const aurora = code.rules.find(rule => rule.selector === '.code.is-reveal-aurora .word')
    expect(aurora?.media).toBe(NO_PREFERENCE)
    expect(aurora?.body).toMatch(/animation:\s*tx-stream-fade-blur /)
    expect(code.rules.every(rule => rule.media === NO_PREFERENCE)).toBe(true)
  })

  it('gives a sheet that animates only blocks just the block fade', () => {
    const block = parse(sass.compileString(
      '@use \'../../../style/mixins.scss\' as *;\n@include stream-reveal-keyframes(block);',
      { url: pathToFileURL(TEXT_SFC), syntax: 'scss' },
    ).css)
    expect([...block.keyframes.keys()]).toEqual(['tx-stream-fade-blur'])
  })

  it('sweeps the three reveal tokens and settles on the ink', () => {
    const hue = text.keyframes.get('tx-stream-hue') ?? ''
    expect(hue).toContain('var(--tx-stream-reveal-1')
    expect(hue).toContain('var(--tx-stream-reveal-2')
    expect(hue).toContain('var(--tx-stream-reveal-3')
    // No 100% stop: the animation ends on the element's own (inherited) colour.
    expect(hue).not.toMatch(/100%|\bto\b/)
  })

  it('loops the caret on the compositor, with nothing variable inside its keyframes', () => {
    for (const name of ['tx-stream-caret-orbit', 'tx-stream-caret-breath']) {
      const body = caret.keyframes.get(name) ?? ''
      expect(body, name).not.toBe('')
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1])
      expect(properties.every(property => ['rotate', 'scale', 'opacity'].includes(property!)), name).toBe(true)
      expect(body).not.toContain('var(')
    }
  })

  it('draws the caret from the logo tokens', () => {
    const stops = caret.rules.filter(rule => rule.selector.includes('tx-stream-caret__stop'))
    expect(stops.map(rule => rule.body).join('')).toMatch(/--tx-stream-caret-start[\s\S]*--tx-stream-caret-end/)
  })

  it('gives the caret no inline size, so lines break where the reserve copy breaks', () => {
    const box = text.rules.find(rule => rule.selector === '.tx-stream-text__caret')
    expect(box?.media).toBeNull()
    expect(box?.body).toMatch(/(^|[\s;])width:\s*0;/)
    // The caret itself hangs out of that box instead of widening it.
    expect(text.rules.find(rule => rule.selector === '.tx-stream-text__caret > *')?.body).toMatch(/position:\s*absolute/)
  })

  it('defines the stream tokens for light, dark and both high-contrast themes', () => {
    const scss = readFileSync(VARIABLES, 'utf8')
    const block = (opener: string) => {
      const start = scss.indexOf(opener)
      expect(start, opener).toBeGreaterThanOrEqual(0)
      return scss.slice(start, scss.indexOf('\n}', start))
    }
    for (const opener of [':root {\n  // Primary Colors', "[data-theme='dark'],\n.dark {"]) {
      const body = block(opener)
      for (const token of ['--tx-stream-reveal-1', '--tx-stream-reveal-2', '--tx-stream-reveal-3', '--tx-stream-caret-start', '--tx-stream-caret-end'])
        expect(body, `${opener} ${token}`).toContain(`${token}:`)
    }
    for (const opener of ['@mixin tx-high-contrast-light {', '@mixin tx-high-contrast-dark {']) {
      const body = block(opener)
      for (const token of ['--tx-stream-reveal-1', '--tx-stream-reveal-2', '--tx-stream-reveal-3'])
        expect(body, `${opener} ${token}`).toContain(`${token}: var(--tx-text-color-primary)`)
    }
  })
})
