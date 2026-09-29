import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { CIRCLE_SHADER_SCALE, PILL_SHADER_SCALE, isMetalFxSupported, type MetalFxInstance } from '../src/engine/renderer/core'
import { updateInstance } from '../src/engine/renderer/loop'
import { useMetalBend } from '../src/use-metal-bend'
import { useMetalTextReflection } from '../src/use-metal-text-reflection'
import TxMetalBadge from '../src/TxMetalBadge.vue'
import TxMetalFx from '../src/TxMetalFx.vue'
import TxMetalText from '../src/TxMetalText.vue'

// jsdom has no WebGL: pin every canvas context to null so the components take
// their documented "no WebGL2" branch (`isMetalFxSupported()` caches the first
// answer, so this must hold for the whole file).
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  if (!('IntersectionObserver' in globalThis)) {
    class IntersectionObserverStub {
      constructor(_cb: IntersectionObserverCallback) {}
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Minimal engine instance — only the fields `updateInstance`'s baseline branch touches. */
const makeInstance = (scale = 1): MetalFxInstance =>
  ({ kind: 'pill', scale, shaderScale: PILL_SHADER_SCALE * scale, ringCssPx: scale } as unknown as MetalFxInstance)

describe('supported', () => {
  it('reports no WebGL2 in jsdom', () => {
    expect(isMetalFxSupported()).toBe(false)
  })
})

describe('txMetalFx', () => {
  it('renders the fallback wrapper around its child without WebGL2', () => {
    const wrapper = mount(TxMetalFx, {
      props: { class: 'host-class' },
      slots: { default: '<button>Upgrade</button>' },
    })
    const fallback = wrapper.find('[data-metal-fx-unsupported]')
    expect(fallback.exists()).toBe(true)
    expect(fallback.classes()).toContain('metal-fx-fallback')
    expect(fallback.classes()).toContain('host-class')
    expect(fallback.find('button').text()).toBe('Upgrade')
    expect(fallback.attributes('style')).toContain('display: inline-flex')
    // The engine's DOM (canvas / glow host) is never mounted.
    expect(wrapper.find('canvas.metal-fx-canvas').exists()).toBe(false)
  })

  it('forwards listener attributes to the fallback wrapper', async () => {
    const onClick = vi.fn()
    const wrapper = mount(TxMetalFx, {
      props: { onClick },
      slots: { default: '<button>Go</button>' },
    })
    await wrapper.find('[data-metal-fx-unsupported]').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('txMetalText', () => {
  it('labels the glyph run with its text', () => {
    const wrapper = mount(TxMetalText, {
      props: { children: 'Plan Pro', font: '500 24px/1 Inter, sans-serif', color: '#eaeaea' },
    })
    const span = wrapper.find('span')
    expect(span.text()).toBe('Plan Pro')
    expect(span.attributes('aria-label')).toBe('Plan Pro')
    // Vue expands the `font` shorthand into its longhands (both survive).
    const style = span.attributes('style') ?? ''
    expect(style).toContain('font-size: 24px')
    expect(style).toContain('font-family: Inter, sans-serif')
    expect(style).toContain('color: rgb(234, 234, 234)')
  })
})

describe('txMetalBadge', () => {
  it('defaults its label to "New"', () => {
    const wrapper = mount(TxMetalBadge)
    const span = wrapper.find('span')
    expect(span.text()).toBe('New')
    expect(span.attributes('aria-label')).toBe('New')
  })

  it('uses the provided label', () => {
    const wrapper = mount(TxMetalBadge, { props: { children: 'Pro' } })
    expect(wrapper.find('span').attributes('aria-label')).toBe('Pro')
  })
})

describe('variant baselines', () => {
  it('maps each variant to its ring / shader-scale baseline', () => {
    expect(PILL_SHADER_SCALE).toBe(1.6)
    expect(CIRCLE_SHADER_SCALE).toBe(1.3)

    const inst = makeInstance()
    updateInstance(inst, { kind: 'circle' })
    expect(inst.ringCssPx).toBe(2)
    expect(inst.shaderScale).toBe(CIRCLE_SHADER_SCALE)

    updateInstance(inst, { kind: 'pill' })
    expect(inst.ringCssPx).toBe(1)
    expect(inst.shaderScale).toBe(PILL_SHADER_SCALE)
  })

  it('scales the baselines by `scale` and honours explicit overrides', () => {
    const inst = makeInstance(2)
    updateInstance(inst, { kind: 'circle' })
    expect(inst.ringCssPx).toBe(4)
    expect(inst.shaderScale).toBe(CIRCLE_SHADER_SCALE * 2)

    updateInstance(inst, { kind: 'pill', shaderScale: 9 })
    expect(inst.shaderScale).toBe(9)
    expect(inst.ringCssPx).toBe(2)
  })
})

describe('cursor composables', () => {
  it('survive a mount / unmount cycle without an engine instance', () => {
    const Host = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        const text = ref<HTMLElement | null>(null)
        useMetalBend(root)
        useMetalTextReflection(text)
        return () => h('div', { ref: root }, [h('span', { ref: text }, 'x')])
      },
    })
    const wrapper = mount(Host)
    expect(wrapper.text()).toBe('x')
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
