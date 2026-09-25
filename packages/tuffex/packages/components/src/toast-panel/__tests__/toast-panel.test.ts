import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxToastPanel from '../src/TxToastPanel.vue'

describe('txToastPanel', () => {
  it('renders the slotted card and a tether by default', () => {
    const wrapper = mount(TxToastPanel, { slots: { default: '<b class="body">Theo Morgan</b>' } })

    expect(wrapper.find('.body').exists()).toBe(true)
    // The tether is what says "this came from *that*" — it is the whole
    // difference from a free-floating toast, so it is on by default.
    expect(wrapper.find('.tx-toast-panel__tether').exists()).toBe(true)
  })

  it('drops the tether when asked, keeping the card', () => {
    const wrapper = mount(TxToastPanel, { props: { tether: false } })

    expect(wrapper.find('.tx-toast-panel__tether').exists()).toBe(false)
    expect(wrapper.find('.tx-toast-panel__card').exists()).toBe(true)
  })

  it('exposes the tether length as a custom property', () => {
    const wrapper = mount(TxToastPanel, { props: { tetherLength: 44 } })

    expect(wrapper.attributes('style')).toContain('--tx-toast-panel-tether: 44px')
  })

  it('clamps a negative tether length to zero', () => {
    const wrapper = mount(TxToastPanel, { props: { tetherLength: -10 } })

    expect(wrapper.attributes('style')).toContain('--tx-toast-panel-tether: 0px')
  })

  it('toggles the open class rather than unmounting', () => {
    const shown = mount(TxToastPanel, { props: { open: true } })
    expect(shown.classes()).toContain('is-open')

    const hidden = mount(TxToastPanel, { props: { open: false } })
    // Still mounted: destroying the root would cut the leave transition and
    // collapse the tether's box, dragging the layout up on every change.
    expect(hidden.classes()).not.toContain('is-open')
    expect(hidden.find('.tx-toast-panel__card').exists()).toBe(true)
  })

  it('renders one decorative sliver per stack depth', () => {
    expect(mount(TxToastPanel, { props: { stack: 0 } })
      .findAll('.tx-toast-panel__layer')).toHaveLength(0)
    expect(mount(TxToastPanel, { props: { stack: 1 } })
      .findAll('.tx-toast-panel__layer')).toHaveLength(1)
    expect(mount(TxToastPanel, { props: { stack: 2 } })
      .findAll('.tx-toast-panel__layer')).toHaveLength(2)
  })

  it('caps the stack at two and floors it at zero', () => {
    // A third sliver is under a pixel of visible edge at the default offsets.
    expect(mount(TxToastPanel, { props: { stack: 9 } })
      .findAll('.tx-toast-panel__layer')).toHaveLength(2)
    expect(mount(TxToastPanel, { props: { stack: -3 } })
      .findAll('.tx-toast-panel__layer')).toHaveLength(0)
  })

  it('gives each sliver its own depth so they nest instead of overlapping', () => {
    const layers = mount(TxToastPanel, { props: { stack: 2 } })
      .findAll('.tx-toast-panel__layer')

    expect(layers[0]!.attributes('style')).toContain('--tx-toast-panel-depth: 1')
    expect(layers[1]!.attributes('style')).toContain('--tx-toast-panel-depth: 2')
  })

  it('hides the decorative slivers from assistive tech', () => {
    const layers = mount(TxToastPanel, { props: { stack: 2 } })
      .findAll('.tx-toast-panel__layer')

    for (const layer of layers)
      expect(layer.attributes('aria-hidden')).toBe('true')
  })

  it('announces itself, because it appears without a user action', () => {
    const wrapper = mount(TxToastPanel, { props: { ariaLabel: 'Newest signal' } })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.attributes('aria-label')).toBe('Newest signal')
  })

  it('goes quiet when the host announces the change elsewhere', () => {
    const wrapper = mount(TxToastPanel, { props: { live: 'off' } })

    // Two live regions for one arrival is worse than none.
    expect(wrapper.attributes('aria-live')).toBeUndefined()
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('flips the tether to the other end when it sits above', () => {
    const wrapper = mount(TxToastPanel, { props: { side: 'above' } })

    expect(wrapper.classes()).toContain('is-above')
  })

  it('lets the tether slot replace the default rule', () => {
    const wrapper = mount(TxToastPanel, {
      slots: { tether: '<i class="mine" />' },
    })

    expect(wrapper.find('.mine').exists()).toBe(true)
    expect(wrapper.find('.tx-toast-panel__tether').exists()).toBe(false)
  })
})
