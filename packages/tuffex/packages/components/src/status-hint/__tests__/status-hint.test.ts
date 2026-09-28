import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { resolveTransition } from '../../liquid/src/spring'
import TxTextTransformer from '../../text-transformer/src/TxTextTransformer.vue'
import TxStatusHint from '../src/TxStatusHint.vue'

// The suite's matchMedia stub answers `false` to every query, so the morph engine runs
// (reduced motion off) and draws the value twice: a visually hidden copy plus aria-hidden
// segments. Text is therefore read the way a screen reader reads it, never with `.text()`.
function accessibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return node.textContent ?? ''
  if (node instanceof Element && node.getAttribute('aria-hidden') === 'true')
    return ''
  return [...node.childNodes].map(accessibleText).join('')
}

/** The root itself when it matches, then its descendants: `querySelectorAll` skips the root. */
function selectAll(root: Element, selector: string): Element[] {
  return [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)]
}

function pulseClasses(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.classes().filter(name => name.startsWith('is-pulse'))
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

enableAutoUnmount(afterEach)

describe('txStatusHint', () => {
  it('renders a success hint at md, animated, with its text readable once', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied' }, attachTo: document.body })
    await nextTick()

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['tx-status-hint', 'tx-status-hint--md', 'is-success', 'is-animated']))
    expect(accessibleText(wrapper.element)).toBe('Copied')

    await wrapper.setProps({ size: 'sm' })
    expect(wrapper.classes()).toContain('tx-status-hint--sm')
    expect(wrapper.classes()).not.toContain('tx-status-hint--md')
  })

  it('puts the wash first and keeps it from assistive tech', () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied' } })
    const wash = wrapper.element.firstElementChild!

    expect(wash.classList.contains('tx-status-hint__wash')).toBe(true)
    expect(wash.getAttribute('aria-hidden')).toBe('true')
    expect(wash.childNodes).toHaveLength(0)
  })

  it.each([
    ['success', 'check-circle'],
    ['warning', 'alert-triangle'],
    ['danger', 'x-circle'],
    ['info', 'info'],
  ] as const)('draws %s with TxIcon\'s built-in %s glyph, hidden from assistive tech', (tone, glyph) => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Done', tone } })
    const box = wrapper.get('.tx-status-hint__icon')
    const icon = box.get('.tuff-icon')

    expect(wrapper.classes()).toContain(`is-${tone}`)
    expect(box.attributes('aria-hidden')).toBe('true')
    // Built in, not a class name: Nexus cannot resolve `i-ri-*`.
    expect(icon.attributes('data-icon-type')).toBe('builtin')
    expect(icon.attributes('data-icon-value')).toBe(glyph)
    expect(icon.find('svg path').exists()).toBe(true)
  })

  it('reserves no icon box for muted, which has no glyph of its own', () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Nothing changed', tone: 'muted' } })

    expect(wrapper.classes()).toContain('is-muted')
    expect(wrapper.find('.tx-status-hint__icon').exists()).toBe(false)
  })

  it('lets the icon slot replace the glyph, in the same hidden box', () => {
    for (const tone of ['success', 'muted'] as const) {
      const wrapper = mount(TxStatusHint, {
        props: { text: 'Pinned', tone },
        slots: { icon: '<i class="probe-glyph" />' },
      })
      const box = wrapper.get('.tx-status-hint__icon')

      expect(box.attributes('aria-hidden'), tone).toBe('true')
      expect(box.find('.probe-glyph').exists(), tone).toBe(true)
      expect(box.find('.tuff-icon').exists(), tone).toBe(false)
    }
  })

  it('reads a number text as its digits', async () => {
    for (const animated of [true, false]) {
      const wrapper = mount(TxStatusHint, { props: { text: 42, animated }, attachTo: document.body })
      await nextTick()
      expect(accessibleText(wrapper.element), String(animated)).toBe('42')
    }
  })
})

describe('txStatusHint announcements', () => {
  it('is one polite status region by default, on the text', () => {
    for (const animated of [true, false]) {
      const wrapper = mount(TxStatusHint, { props: { text: 'Copied', animated } })
      const text = wrapper.get('.tx-status-hint__text')

      expect(text.attributes('aria-live'), String(animated)).toBe('polite')
      expect(text.attributes('role'), String(animated)).toBe('status')
      expect(selectAll(wrapper.element, '[aria-live]'), String(animated)).toHaveLength(1)
    }
  })

  it('contains no live region at all when live is false', () => {
    for (const animated of [true, false]) {
      const wrapper = mount(TxStatusHint, { props: { text: 'Copied', live: false, animated } })

      expect(selectAll(wrapper.element, '[aria-live]:not([aria-live="off"])'), String(animated)).toEqual([])
      expect(selectAll(wrapper.element, '[role="status"], [role="alert"], [role="log"]'), String(animated)).toEqual([])
    }
  })

  it('overrides the aria-live the transformer hard-codes on its root', () => {
    // TxTextTransformer writes aria-live="polite" on its own root. The text node here IS
    // that root, so `off` only holds because fallthrough attributes are merged last.
    const polite = mount(TxStatusHint, { props: { text: 'Copied' } })
    const quiet = mount(TxStatusHint, { props: { text: 'Copied', live: false } })

    for (const wrapper of [polite, quiet])
      expect(wrapper.get('.tx-status-hint__text').element).toBe(wrapper.findComponent(TxTextTransformer).element)
    expect(polite.get('.tx-status-hint__text').attributes('aria-live')).toBe('polite')
    expect(quiet.get('.tx-status-hint__text').attributes('aria-live')).toBe('off')
  })
})

describe('txStatusHint text', () => {
  it('renders the text through the morph engine while animated', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Pinned' }, attachTo: document.body })
    await nextTick()

    const transformer = wrapper.findComponent(TxTextTransformer)
    expect(transformer.exists()).toBe(true)
    expect(transformer.classes()).toEqual(expect.arrayContaining(['tx-status-hint__text', 'is-morph']))
    expect(transformer.props('durationMs')).toBe(380)
    expect(wrapper.find('[tx-morph-root]').exists()).toBe(true)
  })

  it('keeps one transformer across messages, so the text morphs instead of remounting', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Pinned', pulseKey: 1 }, attachTo: document.body })
    await nextTick()
    const before = wrapper.findComponent(TxTextTransformer)
    // By uid: VTU hands out a fresh `vm` proxy on every lookup, and a failing identity
    // check on the internal instance makes vitest diff two whole component graphs.
    const uid = before.vm.$.uid
    const element = before.element

    await wrapper.setProps({ text: 'Unpinned', pulseKey: 2 })
    await nextTick()

    const after = wrapper.findComponent(TxTextTransformer)
    expect(after.vm.$.uid).toBe(uid)
    expect(after.element === element, 'the same root element').toBe(true)
    expect(accessibleText(wrapper.element)).toBe('Unpinned')
  })

  it('renders plain text, with no morph engine, when animated is false', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied', animated: false }, attachTo: document.body })
    await nextTick()

    expect(wrapper.classes()).not.toContain('is-animated')
    expect(wrapper.findComponent(TxTextTransformer).exists()).toBe(false)
    expect(wrapper.find('[tx-morph-root]').exists()).toBe(false)
    const text = wrapper.get('.tx-status-hint__text')
    expect(text.element.tagName).toBe('SPAN')
    expect(text.text()).toBe('Copied')

    await wrapper.setProps({ text: 'Pinned' })
    expect(text.text()).toBe('Pinned')
    expect(wrapper.find('[tx-morph-root]').exists()).toBe(false)
  })
})

describe('txStatusHint replay', () => {
  it('replays on each new pulseKey, and not on mount', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied', pulseKey: 1 } })
    // The entrance plays on mount; a replay class there would cut it short.
    expect(pulseClasses(wrapper)).toEqual([])

    await wrapper.setProps({ pulseKey: 2 })
    expect(pulseClasses(wrapper)).toEqual(['is-pulse-a'])
    await wrapper.setProps({ pulseKey: 3 })
    expect(pulseClasses(wrapper)).toEqual(['is-pulse-b'])
    await wrapper.setProps({ pulseKey: 4 })
    expect(pulseClasses(wrapper)).toEqual(['is-pulse-a'])
  })

  it('replays on a text change too, and once when text and key change together', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Pinned', pulseKey: 1 } })

    await wrapper.setProps({ text: 'Unpinned' })
    expect(pulseClasses(wrapper)).toEqual(['is-pulse-a'])

    // One message, two changed sources: a second flip would land back on `a` and restart nothing.
    await wrapper.setProps({ text: 'Pinned', pulseKey: 2 })
    expect(pulseClasses(wrapper)).toEqual(['is-pulse-b'])
  })

  it('holds still while animated is false', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied', pulseKey: 1, animated: false } })

    await wrapper.setProps({ pulseKey: 2 })
    await wrapper.setProps({ text: 'Pinned', pulseKey: 3 })
    expect(wrapper.classes()).not.toContain('is-animated')
    expect(pulseClasses(wrapper)).toEqual([])
  })
})

describe('txStatusHint spring', () => {
  it('writes the compiled bouncy spring onto the root once mounted', async () => {
    const wrapper = mount(TxStatusHint, { props: { text: 'Copied' } })
    await nextTick()

    const { duration, easing } = resolveTransition('bouncy')
    const style = (wrapper.element as HTMLElement).style
    expect(style.getPropertyValue('--tx-status-hint-spring')).toBe(easing)
    expect(style.getPropertyValue('--tx-status-hint-spring-duration')).toBe(`${duration}ms`)
  })

  it('renders on the server without the spring, the tone and text in place', async () => {
    // Nexus registers every Tx* export as a Nuxt global, so this renders in SSR.
    const html = await renderToString(h(TxStatusHint, { text: 'Could not pin', tone: 'danger', size: 'sm' }))

    expect(html).toContain('Could not pin')
    expect(html).toContain('is-danger')
    expect(html).toContain('tx-status-hint--sm')
    expect(html).toContain('data-icon-value="x-circle"')
    // The spring resolves differently on the server (no `CSS.supports`), so it must not
    // reach the server markup, or the first client render would not match it.
    expect(html).not.toContain('--tx-status-hint-spring')
  })

  it('hydrates the server markup without a mismatch, then writes the spring', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const render = () => h(TxStatusHint, { text: 'Copied', pulseKey: 1 })

    const container = document.createElement('div')
    container.innerHTML = await renderToString(createSSRApp({ render }))
    document.body.append(container)
    const app = createSSRApp({ render })
    app.mount(container)
    await nextTick()

    const messages = [...warn.mock.calls, ...error.mock.calls].map(args => String(args[0]))
    expect(messages.filter(message => /hydrat/i.test(message))).toEqual([])
    expect(container.querySelector<HTMLElement>('.tx-status-hint')!.style.getPropertyValue('--tx-status-hint-spring-duration'))
      .toBe(`${resolveTransition('bouncy').duration}ms`)
    app.unmount()
  })
})
