// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { resolveTransition } from '../../liquid/src/spring'
import TxMorph from '../src/TxMorph.vue'

class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe('txMorph', () => {
  let originalObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.ResizeObserver = originalObserver as typeof ResizeObserver
  })

  it('renders its content inside one keyed layer and writes the shape as custom properties', () => {
    const wrapper = mount(TxMorph, {
      props: { radius: 19, fill: '#0285ff', inset: 6 },
      slots: { default: () => h('span', { class: 'probe' }, 'Connect') },
    })
    expect(wrapper.find('.tx-morph__layer .probe').text()).toBe('Connect')
    const style = (wrapper.element as HTMLElement).style
    expect(style.getPropertyValue('--tx-morph-radius')).toBe('19px')
    expect(style.getPropertyValue('--tx-morph-fill')).toBe('#0285ff')
    expect(style.getPropertyValue('--tx-morph-inset')).toBe('6px')
  })

  it('runs the radius on the curve liquid compiles from the same spring the size integrates', () => {
    const wrapper = mount(TxMorph, { props: { spring: 'smooth' } })
    const expected = resolveTransition({ stiffness: 190, damping: 26, mass: 1 })
    const style = (wrapper.element as HTMLElement).style
    expect(style.getPropertyValue('--tx-morph-duration')).toBe(`${expected.duration}ms`)
    expect(style.getPropertyValue('--tx-morph-easing')).toBe(expected.easing)
  })

  it('leaves the width to layout when width is off', () => {
    const wrapper = mount(TxMorph, { props: { width: false } })
    expect(wrapper.classes()).toContain('is-fluid')
  })

  it('opens the colour window on a change of shape and closes it once the curve has run', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxMorph, { props: { radius: 12 } })
    expect(wrapper.classes()).not.toContain('is-morphing')
    await wrapper.setProps({ radius: 19 })
    expect(wrapper.classes()).toContain('is-morphing')
    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
  })

  it('pins the leaving content out of flow and out of reach while the next one enters', async () => {
    const wrapper = mount(TxMorph, {
      props: { morphKey: 'a' },
      slots: { default: () => h('span', 'content') },
      global: { stubs: { transition: false } },
    })
    await wrapper.setProps({ morphKey: 'b' })
    const leaving = wrapper.find('.tx-morph-swap-leave-active')
    expect(leaving.exists()).toBe(true)
    expect(leaving.attributes('inert')).toBeDefined()
    expect(leaving.attributes('aria-hidden')).toBe('true')
    expect((leaving.element as HTMLElement).style.width).toMatch(/px$/)
    expect(wrapper.findAll('.tx-morph__layer')).toHaveLength(2)
  })
})

describe('txMorph style contract', () => {
  const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxMorph.vue')
  const css = [...readFileSync(SFC, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(match => sass.compileString(match[1] ?? '', { url: pathToFileURL(SFC), syntax: 'scss' }).css)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@charset[^;]*;/g, '')

  /** Every `transition:` declaration with the at-rule it sits in. */
  function transitions(): { selector: string, value: string, media: string | null }[] {
    const out: { selector: string, value: string, media: string | null }[] = []
    const stack: string[] = []
    let prelude = ''
    for (let i = 0; i < css.length; i++) {
      const char = css[i]!
      if (char === '{') {
        const head = prelude.trim()
        prelude = ''
        if (head.startsWith('@')) {
          stack.push(head)
          continue
        }
        const end = css.indexOf('}', i)
        for (const part of css.slice(i + 1, end).split(';')) {
          const colon = part.indexOf(':')
          if (colon > 0 && part.slice(0, colon).trim() === 'transition')
            out.push({ selector: head, value: part.slice(colon + 1).trim(), media: stack.at(-1) ?? null })
        }
        i = end
      }
      else if (char === '}') {
        stack.pop()
        prelude = ''
      }
      else {
        prelude += char
      }
    }
    return out
  }

  it('registers the radius so it can transition and its children can follow it', () => {
    expect(css).toMatch(/@property --tx-morph-radius\s*\{[^}]*syntax:\s*"?'?<length>/)
    expect(css).toMatch(/@property --tx-morph-radius\s*\{[^}]*inherits:\s*true/)
  })

  it('starts every shape from its own fill, inset and radius, so a nested shape inherits none of them', () => {
    const reset = css.match(/:where\(\.tx-morph\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(reset).toMatch(/--tx-morph-radius:\s*0px/)
    expect(reset).toMatch(/--tx-morph-fill:\s*transparent/)
    expect(reset).toMatch(/--tx-morph-inset:\s*0px/)
  })

  it('pads the content, not the shape, so a change of inset is a change of the size it springs to', () => {
    const rule = (selector: string) => css.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule('.tx-morph__content')).toMatch(/padding:\s*var\(--tx-morph-inset\)/)
    expect(rule('.tx-morph')).toMatch(/overflow:\s*hidden/)
    expect(rule('.tx-morph')).not.toMatch(/padding/)
  })

  it('declares motion only for those who have not asked for less, and eases colour only on a change', () => {
    const all = transitions()
    expect(all.length).toBeGreaterThan(0)
    for (const rule of all) {
      expect(rule.media, rule.selector).toBe('@media (prefers-reduced-motion: no-preference)')
      if (/background-color|--tx-morph-radius/.test(rule.value))
        expect(rule.selector, rule.value).toContain('.is-morphing')
    }
  })
})
