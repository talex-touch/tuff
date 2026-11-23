import type { App } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import Miko, { Miko as InstalledMiko } from '../index'

const mountedWrappers: Array<{ unmount: () => void }> = []

function mountTracked(...args: Parameters<typeof mount>) {
  const wrapper = mount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  document.documentElement.removeAttribute('data-low-battery-motion')
  setDocumentHidden(false)
})

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount()
  }
  document.documentElement.removeAttribute('data-low-battery-motion')
  setDocumentHidden(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('txMiko', () => {
  it('renders default state idle with role and aria-label', () => {
    const wrapper = mount(Miko)

    expect(wrapper.classes()).toContain('tx-miko')
    expect(wrapper.classes()).toContain('state-idle')
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Miko: 待命')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders different sizes correctly', () => {
    const wrapperSm = mount(Miko, {
      props: { size: 'sm' },
    })
    expect(wrapperSm.attributes('style')).toContain('width: 54px;')
    expect(wrapperSm.attributes('style')).toContain('height: 30px;')

    const wrapperNum = mount(Miko, {
      props: { size: 60 },
    })
    expect(wrapperNum.attributes('style')).toContain('width: 108px;')
    expect(wrapperNum.attributes('style')).toContain('height: 60px;')
  })

  it('switches state and updates classes and aria-label', async () => {
    const wrapper = mount(Miko, {
      props: { state: 'working' },
    })

    expect(wrapper.classes()).toContain('state-working')
    expect(wrapper.attributes('aria-label')).toBe('Miko: 执行中')
    await vi.waitFor(() => expect(wrapper.find('.paw-l').exists()).toBe(true))
  })

  it('renders new animation states correctly (stretching, purring, box, hacking)', async () => {
    const wrapperStretch = mount(Miko, {
      props: { state: 'stretching' },
    })
    expect(wrapperStretch.classes()).toContain('state-stretching')
    expect(wrapperStretch.attributes('aria-label')).toBe('Miko: 伸懒腰')
    await vi.waitFor(() => expect(wrapperStretch.find('.cat-stretch').exists()).toBe(true))

    const wrapperPurr = mount(Miko, {
      props: { state: 'purring' },
    })
    expect(wrapperPurr.classes()).toContain('state-purring')
    expect(wrapperPurr.attributes('aria-label')).toBe('Miko: 呼噜')
    await vi.waitFor(() => expect(wrapperPurr.find('.cat-purr').exists()).toBe(true))

    const wrapperBox = mount(Miko, {
      props: { state: 'box' },
    })
    expect(wrapperBox.classes()).toContain('state-box')
    expect(wrapperBox.attributes('aria-label')).toBe('Miko: 钻纸箱')
    await vi.waitFor(() => expect(wrapperBox.find('.box-peeker').exists()).toBe(true))

    const wrapperHack = mount(Miko, {
      props: { state: 'hacking' },
    })
    expect(wrapperHack.classes()).toContain('state-hacking')
    expect(wrapperHack.attributes('aria-label')).toBe('Miko: 极客超频')
    await vi.waitFor(() => expect(wrapperHack.find('.sunglasses').exists()).toBe(true))
  })
  it('renders running and demon states correctly', async () => {
    const wrapperRun = mount(Miko, {
      props: { state: 'running' },
    })
    expect(wrapperRun.classes()).toContain('state-running')
    expect(wrapperRun.attributes('aria-label')).toBe('Miko: 奔跑中')
    await vi.waitFor(() => expect(wrapperRun.find('.cat-running').exists()).toBe(true))

    const wrapperDemon = mount(Miko, {
      props: { state: 'demon' },
    })
    expect(wrapperDemon.classes()).toContain('state-demon')
    expect(wrapperDemon.classes()).toContain('is-demon')
    await vi.waitFor(() => expect(wrapperDemon.find('.demon-wing-l').exists()).toBe(true))
  })
  it('renders occupational and whimsical states (coffee, guitar, dj, ninja, magic, space, etc.)', async () => {
    const wrapperCoffee = mount(Miko, {
      props: { state: 'coffee' },
    })
    expect(wrapperCoffee.classes()).toContain('state-coffee')
    expect(wrapperCoffee.attributes('aria-label')).toBe('Miko: 品尝咖啡')
    await vi.waitFor(() => expect(wrapperCoffee.find('.coffee-cup').exists()).toBe(true))

    const wrapperGuitar = mount(Miko, {
      props: { state: 'guitar' },
    })
    expect(wrapperGuitar.classes()).toContain('state-guitar')
    await vi.waitFor(() => expect(wrapperGuitar.find('.guitar-instrument').exists()).toBe(true))

    const wrapperDJ = mount(Miko, {
      props: { state: 'dj' },
    })
    expect(wrapperDJ.classes()).toContain('state-dj')
    await vi.waitFor(() => expect(wrapperDJ.find('.dj-deck').exists()).toBe(true))

    const wrapperMagic = mount(Miko, {
      props: { state: 'magic' },
    })
    expect(wrapperMagic.classes()).toContain('state-magic')
    await vi.waitFor(() => expect(wrapperMagic.find('.wizard-hat').exists()).toBe(true))

    const wrapperSpace = mount(Miko, {
      props: { state: 'space' },
    })
    expect(wrapperSpace.classes()).toContain('state-space')
    await vi.waitFor(() => expect(wrapperSpace.find('.space-helmet').exists()).toBe(true))

    // Test fallback safety net on arbitrary unknown state
    const wrapperFallback = mount(Miko, {
      props: { state: 'unknown_test_state' as any },
    })
    await vi.waitFor(() => expect(wrapperFallback.find('svg g').exists()).toBe(true))
  })
  it('supports interactive click reactions and class', async () => {
    const wrapper = mount(Miko, {
      props: { interactive: true },
    })
    expect(wrapper.classes()).toContain('is-interactive')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('stateChange')).toBeTruthy()
  })

  it('does not turn dizzy on rapid clicks in interactive mode', async () => {
    const wrapper = mount(Miko, {
      props: { interactive: true, mutationChance: 0 },
    })

    await wrapper.trigger('click')
    await wrapper.trigger('click')
    await wrapper.trigger('click')
    await wrapper.trigger('click')

    expect(wrapper.classes()).not.toContain('state-dizzy')
    expect(wrapper.attributes('aria-label')).not.toBe('Miko: 眩晕')
  })

  it('supports custom color', () => {
    const wrapper = mount(Miko, {
      props: { color: '#199FFE' },
    })

    expect(wrapper.attributes('style')).toContain('--tx-miko-body-color: #199FFE;')
  })

  it('emits click event', async () => {
    const wrapper = mount(Miko)
    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() } as unknown as App
    InstalledMiko.install?.(app)

    expect(app.component).toHaveBeenCalledWith('TxMiko', InstalledMiko)
  })

  it('defines reduced-motion and paused rules in miko.css', () => {
    const css = readFileSync(resolve(__dirname, '../src/miko.css'), 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.tx-miko.is-paused')
    expect(css).toContain('animation-play-state: paused !important;')
  })

  it('pauses randomTimer and adds is-paused on blur, hidden, and low-battery and resumes cleanly', async () => {
    vi.useFakeTimers()
    const wrapper = mountTracked(Miko, {
      props: { random: true, randomInterval: 3000, mutationChance: 0 },
    })
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-paused')

    // Blur window -> pauses timer and adds is-paused
    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(wrapper.classes()).toContain('is-paused')

    await vi.advanceTimersByTimeAsync(20_000)
    expect(wrapper.emitted('stateChange')).toBeUndefined()

    // Focus window -> resumes random timer
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-paused')

    await vi.advanceTimersByTimeAsync(5000)
    const countAfterFocus = wrapper.emitted('stateChange')?.length ?? 0
    expect(countAfterFocus).toBeGreaterThanOrEqual(1)

    // Document hidden -> pauses timer again
    setDocumentHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.classes()).toContain('is-paused')

    await vi.advanceTimersByTimeAsync(20_000)
    expect(wrapper.emitted('stateChange')?.length).toBe(countAfterFocus)

    // Document visible -> resumes
    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-paused')

    await vi.advanceTimersByTimeAsync(5000)
    const countAfterVisible = wrapper.emitted('stateChange')?.length ?? 0
    expect(countAfterVisible).toBeGreaterThan(countAfterFocus)

    // Low-battery mode -> pauses timer
    document.documentElement.setAttribute('data-low-battery-motion', '1')
    await Promise.resolve()
    await nextTick()
    expect(wrapper.classes()).toContain('is-paused')

    await vi.advanceTimersByTimeAsync(20_000)
    expect(wrapper.emitted('stateChange')?.length).toBe(countAfterVisible)

    wrapper.unmount()
  })

  it('pauses randomTimer on KeepAlive deactivation and resumes on activation', async () => {
    vi.useFakeTimers()
    const visible = ref(true)
    const onStateChange = vi.fn()

    const Host = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              visible.value
                ? h(Miko, {
                    key: 'miko',
                    random: true,
                    randomInterval: 3000,
                    mutationChance: 0,
                    onStateChange,
                  })
                : null,
          })
      },
    })

    const wrapper = mountTracked(Host)
    await nextTick()

    visible.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(onStateChange).not.toHaveBeenCalled()

    visible.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(onStateChange).toHaveBeenCalled()

    wrapper.unmount()
  })
})
