import type { ContextChunk } from '../src/types'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxContextChunk from '../src/TxContextChunk.vue'

// Assertions run against the *compiled* style block, not the source text: a
// component can keep its `@include` and still lose the guard if the shared
// mixin changes, and matching on source would not notice.
const here = dirname(fileURLToPath(import.meta.url))

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

const ANIMATED_COMPONENTS = [
  ['TxContextChunk', resolve(here, '../src/TxContextChunk.vue')],
  ['TxContextCards', resolve(here, '../src/TxContextCards.vue')],
  ['TxSidebarNav', resolve(here, '../../sidebar-nav/src/TxSidebarNav.vue')],
  ['TxSearchPanel', resolve(here, '../../search-panel/src/TxSearchPanel.vue')],
] as const

function compileStyles(vuePath: string): string {
  const source = readFileSync(vuePath, 'utf8')
  const blocks = [...source.matchAll(STYLE_BLOCK_RE)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(block => sass.compileString(block, {
      url: pathToFileURL(vuePath),
      syntax: 'scss',
    }).css)
    .join('\n')
}

const chunk: ContextChunk = {
  id: 'c1',
  title: 'Vendor onboarding rule',
  chars: '290 characters',
  body: 'Cold-chain certification must be verified.',
  source: { name: 'Dairy Onboarding SOP.pdf', badge: 'PDF', tone: 'red' },
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bUI motion contract', () => {
  it.each(ANIMATED_COMPONENTS)('%s guards its motion behind prefers-reduced-motion', (_name, path) => {
    const css = compileStyles(path)

    expect(css).toContain('prefers-reduced-motion: reduce')
    // Every animation the component paints must be answered by a stop, or the
    // guard is decorative.
    const animated = css.match(/animation:\s*tx-bui-[\w-]+/g) ?? []
    expect(animated.length).toBeGreaterThan(0)
    expect(css).toMatch(/animation:\s*none/)
  })

  it.each(ANIMATED_COMPONENTS)('%s never hides content inside the reduced-motion block', (_name, path) => {
    const css = compileStyles(path)
    const blocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    expect(blocks.length).toBeGreaterThan(0)

    for (const block of blocks) {
      expect(block).not.toMatch(/display:\s*none/)
      expect(block).not.toMatch(/visibility:\s*hidden/)
      // Reducing motion must not leave anything invisible: upstream's global
      // rule only squashes durations, so a delayed reveal would become a gap.
      expect(block).not.toMatch(/opacity:\s*0[;\s}]/)
    }
  })

  it('restores the chip that rests at opacity 0 instead of leaving it to the timer', () => {
    const css = compileStyles(resolve(here, '../src/TxContextChunk.vue'))

    // The chip's resting style is transparent by design — the reduced-motion
    // block is the only thing that can make it unconditionally visible.
    expect(css).toMatch(/\.tx-bui-context-chunk__source\s*\{[^}]*opacity:\s*0/)
    const reduced = (css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []).join('\n')
    expect(reduced).toMatch(/\.tx-bui-context-chunk__source\s*\{[^}]*opacity:\s*1/)
    expect(reduced).toMatch(/\.tx-bui-context-chunk__source\s*\{[^}]*transform:\s*none/)
  })
})

describe('txContextChunk under reduced motion', () => {
  it('settles the source chip immediately rather than waiting out the delay', () => {
    stubReducedMotion(true)
    vi.useFakeTimers()

    const wrapper = mount(TxContextChunk, { props: { chunk, chipDelay: 700 } })

    // No timer may be pending: the reveal has to be instant, not merely fast.
    expect(vi.getTimerCount()).toBe(0)
    expect(wrapper.find('.tx-bui-context-chunk__source').classes()).toContain('is-settled')
  })

  it('still runs the delay when motion is allowed', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()

    const wrapper = mount(TxContextChunk, { props: { chunk, chipDelay: 700 } })

    expect(vi.getTimerCount()).toBe(1)
    expect(wrapper.find('.tx-bui-context-chunk__source').classes()).not.toContain('is-settled')
  })

  it('clears its pending timer on unmount', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()

    const wrapper = mount(TxContextChunk, { props: { chunk, chipDelay: 700 } })
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
