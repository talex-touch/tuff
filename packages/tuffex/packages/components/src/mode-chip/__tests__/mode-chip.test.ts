import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxModeChip from '../src/TxModeChip.vue'

interface AnimateCall {
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: { cancel: () => void, onfinish: (() => void) | null }
}

function stubReducedMotion(matches: boolean): void {
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

/** jsdom ships no Web Animations API; the stub records what the chip asked for. */
function installAnimateStub(): AnimateCall[] {
  const calls: AnimateCall[] = []
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = { cancel: vi.fn(), onfinish: null as (() => void) | null }
      calls.push({ element: this, keyframes, options, animation })
      return animation as unknown as Animation
    },
  })
  return calls
}

/**
 * jsdom has no layout. The chip's width is modelled from what it shows: 16px of
 * padding, 20px for an icon box plus its gap, 8px per character of the label
 * currently in flow (the outgoing layer is absolutely positioned, so it is not).
 */
function stubChipWidth(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let width = 0
    if (this.classList.contains('tx-mode-chip')) {
      const label = this.querySelector('.tx-text-transformer__layer--current')?.textContent ?? ''
      width = 16 + (this.querySelector('.tx-mode-chip__icon') ? 20 : 0) + label.length * 8
    }
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 28, width, height: 28, toJSON: () => ({}) } as DOMRect
  })
}

function shownLabel(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.tx-text-transformer__layer--current').text()
}

beforeEach(() => {
  vi.useFakeTimers()
  stubReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
})

// Registered after the restore hook: after-hooks run in reverse, so wrappers are
// unmounted (and their timers cleared) while the fake clock is still installed.
enableAutoUnmount(afterEach)

describe('txModeChip', () => {
  it('is a native button, and attributes fall through to it', async () => {
    const onClick = vi.fn()
    const wrapper = mount(TxModeChip, {
      props: { label: 'Request approval' },
      attrs: { 'aria-pressed': 'false', 'title': 'Approval mode', onClick },
    })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('aria-pressed')).toBe('false')
    expect(wrapper.attributes('title')).toBe('Approval mode')

    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.attributes('disabled')).toBeDefined()
    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('names the button with its label and keeps the icon out of the name', () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Unrestricted access', icon: 'i-carbon-security' } })

    expect(shownLabel(wrapper)).toBe('Unrestricted access')
    expect(wrapper.find('.tx-mode-chip__icon').attributes('aria-hidden')).toBe('true')
  })

  it('renders the label through TxTextTransformer\'s fade, never the morph engine', () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Ask' } })
    const label = wrapper.find('.tx-mode-chip__label')

    expect(label.classes()).toContain('tx-text-transformer')
    expect(label.classes()).not.toContain('is-morph')
    expect(label.attributes('style')).toContain('--tx-tt-duration: 280ms')
    expect(label.attributes('style')).toContain('--tx-tt-blur: 6px')
  })

  it('defaults to the muted tone and carries the requested one as a class', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Ask' } })
    expect(wrapper.classes()).toContain('is-muted')

    for (const tone of ['success', 'warning', 'danger', 'info', 'muted'] as const) {
      await wrapper.setProps({ tone })
      expect(wrapper.classes()).toContain(`is-${tone}`)
    }
  })

  it('reserves no icon box without an icon', () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Ask' } })

    expect(wrapper.find('.tx-mode-chip__icon').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('has-icon')
  })

  it('renders on the server with its label, icon and tone', async () => {
    // Nexus registers every Tx* export as a Nuxt global, so this renders in SSR.
    const html = await renderToString(h(TxModeChip, { label: 'Unrestricted access', icon: 'i-carbon-security', tone: 'danger' }))

    expect(html).toContain('Unrestricted access')
    expect(html).toContain('i-carbon-security')
    expect(html).toContain('is-danger')
    expect(html).toContain('type="button"')
  })
})

describe('txModeChip morph', () => {
  it('swaps the icon as a new keyed element inside the named transition', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Request approval', icon: 'i-carbon-hand' } })
    const before = wrapper.find('.tx-mode-chip__glyph').element

    await wrapper.setProps({ icon: 'i-carbon-security' })

    const after = wrapper.find('.tx-mode-chip__glyph')
    // A patched element would mean the class changed in place and nothing animated.
    expect(after.element).not.toBe(before)
    expect(after.classes()).toContain('i-carbon-security')
    expect(before.isConnected).toBe(false)
    expect(wrapper.find('transition-stub').attributes('name')).toBe('tx-mode-chip-icon')
  })

  it('swaps the label 50ms after the icon', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Request approval', icon: 'i-carbon-hand' } })

    await wrapper.setProps({ label: 'Unrestricted access', icon: 'i-carbon-security' })
    expect(wrapper.find('.tx-mode-chip__glyph').classes()).toContain('i-carbon-security')
    expect(shownLabel(wrapper)).toBe('Request approval')

    await vi.advanceTimersByTimeAsync(49)
    expect(shownLabel(wrapper)).toBe('Request approval')

    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(shownLabel(wrapper)).toBe('Unrestricted access')
  })

  it('holds .is-morphing for exactly the length of the morph', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Ask', tone: 'muted' } })
    expect(wrapper.classes()).not.toContain('is-morphing')

    await wrapper.setProps({ label: 'Unrestricted access', tone: 'danger' })
    expect(wrapper.classes()).toContain('is-morphing')

    // 50ms label lead + the longer of the 280ms fade and the 300ms width tween.
    await vi.advanceTimersByTimeAsync(349)
    expect(wrapper.classes()).toContain('is-morphing')

    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
  })

  it('restarts the clock when the value changes again mid-morph', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'A' } })

    await wrapper.setProps({ label: 'B' })
    await vi.advanceTimersByTimeAsync(30)
    await wrapper.setProps({ label: 'C' })

    // The pending swap to B is dropped; C lands 50ms after it was asked for.
    await vi.advanceTimersByTimeAsync(49)
    expect(shownLabel(wrapper)).toBe('A')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(shownLabel(wrapper)).toBe('C')

    await vi.advanceTimersByTimeAsync(299)
    expect(wrapper.classes()).toContain('is-morphing')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
  })

  it('tweens the width across the label swap on the family easing', async () => {
    const calls = installAnimateStub()
    stubChipWidth()
    const wrapper = mount(TxModeChip, {
      props: { label: 'Ask', icon: 'i-carbon-hand' },
      attachTo: document.body,
    })

    await wrapper.setProps({ label: 'Unrestricted access', icon: 'i-carbon-security', tone: 'danger' })
    await nextTick()
    // Same-size icon swap: nothing to tween before the label moves.
    expect(calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(50)
    await nextTick()

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call!.element).toBe(wrapper.element)
    expect(call!.keyframes).toEqual([{ width: '60px' }, { width: '188px' }])
    expect(call!.options).toEqual({ duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })

    // The label may not shrink into an ellipsis while the chip is still growing.
    await nextTick()
    expect(wrapper.classes()).toContain('is-resizing')
    call!.animation.onfinish?.()
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-resizing')
  })

  it('tweens the width at once when an icon appears', async () => {
    const calls = installAnimateStub()
    stubChipWidth()
    const wrapper = mount(TxModeChip, { props: { label: 'Ask' }, attachTo: document.body })

    await wrapper.setProps({ icon: 'i-carbon-security' })
    await nextTick()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.keyframes).toEqual([{ width: '40px' }, { width: '60px' }])
  })

  it('settles straight to the new label where WAAPI is missing', async () => {
    const wrapper = mount(TxModeChip, { props: { label: 'Ask' } })

    await wrapper.setProps({ label: 'Unrestricted access' })
    await vi.advanceTimersByTimeAsync(50)
    await nextTick()

    expect(shownLabel(wrapper)).toBe('Unrestricted access')
    expect(wrapper.classes()).not.toContain('is-resizing')
  })

  it('clears every pending timer on unmount', async () => {
    // Unmounted by its host rather than by `wrapper.unmount()`, which auto-unmount
    // would then repeat on an app that is no longer mounted.
    const Host = defineComponent({
      props: { show: { type: Boolean, default: true }, label: { type: String, default: 'Ask' } },
      setup(props) {
        return () => (props.show ? h(TxModeChip, { label: props.label }) : null)
      },
    })
    const wrapper = mount(Host)

    await wrapper.setProps({ label: 'Unrestricted access' })
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await wrapper.setProps({ show: false })
    expect(wrapper.find('.tx-mode-chip').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('txModeChip under reduced motion', () => {
  it('lands every leg at once: no label lead, no morph class, no WAAPI', async () => {
    stubReducedMotion(true)
    const calls = installAnimateStub()
    stubChipWidth()
    const wrapper = mount(TxModeChip, {
      props: { label: 'Request approval', icon: 'i-carbon-hand' },
      attachTo: document.body,
    })

    await wrapper.setProps({ label: 'Unrestricted access', icon: 'i-carbon-security', tone: 'danger' })
    await nextTick()

    expect(shownLabel(wrapper)).toBe('Unrestricted access')
    expect(wrapper.find('.tx-mode-chip__glyph').classes()).toContain('i-carbon-security')
    expect(wrapper.classes()).toContain('is-danger')
    expect(wrapper.classes()).not.toContain('is-morphing')

    await vi.advanceTimersByTimeAsync(400)
    expect(calls).toHaveLength(0)
  })
})
