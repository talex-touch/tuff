import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxTooltip from '../src/TxTooltip.vue'

const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: {
    modelValue: { type: Boolean, default: false },
    keepAliveContent: { type: Boolean, default: false },
    closeOnClickOutside: { type: Boolean, default: false },
    animation: { type: Object, default: undefined },
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

  it('forwards default anchor animation as object config', () => {
    const wrapper = mount(TxTooltip, {
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(wrapper.findComponent(BaseAnchorStub).props('animation')).toEqual({
      type: 'transfer',
      duration: 432,
      ease: 'back.out(2)',
    })
  })

  it('merges legacy anchor duration and ease into animation fallback', () => {
    const wrapper = mount(TxTooltip, {
      props: { anchor: { duration: 260, ease: 'power2.out' } },
      slots: { default: '<button>reference</button>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(wrapper.findComponent(BaseAnchorStub).props('animation')).toEqual({
      type: 'transfer',
      duration: 260,
      ease: 'power2.out',
    })
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

  it('honors an explicit max-height even when a content slot is present (#466)', () => {
    const wrapper = mount(TxTooltip, {
      props: { maxHeight: 320 },
      slots: {
        default: '<button>reference</button>',
        content: '<div>Body</div>',
      },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    // 320 used to double as the "unset" sentinel, so an explicit 320 with a content
    // slot was silently turned into `none` and the panel grew unbounded.
    expect(wrapper.find('.tx-tooltip').attributes('style')).toContain('--tx-tooltip-max-height: 320px')
  })

  it('leaves height unconstrained by default when a content slot is present', () => {
    const wrapper = mount(TxTooltip, {
      slots: {
        default: '<button>reference</button>',
        content: '<div>Body</div>',
      },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(wrapper.find('.tx-tooltip').attributes('style')).toContain('--tx-tooltip-max-height: none')
  })

  it('links the reference to the tooltip body via aria-describedby while open (#7)', () => {
    const wrapper = mount(TxTooltip, {
      props: { modelValue: true },
      slots: { default: '<button>reference</button>', content: '<div>Hint</div>' },
      global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    const id = wrapper.find('.tx-tooltip').attributes('id')
    expect(id).toBeTruthy()
    // The reference must describe itself with the tooltip body while it is open.
    expect(wrapper.find('.tx-tooltip__reference').attributes('aria-describedby')).toBe(id)
  })

  it('opens on keyboard focus in the default hover mode (#7)', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxTooltip, {
        props: { openDelay: 0 },
        slots: { default: '<button>reference</button>' },
        global: { stubs: { TxBaseAnchor: BaseAnchorStub } },
      })

      // Default trigger is hover; focus alone must still open the tooltip.
      await wrapper.find('.tx-tooltip__reference').trigger('focusin')
      vi.runAllTimers()
      await nextTick()

      expect(wrapper.emitted('open')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
    }
    finally {
      vi.useRealTimers()
    }
  })
})
