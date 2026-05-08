import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
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

    expect(autoResizeOptions[0]).toMatchObject({
      width: false,
      height: true,
      applyStyle: true,
      applyMode: 'auto',
      styleTarget: 'outer',
      observeTarget: 'both',
      rounding: 'floor',
      immediate: false,
      rafBatch: false,
      durationMs: 320,
      easing: 'linear',
      clearStyleOnFinish: true,
    })
    expect(flipOptions[0]).toMatchObject({
      mode: 'size',
      duration: 320,
      easing: 'linear',
      includeScale: false,
      size: {
        width: false,
        height: true,
      },
    })
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
})
