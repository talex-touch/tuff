import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, toValue } from 'vue'
import TxAutoSizer from '../src/TxAutoSizer.vue'

const measure = vi.fn(async () => ({ width: 120, height: 48 }))
const refresh = vi.fn(async () => {})
const setEnabled = vi.fn()
const rawFlip = vi.fn(async (action: () => void | Promise<void>) => {
  await action()
})
const autoResizeOptions: any[] = []
const flipOptions: any[] = []
const sizeRef = ref<{ width: number, height: number } | null>({ width: 12, height: 8 })

vi.mock('../../../../utils/animation/auto-resize', () => ({
  useAutoResize: vi.fn((_outer: Ref<HTMLElement | null>, _inner: Ref<HTMLElement | null>, options: unknown) => {
    autoResizeOptions.push(options)
    return {
      refresh,
      measure,
      size: sizeRef,
      setEnabled,
    }
  }),
}))

vi.mock('../../../../utils/animation/flip', () => ({
  useFlip: vi.fn((_target: Ref<HTMLElement | null>, options: unknown) => {
    flipOptions.push(options)
    return {
      flip: rawFlip,
    }
  }),
}))

beforeEach(() => {
  measure.mockClear()
  refresh.mockClear()
  setEnabled.mockClear()
  rawFlip.mockClear()
  autoResizeOptions.length = 0
  flipOptions.length = 0
  sizeRef.value = { width: 12, height: 8 }
})

describe('txAutoSizer', () => {
  it('renders configurable outer and inner tags while merging attrs', () => {
    const wrapper = mount(TxAutoSizer, {
      props: {
        as: 'section',
        innerAs: 'article',
        outerClass: 'outer-size',
        innerClass: 'inner-size',
      },
      attrs: {
        id: 'auto-size-root',
        class: 'external-class',
        style: 'color: red;',
        'data-track': 'panel',
      },
      slots: {
        default: '<span>Measured content</span>',
      },
    })

    const inner = wrapper.find('article')

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['outer-size', 'external-class']))
    expect(wrapper.attributes('id')).toBe('auto-size-root')
    expect(wrapper.attributes('data-track')).toBe('panel')
    expect(wrapper.attributes('style')).toContain('box-sizing: border-box')
    expect(wrapper.attributes('style')).toContain('color: red')
    expect(inner.classes()).toContain('inner-size')
    expect(inner.attributes('style')).toContain('display: flow-root')
    expect(inner.text()).toBe('Measured content')
  })

  it('forwards sizing props to auto-resize and flip utilities', () => {
    mount(TxAutoSizer, {
      props: {
        width: false,
        height: true,
        durationMs: 320,
        easing: 'linear',
        rounding: 'floor',
        immediate: false,
        rafBatch: false,
        observeTarget: 'both',
      },
    })

    // Reactive scalar options are now forwarded as getters (issue #366), so they
    // are read through toValue() instead of being compared as literals. Constant
    // options stay plain. Resolved values match what the old snapshot asserted.
    const arOpts = autoResizeOptions[0]
    expect(toValue(arOpts.width)).toBe(false)
    expect(toValue(arOpts.height)).toBe(true)
    expect(toValue(arOpts.durationMs)).toBe(320)
    expect(toValue(arOpts.easing)).toBe('linear')
    expect(toValue(arOpts.rounding)).toBe('floor')
    expect(toValue(arOpts.immediate)).toBe(false)
    expect(toValue(arOpts.rafBatch)).toBe(false)
    expect(toValue(arOpts.observeTarget)).toBe('both')
    expect(arOpts.applyStyle).toBe(true)
    expect(arOpts.applyMode).toBe('auto')
    expect(arOpts.styleTarget).toBe('outer')
    expect(arOpts.clearStyleOnFinish).toBe(true)

    const fOpts = flipOptions[0]
    expect(fOpts.mode).toBe('size')
    expect(fOpts.includeScale).toBe(false)
    expect(toValue(fOpts.duration)).toBe(320)
    expect(toValue(fOpts.easing)).toBe('linear')
    expect(toValue(fOpts.size.width)).toBe(false)
    expect(toValue(fOpts.size.height)).toBe(true)
  })

  it('keeps forwarded options reactive after setProps (issue #366)', async () => {
    const wrapper = mount(TxAutoSizer, {
      props: {
        width: true,
        height: false,
        durationMs: 200,
        easing: 'ease',
        rounding: 'ceil',
        observeTarget: 'inner',
      },
    })

    const arOpts = autoResizeOptions[0]
    const fOpts = flipOptions[0]

    // Baseline: the captured option getters resolve to the initial props.
    expect(toValue(arOpts.rounding)).toBe('ceil')
    expect(toValue(arOpts.observeTarget)).toBe('inner')
    expect(toValue(arOpts.durationMs)).toBe(200)
    expect(toValue(fOpts.duration)).toBe(200)
    expect(toValue(fOpts.easing)).toBe('ease')
    expect(toValue(fOpts.size.width)).toBe(true)
    expect(toValue(fOpts.size.height)).toBe(false)

    await wrapper.setProps({
      durationMs: 500,
      easing: 'linear',
      width: false,
      height: true,
      rounding: 'floor',
      observeTarget: 'both',
    })

    // Same captured objects now resolve to the updated props. With the old
    // by-value forwarding these would still read 200 / 'ceil' / 'inner' etc.
    // useAutoResize path: rounding / observeTarget (plus duration / easing).
    expect(toValue(arOpts.rounding)).toBe('floor')
    expect(toValue(arOpts.observeTarget)).toBe('both')
    expect(toValue(arOpts.durationMs)).toBe(500)
    expect(toValue(arOpts.easing)).toBe('linear')
    // useFlip path: duration / easing / width / height.
    expect(toValue(fOpts.duration)).toBe(500)
    expect(toValue(fOpts.easing)).toBe('linear')
    expect(toValue(fOpts.size.width)).toBe(false)
    expect(toValue(fOpts.size.height)).toBe(true)
  })

  it('uses inline layout automatically for width-only sizing', () => {
    const wrapper = mount(TxAutoSizer, {
      props: {
        width: true,
        height: false,
      },
    })

    const style = wrapper.attributes('style')

    expect(style).toContain('display: inline-block')
    expect(style).toContain('width: fit-content')
    expect(style).toContain('max-width: 100%')
    expect(style).toContain('flex: 0 0 auto')
  })

  it('keeps block layout when inline is explicitly false', () => {
    const wrapper = mount(TxAutoSizer, {
      props: {
        width: true,
        height: false,
        inline: false,
      },
    })

    expect(wrapper.attributes('style')).not.toContain('inline-block')
  })

  it('exposes refresh, size, focus, and outer element ref', async () => {
    const wrapper = mount(TxAutoSizer, {
      attrs: {
        tabindex: '0',
      },
    })
    const exposed = wrapper.vm as any
    const focus = vi.spyOn(wrapper.element as HTMLElement, 'focus').mockImplementation(() => {})

    await exposed.refresh()
    exposed.focus()

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(exposed.size).toEqual({ width: 12, height: 8 })
    expect(exposed.outerEl).toBe(wrapper.element)
  })

  it('disables auto-resize while running flip actions and measures afterward', async () => {
    const wrapper = mount(TxAutoSizer)
    const action = vi.fn()

    await (wrapper.vm as any).flip(action)

    expect(setEnabled.mock.calls).toEqual([[false], [true]])
    expect(rawFlip).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledTimes(1)
    expect(measure).toHaveBeenCalledWith(true)
  })

  it('returns changed keys from action snapshots', async () => {
    const wrapper = mount(TxAutoSizer, {
      slots: {
        default: '<span>content</span>',
      },
    })
    const exposed = wrapper.vm as any
    const inner = wrapper.find('div[style*="flow-root"]').element as HTMLElement

    Object.defineProperty(inner, 'scrollWidth', { configurable: true, value: 10 })
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 20 })

    const result = await exposed.action((el: HTMLElement) => {
      el.className = 'changed'
      el.setAttribute('data-state', 'open')
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 30 })
    })

    expect(result.changedKeys).toEqual(expect.arrayContaining(['scroll', 'class', 'attrs']))
    expect(result.before.className).toBe('')
    expect(result.after.className).toBe('changed')
    expect(result.after.attrs['data-state']).toBe('open')
    expect(measure).toHaveBeenCalledWith(true)
  })

  it('supports custom action detection and outer target snapshots', async () => {
    const wrapper = mount(TxAutoSizer, {
      attrs: {
        'data-before': '1',
      },
    })
    const detect = vi.fn(() => ({ changedKeys: ['custom'], payload: 42 }))

    const result = await (wrapper.vm as any).action(
      (el: HTMLElement) => {
        el.setAttribute('data-before', '2')
      },
      {
        target: 'outer',
        watch: ['attrs'],
        detect,
      },
    )

    expect(detect).toHaveBeenCalledTimes(1)
    expect(result.changedKeys).toEqual(['custom'])
    expect(result.payload).toBe(42)
    expect(result.before.attrs['data-before']).toBe('1')
    expect(result.after.attrs['data-before']).toBe('2')
  })

  // The tests above use mocked composables, so they only prove TxAutoSizer forwards
  // live getters. These two use the real composables to prove the getter-based `opt`
  // is re-read on each consumption rather than frozen at construction (issue #366).

  it('re-reads useAutoResize options after construction (issue #366 lazy read)', async () => {
    const { useAutoResize } = await vi.importActual<
      typeof import('../../../../utils/animation/auto-resize')
    >('../../../../utils/animation/auto-resize')

    const rounding = ref<'ceil' | 'floor'>('ceil')
    let api: any = null

    const Host = defineComponent({
      setup() {
        const outer = ref<HTMLElement | null>(null)
        const inner = ref<HTMLElement | null>(null)
        api = useAutoResize(outer, inner, {
          rounding: () => rounding.value,
          styleTarget: 'inner',
          immediate: false,
          rafBatch: false,
          applyStyle: false,
        })
        return () => h('div', { ref: outer }, [h('div', { ref: inner, class: 'measured' })])
      },
    })

    const wrapper = mount(Host)
    const innerEl = wrapper.find('.measured').element as HTMLElement
    Object.defineProperty(innerEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 10.4, height: 5.6, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }),
    })

    // 'ceil' rounds the fractional rect up.
    expect(await api.measure()).toEqual({ width: 11, height: 6 })

    // Changing the source must change the result: the option is read lazily, not
    // frozen at construction. A by-value `opt` would keep rounding up here.
    rounding.value = 'floor'
    expect(await api.measure()).toEqual({ width: 10, height: 5 })

    wrapper.unmount()
  })

  it('re-reads useFlip duration on each flip (issue #366 lazy read)', async () => {
    const { useFlip } = await vi.importActual<
      typeof import('../../../../utils/animation/flip')
    >('../../../../utils/animation/flip')

    const durationSpy = vi.fn(() => 180)
    let api: any = null

    const Host = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null)
        api = useFlip(target, {
          mode: 'transform',
          duration: durationSpy,
        })
        return () => h('div', { ref: target }, 'x')
      },
    })

    const wrapper = mount(Host)
    const callsAfterMount = durationSpy.mock.calls.length

    await api.flip(() => {})

    // The duration getter must be invoked at flip time. A by-value `opt` would have
    // stored the getter function itself and never call it (calls stay flat).
    expect(durationSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)

    wrapper.unmount()
  })
})
