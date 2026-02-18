import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import TxTooltip from '../src/TxTooltip.vue'

const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: {
    modelValue: { type: Boolean, default: false },
    keepAliveContent: { type: Boolean, default: false },
    closeOnClickOutside: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: `
    <div class="tx-base-anchor-stub" :data-keep-alive-content="String(keepAliveContent)">
      <slot name="reference" />
      <slot :side="'left'" />
    </div>
  `,
})

describe('txTooltip', () => {
  it('keepAliveContent 默认值为 false，可显式开启', () => {
    const wrapper = mount(TxTooltip, {
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })
    expect(wrapper.find('.tx-base-anchor-stub').attributes('data-keep-alive-content')).toBe('false')

    wrapper.unmount()

    const keepAliveWrapper = mount(TxTooltip, {
      props: { keepAliveContent: true },
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })
    expect(keepAliveWrapper.find('.tx-base-anchor-stub').attributes('data-keep-alive-content')).toBe('true')
  })

  it('content slot 可以拿到 side 上下文', () => {
    const wrapper = mount(TxTooltip, {
      slots: {
        default: '<button>reference</button>',
        content: ({ side }: any) => h('span', { class: 'side-value' }, side),
      },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(wrapper.find('.side-value').text()).toBe('left')
  })

  it('click trigger 默认点击外部关闭，且支持通过 props 覆盖关闭行为', () => {
    const clickWrapper = mount(TxTooltip, {
      props: { trigger: 'click' },
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(clickWrapper.findComponent(BaseAnchorStub).props('closeOnClickOutside')).toBe(true)

    clickWrapper.unmount()

    const manualWrapper = mount(TxTooltip, {
      props: {
        trigger: 'click',
        closeOnClickOutside: false,
      },
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(manualWrapper.findComponent(BaseAnchorStub).props('closeOnClickOutside')).toBe(false)
  })
})
