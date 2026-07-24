import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import FlatDropdown, { TxFlatDropdown } from '../index'

function mountDropdown(props: Record<string, unknown> = {}) {
  return mount(TxFlatDropdown, {
    attachTo: document.body,
    props: {
      // Render inline so the teleported panel is queryable via the wrapper.
      teleport: false,
      ...props,
    },
    slots: {
      trigger: '<button class="trigger-button">trigger</button>',
      default: ({ side }: any) => h('span', { class: 'panel-content' }, side),
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('txFlatDropdown', () => {
  it('renders the trigger and keeps the panel closed initially', () => {
    const wrapper = mountDropdown()

    expect(wrapper.find('.trigger-button').exists()).toBe(true)
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('exposes hover-first defaults', () => {
    const wrapper = mountDropdown()

    expect(wrapper.props()).toMatchObject({
      trigger: 'hover',
      placement: 'bottom-start',
      offset: 10,
      openDelay: 0,
      closeDelay: 600,
      exitDuration: 280,
    })
  })

  it('opens immediately on hover and reveals the panel', async () => {
    const wrapper = mountDropdown()

    await wrapper.trigger('mouseenter')
    await wrapper.vm.$nextTick()

    // openDelay 0 → no timer advance required.
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    const panel = wrapper.find('.tx-flat-dropdown__panel')
    expect(panel.exists()).toBe(true)
    expect(panel.find('.panel-content').text()).toBe('bottom')
  })

  it('delays closing after the pointer leaves the trigger', async () => {
    const wrapper = mountDropdown({ closeDelay: 600 })

    await wrapper.trigger('mouseenter')
    await wrapper.vm.$nextTick()
    await wrapper.trigger('mouseleave')

    // Still open midway through the close delay.
    vi.advanceTimersByTime(400)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    // Fully closes once the 600ms delay elapses.
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('cancels the pending close while the pointer is over the panel', async () => {
    const wrapper = mountDropdown({ closeDelay: 100 })

    await wrapper.trigger('mouseenter')
    await wrapper.vm.$nextTick()
    await wrapper.trigger('mouseleave')

    const panel = wrapper.find('.tx-flat-dropdown__panel')
    await panel.trigger('mouseenter')
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    await panel.trigger('mouseleave')
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('toggles on click when trigger is "click"', async () => {
    const wrapper = mountDropdown({ trigger: 'click' })

    // Hover must not open a click-triggered dropdown.
    await wrapper.trigger('mouseenter')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)

    await wrapper.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    await wrapper.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('closes after a panel click when closeOnContentClick is set', async () => {
    const wrapper = mountDropdown({ trigger: 'click', closeOnContentClick: true })

    await wrapper.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.tx-flat-dropdown__panel').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('closes on Escape', async () => {
    const wrapper = mountDropdown({ trigger: 'click' })

    await wrapper.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('does not open while disabled and closes when disabled mid-flight', async () => {
    const disabled = mountDropdown({ disabled: true })
    await disabled.trigger('mouseenter')
    await disabled.vm.$nextTick()
    expect(disabled.find('.tx-flat-dropdown__panel').exists()).toBe(false)

    const wrapper = mountDropdown()
    await wrapper.trigger('mouseenter')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    await wrapper.setProps({ disabled: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('honours a controlled modelValue', async () => {
    const wrapper = mountDropdown({ modelValue: true })
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(true)

    await wrapper.setProps({ modelValue: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-flat-dropdown__panel').exists()).toBe(false)
  })

  it('registers the component through install', () => {
    const app = createApp({})
    const component = vi.spyOn(app, 'component')

    app.use(FlatDropdown)

    expect(component).toHaveBeenCalledWith('TxFlatDropdown', FlatDropdown)
  })
})
