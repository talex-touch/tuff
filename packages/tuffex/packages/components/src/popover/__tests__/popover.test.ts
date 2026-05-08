import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxPopover from '../src/TxPopover.vue'

const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: [
    'modelValue',
    'disabled',
    'eager',
    'placement',
    'offset',
    'width',
    'minWidth',
    'maxWidth',
    'maxHeight',
    'unlimitedHeight',
    'matchReferenceWidth',
    'duration',
    'ease',
    'panelVariant',
    'panelBackground',
    'panelShadow',
    'panelRadius',
    'panelPadding',
    'panelCard',
    'showArrow',
    'arrowSize',
    'keepAliveContent',
    'closeOnClickOutside',
    'closeOnEsc',
    'toggleOnReferenceClick',
    'referenceClass',
  ],
  emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    return () => h('div', { class: 'base-anchor-stub' }, [
      h('button', {
        class: 'anchor-toggle',
        onClick: () => emit('update:modelValue', !props.modelValue),
      }, 'toggle'),
      slots.reference?.(),
      props.modelValue
        ? h('div', { class: 'anchor-content' }, slots.default?.({ side: 'bottom' }))
        : null,
    ])
  },
})

function mountPopover(props: Record<string, unknown> = {}) {
  return mount(TxPopover, {
    props,
    slots: {
      reference: '<button class="reference-button">reference</button>',
      default: ({ side }: any) => h('span', { class: 'side-value' }, side),
    },
    global: {
      stubs: {
        TxBaseAnchor: BaseAnchorStub,
      },
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('txPopover', () => {
  it('forwards default BaseAnchor props for click popovers', () => {
    const wrapper = mountPopover()
    const anchor = wrapper.findComponent(BaseAnchorStub)

    expect(anchor.props()).toMatchObject({
      disabled: false,
      eager: false,
      placement: 'bottom-start',
      offset: 8,
      width: 0,
      minWidth: 0,
      maxWidth: 360,
      maxHeight: 420,
      unlimitedHeight: false,
      matchReferenceWidth: true,
      duration: 180,
      ease: 'power2.out',
      panelVariant: 'solid',
      panelBackground: 'refraction',
      panelShadow: 'soft',
      panelRadius: 18,
      panelPadding: 10,
      showArrow: true,
      arrowSize: 12,
      keepAliveContent: true,
      closeOnClickOutside: true,
      closeOnEsc: true,
      toggleOnReferenceClick: true,
    })
  })

  it('derives offset from arrow settings and supports fixed width panels', () => {
    const noArrow = mountPopover({ showArrow: false })
    const customArrow = mountPopover({ arrowSize: 18 })
    const explicit = mountPopover({ offset: 24, width: 280 })

    expect(noArrow.findComponent(BaseAnchorStub).props('offset')).toBe(2)
    expect(customArrow.findComponent(BaseAnchorStub).props('offset')).toBe(11)
    expect(explicit.findComponent(BaseAnchorStub).props('offset')).toBe(24)
    expect(explicit.findComponent(BaseAnchorStub).props('width')).toBe(280)
    expect(explicit.findComponent(BaseAnchorStub).props('matchReferenceWidth')).toBe(false)
  })

  it('maps hover trigger to delayed open and non-outside-click close behavior', async () => {
    const wrapper = mountPopover({
      trigger: 'hover',
      openDelay: 30,
      closeDelay: 40,
    })
    const reference = wrapper.find('.tx-popover__reference')

    await reference.trigger('mouseenter')
    expect(wrapper.emitted('open')).toBeUndefined()

    vi.advanceTimersByTime(30)
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(BaseAnchorStub).props('modelValue')).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.findComponent(BaseAnchorStub).props('closeOnClickOutside')).toBe(false)
    expect(wrapper.findComponent(BaseAnchorStub).props('toggleOnReferenceClick')).toBe(false)

    await reference.trigger('mouseleave')
    vi.advanceTimersByTime(40)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps hover popover open while pointer is over floating content', async () => {
    const wrapper = mountPopover({
      trigger: 'hover',
      openDelay: 0,
      closeDelay: 20,
    })
    const reference = wrapper.find('.tx-popover__reference')

    await reference.trigger('mouseenter')
    vi.runOnlyPendingTimers()
    await wrapper.vm.$nextTick()

    const content = wrapper.find('.tx-popover__content')
    await reference.trigger('mouseleave')
    await content.trigger('mouseenter')
    vi.advanceTimersByTime(20)
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(BaseAnchorStub).props('modelValue')).toBe(true)

    await content.trigger('mouseleave')
    vi.advanceTimersByTime(20)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('closes when disabled while open', async () => {
    const wrapper = mountPopover({ modelValue: true })

    await wrapper.setProps({ disabled: true })

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('passes full-width reference classes and content side slot props', () => {
    const wrapper = mountPopover({
      modelValue: true,
      referenceFullWidth: true,
      referenceClass: 'custom-reference',
    })
    const anchor = wrapper.findComponent(BaseAnchorStub)

    expect(wrapper.find('.tx-popover__reference').classes()).toContain('is-full-width')
    expect(anchor.props('referenceClass')).toEqual(['custom-reference', { 'is-full-width': true }])
    expect(wrapper.find('.tx-popover__content').attributes('data-side')).toBe('bottom')
    expect(wrapper.find('.side-value').text()).toBe('bottom')
  })
})
