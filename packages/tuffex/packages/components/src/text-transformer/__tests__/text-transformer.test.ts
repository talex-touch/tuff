import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxTextTransformer from '../src/TxTextTransformer.vue'

const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxTextTransformer.vue')

// vitest never compiles `<style>`, so the stylesheet is compiled here and the
// assertions run against what would ship.
function compileStyles(): string {
  const source = readFileSync(SFC, 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map(block => sass.compileString(block, { url: pathToFileURL(SFC), syntax: 'scss' }).css)
    .join('\n')
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('txTextTransformer (morph, the default)', () => {
  it('hands the value to the morph engine', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'Ready' },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.classes()).toContain('tx-text-transformer')
    expect(wrapper.classes()).toContain('is-morph')
    expect(wrapper.find('.tx-text-transformer__morph').exists()).toBe(true)
    expect(wrapper.find('[tx-morph-sr]').text()).toBe('Ready')
    // The crossfade layers belong to the other mode and must not be built at all.
    expect(wrapper.find('.tx-text-transformer__layer--current').exists()).toBe(false)

    wrapper.unmount()
  })

  it('rebuilds the segments when the value changes', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'Draft' },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.setProps({ text: 'Published' })
    await nextTick()

    expect(wrapper.find('[tx-morph-sr]').text()).toBe('Published')

    wrapper.unmount()
  })

  it('falls back to the crossfade when the default slot is in play', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'A' },
      slots: { default: '<template #default="{ text }"><em>{{ text }}</em></template>' },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.classes()).not.toContain('is-morph')
    expect(wrapper.find('.tx-text-transformer__morph').exists()).toBe(false)

    await wrapper.setProps({ text: 'B' })
    await nextTick()

    expect(wrapper.findAll('em').map(layer => layer.text())).toEqual(['B', 'A'])

    wrapper.unmount()
  })

  it('falls back to the crossfade when wrapping is asked for', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'A long chapter', wrap: true },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.classes()).toContain('is-wrap')
    expect(wrapper.classes()).not.toContain('is-morph')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('A long chapter')

    wrapper.unmount()
  })
})

describe('txTextTransformer (fade)', () => {
  it('renders the current text with default live region semantics', () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'Ready', mode: 'fade' },
    })

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.classes()).toContain('tx-text-transformer')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('Ready')
    expect(wrapper.find('.tx-text-transformer__layer--prev').exists()).toBe(false)
  })

  it('uses the requested root tag and maps timing props to CSS variables', () => {
    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 42,
        mode: 'fade',
        tag: 'strong',
        durationMs: 360,
        blurPx: 12,
        wrap: true,
      },
    })

    const style = wrapper.attributes('style')

    expect(wrapper.element.tagName).toBe('STRONG')
    expect(wrapper.classes()).toContain('is-wrap')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('42')
    expect(style).toContain('--tx-tt-duration: 360ms')
    expect(style).toContain('--tx-tt-blur: 12px')
  })

  it('renders previous and current layers during text transitions', async () => {
    vi.stubGlobal('getComputedStyle', () => ({ color: 'rgb(12, 34, 56)' }))

    const wrapper = mount(TxTextTransformer, {
      props: {
        text: 'Draft',
        mode: 'fade',
        durationMs: 120,
      },
    })

    await wrapper.setProps({ text: 'Published' })
    await nextTick()
    vi.advanceTimersByTime(16)
    await nextTick()

    const current = wrapper.find('.tx-text-transformer__layer--current')
    const prev = wrapper.find('.tx-text-transformer__layer--prev')

    expect(wrapper.classes()).toContain('has-prev')
    expect(wrapper.classes()).toContain('is-animating')
    expect(current.text()).toBe('Published')
    expect(prev.text()).toBe('Draft')
    expect(prev.attributes('aria-hidden')).toBe('true')
    expect(prev.attributes('style')).toContain('color: rgb(12, 34, 56)')

    vi.advanceTimersByTime(154)
    await nextTick()

    expect(wrapper.find('.tx-text-transformer__layer--prev').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('has-prev')
    expect(wrapper.classes()).not.toContain('is-animating')
  })

  it('passes layer text to the default slot for both current and previous layers', async () => {
    const wrapper = mount(TxTextTransformer, {
      props: { text: 'A', mode: 'fade' },
      slots: {
        default: '<template #default="{ text }"><em>{{ text }}</em></template>',
      },
    })

    await wrapper.setProps({ text: 'B' })
    await nextTick()

    const layers = wrapper.findAll('em')

    expect(layers.map(layer => layer.text())).toEqual(['B', 'A'])
  })

  it('commits the setup state with a forced read before the frame that animates it', async () => {
    // What the browser would compute at the read: without it, `has-prev` and
    // `is-animating` reach the same style recalc and neither layer transitions.
    const reads: string[] = []
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('tx-text-transformer'))
        reads.push(this.className)
      return 0
    })

    const wrapper = mount(TxTextTransformer, { props: { text: 'Draft', mode: 'fade' } })
    await wrapper.setProps({ text: 'Published' })
    await nextTick()

    expect(reads).toHaveLength(1)
    expect(reads[0]).toContain('has-prev')
    expect(reads[0]).not.toContain('is-animating')

    vi.advanceTimersByTime(16)
    await nextTick()
    expect(wrapper.classes()).toContain('is-animating')
  })
})

describe('txTextTransformer (fade setup state)', () => {
  it('lands the setup state without a tween', () => {
    // With a tween there, the current layer would start easing out and be reversed a
    // frame later, so the new text would appear at once instead of fading in.
    const css = compileStyles()
    expect(css).toMatch(
      /\.tx-text-transformer\.has-prev:not\(\.is-animating\) \.tx-text-transformer__layer\s*\{\s*transition:\s*none;?\s*\}/,
    )
  })
})

describe('txTextTransformer (reduced motion)', () => {
  it('lands the fade on its end state instead of tweening to it', () => {
    const css = compileStyles()

    // Positive control: without a tween on the layers the guard below guards nothing.
    expect(css).toMatch(/\.tx-text-transformer__layer\s*\{[^}]*transition:\s*opacity/)

    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    expect(reduced).toHaveLength(1)
    expect(reduced[0]).toMatch(/\.tx-text-transformer__layer\s*\{\s*transition:\s*none;?\s*\}/)
    // Only the tween goes; the layers' end states must stay reachable.
    expect(reduced[0]).not.toMatch(/opacity:\s*0/)
  })
})
