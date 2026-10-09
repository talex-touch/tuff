import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxSwitch from '../src/TxSwitch.vue'

describe('txSwitch', () => {
  it('renders active aria state and size class', () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: true,
        size: 'large',
      },
    })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('role')).toBe('switch')
    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('false')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.classes()).toContain('is-active')
    expect(wrapper.classes()).toContain('tuff-switch--large')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    // The track is a child now; the root is the flex wrapper that also holds
    // the label. State classes stay on the root.
    expect(wrapper.find('.tuff-switch__track .tuff-switch__thumb').exists()).toBe(true)
  })

  it('renders no label markup when none is given', () => {
    const wrapper = mount(TxSwitch)

    expect(wrapper.find('.tuff-switch__label').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('has-label')
  })

  it('renders a label prop through the text transformer', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Compact mode' },
    })

    expect(wrapper.classes()).toContain('has-label')
    expect(wrapper.text()).toContain('Compact mode')
    expect(wrapper.findComponent({ name: 'TxTextTransformer' }).exists()).toBe(true)
  })

  it('drops aria-label once a visible label names the control', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Compact mode', ariaLabel: 'Hidden name' },
    })

    expect(wrapper.attributes('aria-label')).toBeUndefined()

    const slotted = mount(TxSwitch, {
      props: { ariaLabel: 'Hidden name' },
      slots: { default: 'Slotted name' },
    })

    expect(slotted.attributes('aria-label')).toBeUndefined()
    expect(slotted.text()).toContain('Slotted name')
  })

  it('renders slot content directly rather than through the transformer', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'ignored' },
      slots: { default: '<strong>Rich label</strong>' },
    })

    // Arbitrary nodes cannot be morphed as text, so the slot wins outright.
    expect(wrapper.find('.tuff-switch__label strong').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TxTextTransformer' }).exists()).toBe(false)
  })

  it('morphs the label text when the label changes', async () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Off' },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.setProps({ label: 'On' })
    await nextTick()

    // The transformer hands the label to the morph engine, which splits it into
    // aria-hidden segments behind one readable copy. That copy carrying the new
    // value is what proves the engine took the update rather than Vue re-rendering
    // the text in place.
    expect(wrapper.find('.tx-text-transformer__morph').exists()).toBe(true)
    expect(wrapper.find('[tx-morph-sr]').text()).toBe('On')
    expect(wrapper.findAll('[tx-morph-item]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('[tx-morph-item]').every(item => item.attributes('aria-hidden') === 'true')).toBe(true)

    wrapper.unmount()
  })

  it('places the label before the track when labelPlacement is start', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Before', labelPlacement: 'start' },
    })

    expect(wrapper.element.firstElementChild?.classList.contains('tuff-switch__label')).toBe(true)

    const end = mount(TxSwitch, { props: { label: 'After' } })
    expect(end.element.firstElementChild?.classList.contains('tuff-switch__track')).toBe(true)
  })

  it('emits v-model and change events on click', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: false,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })

  it('always exposes an accessible name', () => {
    const wrapper = mount(TxSwitch)

    expect(wrapper.attributes('aria-label')).toBe('Toggle')
  })

  it('accepts a custom accessible name', () => {
    const wrapper = mount(TxSwitch, {
      props: { ariaLabel: 'Enable notifications' },
    })

    expect(wrapper.attributes('aria-label')).toBe('Enable notifications')
  })

  it('prefers aria-labelledby over aria-label when a visible label exists', () => {
    const wrapper = mount(TxSwitch, {
      props: { ariaLabelledby: 'notifications-label' },
    })

    expect(wrapper.attributes('aria-labelledby')).toBe('notifications-label')
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        disabled: true,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('does not emit events while loading', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: false,
        loading: true,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('keeps loading visually distinct from disabled', () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: true,
        loading: true,
      },
    })

    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.classes()).not.toContain('is-disabled')
    // The thumb stays on the active side so the ring marks which state is pending.
    expect(wrapper.classes()).toContain('is-active')
  })

  it('drops the busy state when loading resolves', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: false,
        loading: true,
      },
    })

    await wrapper.setProps({ loading: false })
    await wrapper.trigger('click')

    expect(wrapper.classes()).not.toContain('is-loading')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    expect(wrapper.attributes('disabled')).toBeUndefined()
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })
})

describe('txSwitch thumb travel', () => {
  // jsdom lays nothing out; these rules hand the component the resting places
  // the real stylesheet gives it (10% and 50% of a 44px track).
  let sheet: HTMLStyleElement
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    sheet = document.createElement('style')
    sheet.textContent = '.tuff-switch__thumb { position: absolute; left: 4px; height: 16px; } .tuff-switch.is-active .tuff-switch__thumb { left: 22px; }'
    document.head.appendChild(sheet)
    originalMatchMedia = window.matchMedia
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    sheet.remove()
    window.matchMedia = originalMatchMedia
  })

  function thumbOf(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('.tuff-switch__thumb').element as HTMLElement
  }

  it('holds the thumb where it was in the frame the state flips, then springs it home and lets go', async () => {
    const wrapper = mount(TxSwitch, { props: { modelValue: false }, attachTo: document.body })
    await nextTick()
    const thumb = thumbOf(wrapper)
    expect(thumb.style.translate).toBe('')

    await wrapper.setProps({ modelValue: true })
    await nextTick()
    // The CSS has moved it to 22px; the engine draws it back at 4px until it travels.
    expect(thumb.style.translate).toBe('-18px 0')
    expect(thumb.style.width).toBe('16px')

    vi.advanceTimersByTime(32)
    const midway = Number.parseFloat(thumb.style.translate)
    expect(midway).toBeGreaterThan(-18)
    expect(midway).toBeLessThan(0)
    // The leading end runs ahead: the thumb is longer than at rest on the way.
    expect(Number.parseFloat(thumb.style.width)).toBeGreaterThan(16)

    vi.advanceTimersByTime(2000)
    expect(thumb.style.translate).toBe('')
    expect(thumb.style.width).toBe('')
    wrapper.unmount()
  })

  it('leaves an unrendered thumb to the stylesheet and lands the first move once it shows', async () => {
    // Unrendered, `left` and `height` resolve to the authored percentages, not lengths.
    sheet.textContent = '.tuff-switch__thumb { position: absolute; left: 10%; height: 70%; } .tuff-switch.is-active .tuff-switch__thumb { left: 50%; }'
    const wrapper = mount(TxSwitch, { props: { modelValue: false }, attachTo: document.body })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    expect(thumbOf(wrapper).style.translate).toBe('')
    expect(thumbOf(wrapper).style.width).toBe('')

    // Shown again: nothing to travel from, so the next move lands where the CSS puts it.
    sheet.textContent = '.tuff-switch__thumb { position: absolute; left: 4px; height: 16px; } .tuff-switch.is-active .tuff-switch__thumb { left: 22px; }'
    await wrapper.setProps({ modelValue: false })
    await nextTick()
    expect(thumbOf(wrapper).style.translate).toBe('')
    // And the move after that travels again.
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    expect(thumbOf(wrapper).style.translate).toBe('-18px 0')
    wrapper.unmount()
  })

  it('lands at once under reduced motion', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    const wrapper = mount(TxSwitch, { props: { modelValue: false }, attachTo: document.body })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    expect(thumbOf(wrapper).style.translate).toBe('')
    expect(thumbOf(wrapper).style.width).toBe('')
    wrapper.unmount()
  })
})
