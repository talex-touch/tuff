import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxStreamMarkdown from '../src/TxStreamMarkdown.vue'

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
  },
}))

vi.mock('../src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

enableAutoUnmount(afterEach)

// jsdom's Range has no geometry; the caret tests give it some and this puts it back.
const RANGE_RECTS = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')

afterEach(() => {
  vi.restoreAllMocks()
  if (RANGE_RECTS)
    Object.defineProperty(Range.prototype, 'getClientRects', RANGE_RECTS)
  else
    delete (Range.prototype as { getClientRects?: unknown }).getClientRects
})

async function flushSanitizer(): Promise<void> {
  await flushPromises()
  await nextTick()
}

// ---------------------------------------------------------------------------
// Compiled CSS, not source: a rule that reads right in source can still land
// outside its media query once the mixins expand.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const SFC = resolve(HERE, '../src/TxStreamMarkdown.vue')
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
      else if (head.startsWith('@media') || head.startsWith('@supports')) {
        const nested = parse(block, head)
        rules.push(...nested.rules)
        nested.keyframes.forEach((body, name) => keyframes.set(name, body))
      }
      else if (!head.startsWith('@')) {
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

describe('stream markdown motion styles', () => {
  it('starts every animation and transition only when motion is allowed', () => {
    const moving = rules.filter(entry => /(^|[\s;])(animation|transition)\s*:(?!\s*none\b)/.test(entry.body))
    expect(moving.length).toBeGreaterThanOrEqual(8)
    for (const entry of moving)
      expect(entry.media, entry.selector).toBe(NO_PREFERENCE)
  })

  it('enters fresh text with the family presets, colour sweep included', () => {
    const fresh = (preset: string) => rule(`.tx-stream-md.is-reveal-${preset} .tx-stream-md__fresh`).body
    expect(fresh('aurora')).toMatch(/tx-stream-fade-blur .*tx-stream-hue/)
    expect(fresh('hue')).toMatch(/tx-stream-fade .*tx-stream-hue/)
    expect(fresh('blur')).not.toContain('tx-stream-hue')
    expect(keyframes.has('tx-stream-hue')).toBe(true)
  })

  it('keeps a languid chunk inline, since a chunk runs across words and has to wrap', () => {
    const inline = rules.filter(entry => entry.selector === '.tx-stream-md.is-reveal-languid .tx-stream-md__fresh' && /display:\s*inline;/.test(entry.body))
    expect(inline).toHaveLength(1)
    // Outside the media query and after it, so it wins over the preset's inline-block.
    expect(inline[0]!.media).toBeNull()
  })

  it('enters new blocks once, while streaming, with the shared keyframes', () => {
    const block = rule('.tx-stream-md.is-streaming:not(.is-reveal-none) .tx-stream-md__block')
    expect(block.media).toBe(NO_PREFERENCE)
    expect(block.body).toMatch(/animation:\s*tx-stream-fade-blur var\(--tx-stream-reveal-duration/)
  })

  it('draws no orb: the caret is the Tuff caret, not a pseudo-element', () => {
    expect([...keyframes.keys()].some(name => name.startsWith('tx-stream-md-'))).toBe(false)
    const pseudo = rules.filter(entry => /tx-stream-md__(?:markup--tail|cursor)[^,{]*::?(?:after|before)/.test(entry.selector))
    expect(pseudo).toEqual([])
    expect(rules.some(entry => entry.body.includes('radial-gradient'))).toBe(false)
  })

  it('gives the caret no size, so nothing reflows around it', () => {
    const caret = rule('.tx-stream-md .tx-stream-md__caret')
    expect(caret.media).toBeNull()
    expect(caret.body).toMatch(/position:\s*absolute/)
    expect(caret.body).toMatch(/width:\s*0;/)
    expect(caret.body).toMatch(/height:\s*0;/)
  })
})

// ---------------------------------------------------------------------------
// Caret placement. jsdom has no layout, so the geometry is stubbed: the text
// ends at a known rect and the root sits at a known origin.
// ---------------------------------------------------------------------------

const ROOT = { left: 20, top: 10 }

function stubGeometry(end: { right: number, top: number, height: number }, cursorLine = { left: 24, top: 200 }, heading = { left: 30, top: 80 }): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = this.classList.contains('tx-stream-md')
      ? { left: ROOT.left, top: ROOT.top }
      : this.classList.contains('tx-stream-md__cursor')
        ? cursorLine
        : /^H[1-6]$/.test(this.tagName) ? heading : { left: 0, top: 0 }
    return { ...box, right: box.left, bottom: box.top, width: 0, height: 0, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect
  })
  const rect = { left: end.right - 8, right: end.right, top: end.top, bottom: end.top + end.height, width: 8, height: end.height, x: end.right - 8, y: end.top, toJSON: () => ({}) }
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => Object.assign([rect], { item: (i: number) => (i === 0 ? rect : null) }),
  })
}

async function frames(): Promise<void> {
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
  await nextTick()
}

function caretOffset(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.find('.tx-stream-md__caret').element as HTMLElement).style.translate
}

describe('stream markdown caret', () => {
  it('shows one Tuff caret while streaming, and none once settled or before any content', async () => {
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Streaming paragraph', streaming: true } })
    await flushSanitizer()
    expect(wrapper.findAll('.tx-stream-md__caret')).toHaveLength(1)
    expect(wrapper.find('.tx-stream-md__caret .tx-stream-caret').exists()).toBe(true)

    await wrapper.setProps({ streaming: false })
    await flushSanitizer()
    expect(wrapper.find('.tx-stream-md__caret').exists()).toBe(false)

    const empty = mount(TxStreamMarkdown, { props: { content: '', streaming: true } })
    await flushSanitizer()
    expect(empty.find('.tx-stream-md__caret').exists()).toBe(false)
  })

  it('removes a caret switched off at once, and retracts it when the stream ends', async () => {
    // Real transitions: the stub removes a leaving caret at once either way.
    const live = () => mount(TxStreamMarkdown, { props: { content: 'Streaming paragraph', streaming: true }, global: { stubs: { transition: false } } })
    const off = live()
    await flushSanitizer()
    await off.setProps({ caret: false })
    expect(off.find('.tx-stream-md__caret').exists()).toBe(false)
    const ended = live()
    await flushSanitizer()
    await ended.setProps({ streaming: false })
    expect(ended.find('.tx-stream-md-caret-leave-active').exists()).toBe(true)
  })

  it('sits after the last character of a paragraph tail', async () => {
    stubGeometry({ right: 140, top: 50, height: 20 })
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'A paragraph that is still being written', streaming: true } })
    await flushSanitizer()
    await frames()
    // x = 140 - 20; y = centre of the line (50 + 10) - 10.
    expect(caretOffset(wrapper)).toBe('120.0px 50.0px')
    // Positioned by `translate`, so the enter/leave `scale` grows it in place.
    expect((wrapper.find('.tx-stream-md__caret').element as HTMLElement).style.transform).toBe('')
  })

  it('sits on the block cursor line when the tail is a fence', async () => {
    stubGeometry({ right: 140, top: 50, height: 20 }, { left: 24, top: 200 })
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Intro\n\n```js\nconst a = 1', streaming: true } })
    await flushSanitizer()
    await frames()
    expect(wrapper.find('.tx-stream-md__cursor').exists()).toBe(true)
    // jsdom resolves no line-height, so the anchor is the line's top edge.
    expect(caretOffset(wrapper)).toBe('4.0px 190.0px')
  })

  it('waits at the start of a block that has opened but holds no words yet', async () => {
    stubGeometry({ right: 140, top: 50, height: 20 })
    // Only the heading marker has arrived: an empty heading is the tail.
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => Object.assign([], { item: () => null }) })
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Intro paragraph\n\n## ', streaming: true } })
    await flushSanitizer()
    await frames()
    expect(wrapper.find('.tx-stream-md__markup--tail h2').exists()).toBe(true)
    // x = 30 - 20; y = the heading's top (jsdom resolves no line-height) - 10.
    expect(caretOffset(wrapper)).toBe('10.0px 70.0px')
  })

  it('moves the same caret element as the write head changes element', async () => {
    stubGeometry({ right: 140, top: 50, height: 20 })
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Intro paragraph', streaming: true } })
    await flushSanitizer()
    await frames()
    const caret = wrapper.find('.tx-stream-md__caret').element

    await wrapper.setProps({ content: 'Intro paragraph\n\n```js\nconst a = 1' })
    await flushSanitizer()
    await frames()
    expect(wrapper.find('.tx-stream-md__caret').element).toBe(caret)
    expect(caretOffset(wrapper)).toBe('4.0px 190.0px')
  })
})

describe('stream markdown reveal preset', () => {
  it('writes the preset onto the root, aurora by default', async () => {
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Hello', streaming: true } })
    await flushSanitizer()
    expect(wrapper.classes()).toContain('is-reveal-aurora')
    expect(wrapper.attributes('style')).toContain('--tx-stream-reveal-duration: 460ms')

    await wrapper.setProps({ reveal: 'hue' })
    expect(wrapper.classes()).toContain('is-reveal-hue')
    expect(wrapper.attributes('style')).toContain('--tx-stream-reveal-duration: 180ms')
  })

  it('under reduced motion plays no preset', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    const wrapper = mount(TxStreamMarkdown, { props: { content: 'Hello there', streaming: true } })
    await flushSanitizer()
    expect(wrapper.classes()).toContain('is-reveal-none')
    expect(wrapper.find('.tx-stream-md__fresh').exists()).toBe(false)
  })
})
