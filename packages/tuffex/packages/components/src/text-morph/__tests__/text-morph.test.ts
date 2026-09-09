import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxTextMorph from '../src/TxTextMorph.vue'

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function readableText(root: Element): string {
  return root.querySelector('[tx-morph-sr]')?.textContent ?? ''
}

function segmentText(root: Element): string {
  return Array.from(root.querySelectorAll('[tx-morph-item]'))
    .map(item => item.textContent ?? '')
    .join('')
}

beforeEach(() => {
  stubReducedMotion(false)
})

afterEach(() => {
  stubReducedMotion(false)
})

describe('txTextMorph', () => {
  it('takes the value over from the server-rendered text on mount', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'Ready' }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toContain('tx-text-morph')
    expect(wrapper.element.hasAttribute('tx-morph-root')).toBe(true)
    expect(readableText(wrapper.element)).toBe('Ready')

    wrapper.unmount()
  })

  it('uses the requested root tag', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'Title', tag: 'strong' }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.tagName).toBe('STRONG')

    wrapper.unmount()
  })

  it('rebuilds the segments when the value changes', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'one' }, attachTo: document.body })
    await nextTick()

    expect(segmentText(wrapper.element)).toBe('one')

    await wrapper.setProps({ text: 'two' })
    await nextTick()

    expect(readableText(wrapper.element)).toBe('two')
    // jsdom has no WAAPI, so exiting segments are removed rather than faded out —
    // what is left is exactly the new value.
    expect(segmentText(wrapper.element)).toBe('two')

    wrapper.unmount()
  })

  it('formats a numeric value through locale and decimals', async () => {
    const wrapper = mount(TxTextMorph, {
      props: { text: 1234.5, decimals: 2, locale: 'en' },
      attachTo: document.body,
    })
    await nextTick()

    expect(readableText(wrapper.element)).toBe('1,234.50')

    wrapper.unmount()
  })

  it('writes plain text and claims no root when motion is disabled', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'Plain', disabled: true }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.textContent?.trim()).toBe('Plain')
    expect(wrapper.element.querySelector('[tx-morph-item]')).toBeNull()
    expect(wrapper.element.hasAttribute('tx-morph-root')).toBe(false)

    wrapper.unmount()
  })

  it('respects prefers-reduced-motion by default', async () => {
    stubReducedMotion(true)

    const wrapper = mount(TxTextMorph, { props: { text: 'Quiet' }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.querySelector('[tx-morph-item]')).toBeNull()
    expect(wrapper.element.textContent?.trim()).toBe('Quiet')

    wrapper.unmount()
  })

  it('animates anyway when respectReducedMotion is off', async () => {
    stubReducedMotion(true)

    const wrapper = mount(TxTextMorph, {
      props: { text: 'Loud', respectReducedMotion: false },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.element.hasAttribute('tx-morph-root')).toBe(true)
    expect(readableText(wrapper.element)).toBe('Loud')

    wrapper.unmount()
  })

  it('gives back the element it took over when unmounted', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'Bye' }, attachTo: document.body })
    await nextTick()

    const element = wrapper.element as HTMLElement
    wrapper.unmount()

    expect(element.hasAttribute('tx-morph-root')).toBe(false)
    expect(element.querySelector('[tx-morph-sr]')).toBeNull()
  })
})
