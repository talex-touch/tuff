import type { App } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Miko, { Miko as InstalledMiko } from '../index'

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
})
