import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: a rule that reads right in source can still
// land outside its media query once the mixins expand.
const HERE = dirname(fileURLToPath(import.meta.url))
const SFC = resolve(HERE, '../src/TxCodeStream.vue')
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
function parse(css: string, media: string | null = null): { rules: Rule[], keyframes: Map<string, string> } {
  const rules: Rule[] = []
  const keyframes = new Map<string, string>()
  let index = 0
  const readBlock = (): string => {
    let depth = 1
    const start = index
    while (index < css.length && depth > 0) {
      if (css[index] === '{')
        depth++
      else if (css[index] === '}')
        depth--
      index++
    }
    return css.slice(start, index - 1)
  }
  let prelude = ''
  while (index < css.length) {
    const char = css[index++]!
    if (char === '{') {
      const head = prelude.trim()
      prelude = ''
      const block = readBlock()
      if (head.startsWith('@keyframes')) {
        keyframes.set(head.replace('@keyframes', '').trim(), block)
      }
      else if (head.startsWith('@media')) {
        const nested = parse(block, head)
        rules.push(...nested.rules)
        nested.keyframes.forEach((body, name) => keyframes.set(name, body))
      }
      else {
        rules.push({ selector: head, body: block, media })
      }
    }
    else if (char === '}') {
      prelude = ''
    }
    else {
      prelude += char
    }
  }
  return { rules, keyframes }
}

const { rules, keyframes } = parse(compile(SFC))

function rule(selector: string): Rule {
  const found = rules.find(entry => entry.selector === selector)
  expect(found, selector).toBeDefined()
  return found!
}

describe('code stream styles', () => {
  it('starts every animation and transition only when motion is allowed', () => {
    const moving = rules.filter(entry => /(^|[\s;])(animation|transition)\s*:(?!\s*none\b)/.test(entry.body))
    expect(moving.length).toBeGreaterThanOrEqual(8)
    for (const entry of moving)
      expect(entry.media, entry.selector).toBe(NO_PREFERENCE)
    // The copy button's own transition is switched off outside that block, not left to run.
    expect(rule('.tx-bui-code-stream .tx-bui-code-stream__copy.tx-copy-button').body).toMatch(/transition:\s*none/)
  })

  it('plays the lines\' entrance only outside streaming mode, where the words carry it', () => {
    const lineEntrance = rules.filter(entry => entry.body.includes('tx-bui-fade-up'))
    expect(lineEntrance.map(entry => entry.selector)).toEqual(['.tx-bui-code-stream:not(.is-live) .tx-bui-code-stream__line'])
  })

  it('enters streamed code words without the colour sweep', () => {
    const word = (preset: string) => `.tx-bui-code-stream.is-reveal-${preset} .tx-bui-code-stream__fresh`
    expect(rule(word('aurora')).body).toMatch(/animation:\s*tx-stream-fade-blur /)
    expect(rule(word('hue')).body).toMatch(/animation:\s*tx-stream-fade /)
    expect(rule(word('languid')).body).toMatch(/animation:\s*tx-stream-languid /)
    expect(keyframes.has('tx-stream-hue')).toBe(false)
    expect(rules.some(entry => entry.body.includes('tx-stream-hue'))).toBe(false)
  })

  it('gives the stream caret no inline size, so the line is as wide as its code', () => {
    const box = rule('.tx-bui-code-stream .tx-bui-code-stream__stream-caret')
    expect(box.media).toBeNull()
    expect(box.body).toMatch(/(^|[\s;])width:\s*0;/)
    expect(rule('.tx-bui-code-stream .tx-bui-code-stream__stream-caret > *').body).toMatch(/position:\s*absolute/)
  })
})
