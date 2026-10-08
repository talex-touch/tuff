import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxTextMorph from '../src/TxTextMorph.vue'

function stubReducedMotion(matches: boolean) {
  const events = new EventTarget()
  window.matchMedia = (query: string) => ({
    get matches() { return matches },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  } as MediaQueryList)

  return (value: boolean) => {
    matches = value
    events.dispatchEvent(Object.assign(new Event('change'), { matches }))
  }
}

function readableText(root: Node): string {
  if (root instanceof Element && root.getAttribute('aria-hidden') === 'true')
    return ''
  if (root.nodeType === Node.TEXT_NODE)
    return root.textContent ?? ''
  return Array.from(root.childNodes).map(readableText).join('')
}

let originalMatchMedia: typeof window.matchMedia

beforeEach(() => {
  originalMatchMedia = window.matchMedia
  stubReducedMotion(false)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('txTextMorph', () => {
  it('preserves the original fragments and one accessible value through consecutive prop updates', async () => {
    const values = [
      '  👩🏽‍💻 e\u0301  $1,204.50 \n\n',
      '\n  👩🏽‍💻 e\u0301\u00A0$1,318.50  \n',
      '\t👨‍👩‍👧‍👦 o\u0308 $1,318.50\t ',
    ]
    const wrapper = mount(TxTextMorph, {
      props: { text: values[0]!, locale: 'en', numbers: true, respectReducedMotion: true },
      attachTo: document.body,
    })

    try {
      await nextTick()
      for (const [index, value] of values.entries()) {
        if (index > 0)
          await wrapper.setProps({ text: value })

        // Observe current BRs and nested number slots, not a simulated clipboard.
        const current = Array.from(wrapper.element.querySelectorAll('[tx-morph-item]:not([tx-morph-exiting])'))
        expect(current.map(item => item.tagName === 'BR' ? '\n' : item.textContent).join('')).toBe(value)
        expect(readableText(wrapper.element)).toBe(value)
        expect(wrapper.element.querySelectorAll('[tx-morph-sr]')).toHaveLength(1)
      }
    }
    finally {
      wrapper.unmount()
    }
  })

  it('uses the requested root tag', async () => {
    const wrapper = mount(TxTextMorph, { props: { text: 'Title', tag: 'strong' }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.tagName).toBe('STRONG')

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

  it('keeps exact text when reduced motion is enabled and restores morphing without stale fragments', async () => {
    const setReducedMotion = stubReducedMotion(false)
    const wrapper = mount(TxTextMorph, {
      props: { text: '  Before\u00A0👩🏽‍💻 e\u0301\n ', locale: 'en', respectReducedMotion: true },
      attachTo: document.body,
    })

    try {
      await nextTick()
      await wrapper.setProps({ text: '  Moving\u00A0👩🏽‍💻 e\u0301\n ' })

      setReducedMotion(true)
      const quiet = '\tQuiet\u00A0e\u0301\n\n  '
      await wrapper.setProps({ text: quiet })

      expect(wrapper.element.textContent).toBe(quiet)
      expect(readableText(wrapper.element)).toBe(quiet)
      expect(wrapper.element.querySelector('[tx-morph-item]')).toBeNull()
      expect(wrapper.element.querySelector('[tx-morph-sr]')).toBeNull()

      setReducedMotion(false)
      const resumed = '\n  Back 👨‍👩‍👧‍👦 o\u0308\u00A0$1,318.50  '
      await wrapper.setProps({ text: resumed })

      const current = Array.from(wrapper.element.querySelectorAll('[tx-morph-item]:not([tx-morph-exiting])'))
      expect(current.map(item => item.tagName === 'BR' ? '\n' : item.textContent).join('')).toBe(resumed)
      expect(readableText(wrapper.element)).toBe(resumed)
      expect(wrapper.element.querySelectorAll('[tx-morph-sr]')).toHaveLength(1)
      expect(wrapper.element.querySelector('[tx-morph-exiting]')).toBeNull()
    }
    finally {
      wrapper.unmount()
    }
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
