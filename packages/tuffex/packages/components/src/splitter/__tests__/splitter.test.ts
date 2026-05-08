import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxSplitter from '../src/TxSplitter.vue'

function mockRect(el: Element, rect: Partial<DOMRect>) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }),
  })
}

function pointerWindowEvent(type: string, init: { clientX?: number, clientY?: number } = {}) {
  const event = new Event(type)
  Object.assign(event, init)
  return event
}

describe('txSplitter', () => {
  it('renders horizontal panes, separator, and ratio variables', () => {
    const wrapper = mount(TxSplitter, {
      props: {
        modelValue: 0.35,
        barSize: 12,
      },
      slots: {
        a: '<div class="pane-a">A</div>',
        b: '<div class="pane-b">B</div>',
      },
    })

    const bar = wrapper.find('.tx-splitter__bar')
    const style = wrapper.attributes('style')

    expect(wrapper.classes()).toContain('is-horizontal')
    expect(style).toContain('--tx-splitter-bar-size: 12px')
    expect(style).toContain('--tx-splitter-ratio: 0.35')
    expect(wrapper.find('.pane-a').text()).toBe('A')
    expect(wrapper.find('.pane-b').text()).toBe('B')
    expect(bar.attributes('role')).toBe('separator')
    expect(bar.attributes('aria-orientation')).toBe('vertical')
    expect(bar.attributes('tabindex')).toBe('0')
  })

  it('renders vertical direction with horizontal separator orientation', () => {
    const wrapper = mount(TxSplitter, {
      props: {
        direction: 'vertical',
      },
    })

    expect(wrapper.classes()).toContain('is-vertical')
    expect(wrapper.find('.tx-splitter__bar').attributes('aria-orientation')).toBe('horizontal')
  })

  it('updates ratio from pointer drag with min, max, and snap applied', async () => {
    const wrapper = mount(TxSplitter, {
      props: {
        modelValue: 0.5,
        min: 0.2,
        max: 0.8,
        snap: 0.25,
      },
    })
    mockRect(wrapper.element, { width: 400 })

    await wrapper.find('.tx-splitter__bar').trigger('pointerdown', {
      clientX: 330,
      pointerId: 1,
    })

    expect(wrapper.classes()).toContain('is-dragging')
    expect(wrapper.emitted('drag-start')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([0.75])
    expect(wrapper.emitted('change')?.[0]).toEqual([0.75])

    window.dispatchEvent(pointerWindowEvent('pointermove', { clientX: 50 }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([0.25])
    expect(wrapper.emitted('change')?.[1]).toEqual([0.25])

    window.dispatchEvent(pointerWindowEvent('pointerup'))
    await nextTick()

    expect(wrapper.emitted('drag-end')).toHaveLength(1)
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('updates vertical ratio from pointer y coordinate', async () => {
    const wrapper = mount(TxSplitter, {
      props: {
        direction: 'vertical',
        modelValue: 0.5,
      },
    })
    mockRect(wrapper.element, { height: 300 })

    await wrapper.find('.tx-splitter__bar').trigger('pointerdown', {
      clientY: 210,
      pointerId: 1,
    })

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([0.7])
  })

  it('supports keyboard resizing by direction', async () => {
    const horizontal = mount(TxSplitter, {
      props: {
        modelValue: 0.5,
      },
    })

    await horizontal.find('.tx-splitter__bar').trigger('keydown', { key: 'ArrowLeft' })
    await horizontal.find('.tx-splitter__bar').trigger('keydown', { key: 'ArrowRight' })

    expect(horizontal.emitted('update:modelValue')?.[0]).toEqual([0.48])
    expect(horizontal.emitted('update:modelValue')?.[1]).toEqual([0.52])

    const vertical = mount(TxSplitter, {
      props: {
        direction: 'vertical',
        modelValue: 0.5,
      },
    })

    await vertical.find('.tx-splitter__bar').trigger('keydown', { key: 'ArrowUp' })
    await vertical.find('.tx-splitter__bar').trigger('keydown', { key: 'ArrowDown' })

    expect(vertical.emitted('update:modelValue')?.[0]).toEqual([0.48])
    expect(vertical.emitted('update:modelValue')?.[1]).toEqual([0.52])
  })

  it('blocks pointer and keyboard changes when disabled', async () => {
    const wrapper = mount(TxSplitter, {
      props: {
        disabled: true,
      },
    })
    mockRect(wrapper.element, { width: 400 })
    const bar = wrapper.find('.tx-splitter__bar')

    await bar.trigger('pointerdown', {
      clientX: 320,
      pointerId: 1,
    })
    await bar.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.classes()).toContain('is-disabled')
    expect(bar.attributes('tabindex')).toBe('-1')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('drag-start')).toBeUndefined()
  })

  it('ends an active drag when disabled while dragging', async () => {
    const wrapper = mount(TxSplitter, {
      props: {
        modelValue: 0.5,
      },
    })
    mockRect(wrapper.element, { width: 400 })

    await wrapper.find('.tx-splitter__bar').trigger('pointerdown', {
      clientX: 200,
      pointerId: 1,
    })
    await wrapper.setProps({ disabled: true })

    expect(wrapper.emitted('drag-start')).toHaveLength(1)
    expect(wrapper.emitted('drag-end')).toHaveLength(1)
    expect(wrapper.classes()).not.toContain('is-dragging')
  })
})
