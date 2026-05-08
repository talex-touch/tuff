import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

vi.mock('gsap', () => {
  const timeline = () => ({
    to: vi.fn().mockReturnThis(),
    kill: vi.fn(),
  })

  return {
    default: {
      set: vi.fn(),
      timeline,
    },
  }
})

const CardStub = defineComponent({
  name: 'TxCard',
  props: {
    variant: { type: String, default: undefined },
    background: { type: String, default: undefined },
    shadow: { type: String, default: undefined },
    radius: { type: Number, default: undefined },
    padding: { type: Number, default: undefined },
    surfaceMoving: { type: Boolean, default: undefined },
    maskOpacity: { type: Number, default: undefined },
  },
  template: '<div class="tx-card-stub"><slot /></div>',
})

function mountAnchor(options: Parameters<typeof mount<typeof TxBaseAnchor>>[1] = {}) {
  return mount(TxBaseAnchor, {
    attachTo: document.body,
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: '<div class="floating-content">Floating</div>',
      ...(options.slots ?? {}),
    },
    ...options,
    global: {
      ...(options.global ?? {}),
      stubs: {
        TxCard: CardStub,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
}

describe('txBaseAnchor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('toggles uncontrolled state from the reference click and emits open/close updates', async () => {
    const wrapper = mountAnchor()

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(document.body.querySelector('.tx-base-anchor')?.classList.contains('is-open')).toBe(true)

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('blocks opening while disabled and closes if disabled after opening', async () => {
    const wrapper = mountAnchor({
      props: {
        disabled: true,
      },
    })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ disabled: false })
    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    expect(wrapper.emitted('open')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes controlled anchors on outside pointerdown and Escape when enabled', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountAnchor({
      props: {
        modelValue: true,
      },
    })

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('respects close switches and reference click toggle switch', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountAnchor({
      props: {
        modelValue: true,
        closeOnClickOutside: false,
        closeOnEsc: false,
        toggleOnReferenceClick: false,
      },
    })

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.find('.tx-base-anchor__reference').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('forwards floating attrs and reference classes separately', () => {
    mountAnchor({
      props: {
        eager: true,
        referenceClass: ['custom-reference', { active: true }],
      },
      attrs: {
        id: 'floating-panel',
        class: 'custom-floating',
        'data-testid': 'panel',
        style: 'color: red;',
      },
    })

    const reference = document.body.querySelector('.tx-base-anchor__reference')
    const floating = document.body.querySelector<HTMLElement>('#floating-panel')

    expect(reference?.classList.contains('custom-reference')).toBe(true)
    expect(reference?.classList.contains('active')).toBe(true)
    expect(floating?.classList.contains('custom-floating')).toBe(true)
    expect(floating?.dataset.testid).toBe('panel')
    expect(floating?.getAttribute('style')).toContain('color: red')
  })

  it('hard-cuts surface motion adaptation to auto, manual, and off strategies', () => {
    const auto = mountAnchor({
      props: {
        eager: true,
        panelCard: { surfaceMoving: true, maskOpacity: 0.5 },
      },
    })
    expect(auto.findComponent(CardStub).props()).toMatchObject({
      surfaceMoving: false,
      maskOpacity: 0.5,
    })

    const manual = mountAnchor({
      props: {
        eager: true,
        surfaceMotionAdaptation: 'manual',
        panelCard: { surfaceMoving: true },
      },
    })
    expect(manual.findComponent(CardStub).props('surfaceMoving')).toBe(true)

    const off = mountAnchor({
      props: {
        eager: true,
        surfaceMotionAdaptation: 'off',
        panelCard: { surfaceMoving: true },
      },
    })
    expect(off.findComponent(CardStub).props('surfaceMoving')).toBe(false)
  })
})
