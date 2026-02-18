import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import TxPopover from '../src/TxPopover.vue'

const TooltipStub = defineComponent({
  name: 'TxTooltip',
  props: {
    modelValue: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    trigger: { type: String, default: 'hover' },
    openDelay: { type: Number, default: 0 },
    closeDelay: { type: Number, default: 0 },
    referenceFullWidth: { type: Boolean, default: false },
    interactive: { type: Boolean, default: false },
    keepAliveContent: { type: Boolean, default: false },
    anchor: { type: Object, default: () => ({}) },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: `
    <div class="tx-tooltip-stub">
      <slot />
      <slot name="content" :side="'bottom'" />
    </div>
  `,
})

describe('txPopover', () => {
  it('默认映射到 Tooltip，并保持 click 语义', () => {
    const wrapper = mount(TxPopover, {
      slots: {
        reference: '<button>reference</button>',
        default: '<div>content</div>',
      },
      global: { stubs: { TxTooltip: TooltipStub } },
    })

    const tooltip = wrapper.findComponent(TooltipStub)
    const anchor = tooltip.props('anchor') as Record<string, any>

    expect(tooltip.props('trigger')).toBe('click')
    expect(tooltip.props('interactive')).toBe(false)
    expect(tooltip.props('keepAliveContent')).toBe(true)
    expect(anchor.matchReferenceWidth).toBe(true)
    expect(anchor.closeOnClickOutside).toBe(true)
    expect(anchor.toggleOnReferenceClick).toBe(true)
  })

  it('hover 模式强制 interactive，且关闭外部点击关闭', () => {
    const wrapper = mount(TxPopover, {
      props: { trigger: 'hover' },
      slots: {
        reference: '<button>reference</button>',
        default: '<div>content</div>',
      },
      global: { stubs: { TxTooltip: TooltipStub } },
    })

    const tooltip = wrapper.findComponent(TooltipStub)
    const anchor = tooltip.props('anchor') as Record<string, any>

    expect(tooltip.props('interactive')).toBe(true)
    expect(anchor.closeOnClickOutside).toBe(false)
    expect(anchor.toggleOnReferenceClick).toBe(false)
  })

  it('默认内容 slot 可以拿到 side', () => {
    const wrapper = mount(TxPopover, {
      slots: {
        reference: '<button>reference</button>',
        default: ({ side }: any) => h('span', { class: 'side-value' }, side),
      },
      global: { stubs: { TxTooltip: TooltipStub } },
    })

    expect(wrapper.find('.side-value').text()).toBe('bottom')
  })
})
