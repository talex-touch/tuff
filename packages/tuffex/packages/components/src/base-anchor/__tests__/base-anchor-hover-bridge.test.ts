import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, shallowRef, toValue } from 'vue'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

/**
 * floating-ui has no layout to work with in jsdom, so `useFloating` is
 * intercepted: the test records the middleware it was handed and plays the
 * part of its result, middleware data included.
 */
const captured: Array<Record<string, unknown>> = []
const middlewareData = shallowRef<Record<string, unknown>>({})

vi.mock('@floating-ui/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@floating-ui/vue')>()
  return {
    ...actual,
    useFloating: (_reference: unknown, _floating: unknown, options: Record<string, unknown>) => {
      captured.push(options)
      return {
        floatingStyles: computed(() => ({})),
        middlewareData,
        placement: ref('bottom-end'),
        x: ref(0),
        y: ref(0),
        strategy: ref('absolute'),
        isPositioned: ref(true),
        update: vi.fn(),
      }
    },
  }
})

function middleware() {
  return (toValue(captured.at(-1)?.middleware) ?? []) as Array<{ name: string, fn: (state: unknown) => { data?: unknown } }>
}

function mountAnchor(props: Record<string, unknown> = {}) {
  return mount(TxBaseAnchor, {
    attachTo: document.body,
    props: { modelValue: false, ...props },
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: '<div class="floating-content">Floating</div>',
    },
  })
}

const BOX = { left: 0, top: -11, width: 220, height: 12, clipPath: 'polygon(188px 0px, 220px 0px, 220px 12px, 0px 12px)' }

beforeEach(() => {
  captured.length = 0
  middlewareData.value = {}
  document.body.innerHTML = ''
})

describe('txBaseAnchor hover bridge', () => {
  it('measures the trough last in the chain, and only when asked', async () => {
    const wrapper = mountAnchor()
    expect(middleware().map(entry => entry.name)).not.toContain('hoverBridge')

    await wrapper.setProps({ hoverBridge: true })
    expect(middleware().map(entry => entry.name).at(-1)).toBe('hoverBridge')
  })

  it('lays the measured box out inside the floating layer', async () => {
    mountAnchor({ hoverBridge: true })
    const bridge = middleware().find(entry => entry.name === 'hoverBridge')!
    const result = bridge.fn({
      x: 212,
      y: 62,
      placement: 'bottom-end',
      rects: { reference: { x: 400, y: 20, width: 32, height: 32 }, floating: { width: 220, height: 140 } },
    })

    expect(result.data).toEqual({ box: BOX })
  })

  it('writes `box: null` once the gap closes, so the merged data drops the old box', () => {
    mountAnchor({ hoverBridge: true })
    const bridge = middleware().find(entry => entry.name === 'hoverBridge')!
    const result = bridge.fn({
      x: 212,
      y: 40,
      placement: 'bottom-end',
      rects: { reference: { x: 400, y: 20, width: 32, height: 32 }, floating: { width: 220, height: 140 } },
    })

    expect(result.data).toEqual({ box: null })
  })

  it('renders the bridge only while open', async () => {
    middlewareData.value = { hoverBridge: { box: BOX } }
    const wrapper = mountAnchor({ hoverBridge: true })
    await nextTick()
    expect(document.querySelector('.tx-base-anchor__bridge')).toBeNull()

    await wrapper.setProps({ modelValue: true })
    await nextTick()
    const bridge = document.querySelector<HTMLElement>('.tx-base-anchor__bridge')!
    expect(bridge.style.top).toBe('-11px')
    expect(bridge.style.width).toBe('220px')
    expect(bridge.style.clipPath).toBe(BOX.clipPath)
    // Part of the floating layer, so entering it is entering the panel.
    expect(bridge.closest('.tx-base-anchor')).not.toBeNull()

    // A closing panel has let the pointer go.
    await wrapper.setProps({ modelValue: false })
    await nextTick()
    expect(document.querySelector('.tx-base-anchor__bridge')).toBeNull()
  })

  it('never renders one for an anchor that did not ask', async () => {
    middlewareData.value = { hoverBridge: { box: BOX } }
    mountAnchor({ modelValue: true })
    await nextTick()

    expect(document.querySelector('.tx-base-anchor__bridge')).toBeNull()
  })

  it('reports pointer enter and leave for the whole floating layer', async () => {
    const wrapper = mountAnchor({ modelValue: true })
    await nextTick()
    const floating = document.querySelector<HTMLElement>('.tx-base-anchor')!

    floating.dispatchEvent(new MouseEvent('mouseenter'))
    floating.dispatchEvent(new MouseEvent('mouseleave'))

    expect(wrapper.emitted('floating-enter')).toHaveLength(1)
    expect(wrapper.emitted('floating-leave')).toHaveLength(1)
  })

  it('exposes the geometry a hover transit aims at', async () => {
    const wrapper = mountAnchor({ modelValue: true })
    await nextTick()
    const exposed = wrapper.vm as unknown as {
      getPanelRect: () => DOMRect | null
      containsFloating: (target: Node) => boolean
      getSide: () => string
    }

    expect(exposed.getPanelRect()).not.toBeNull()
    expect(exposed.containsFloating(document.querySelector('.floating-content')!)).toBe(true)
    expect(exposed.containsFloating(document.querySelector('.reference-button')!)).toBe(false)
    expect(exposed.getSide()).toBe('bottom')
  })
})
