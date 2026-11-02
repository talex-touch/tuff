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
    expect(wrapperSm.attributes('style')).toContain('width: 48px;')
    expect(wrapperSm.attributes('style')).toContain('height: 32px;')

    const wrapperNum = mount(Miko, {
      props: { size: 60 },
    })
    expect(wrapperNum.attributes('style')).toContain('width: 90px;')
    expect(wrapperNum.attributes('style')).toContain('height: 60px;')
  })

  it('switches state and updates classes and aria-label', () => {
    const wrapper = mount(Miko, {
      props: { state: 'working' },
    })

    expect(wrapper.classes()).toContain('state-working')
    expect(wrapper.attributes('aria-label')).toBe('Miko: 执行中')
    expect(wrapper.find('.paw-l').exists()).toBe(true)
  })

  it('renders new animation states correctly (stretching, purring, box, hacking)', () => {
    const wrapperStretch = mount(Miko, {
      props: { state: 'stretching' },
    })
    expect(wrapperStretch.classes()).toContain('state-stretching')
    expect(wrapperStretch.attributes('aria-label')).toBe('Miko: 伸懒腰')
    expect(wrapperStretch.find('.cat-stretch').exists()).toBe(true)

    const wrapperPurr = mount(Miko, {
      props: { state: 'purring' },
    })
    expect(wrapperPurr.classes()).toContain('state-purring')
    expect(wrapperPurr.attributes('aria-label')).toBe('Miko: 呼噜')
    expect(wrapperPurr.find('.cat-purr').exists()).toBe(true)

    const wrapperBox = mount(Miko, {
      props: { state: 'box' },
    })
    expect(wrapperBox.classes()).toContain('state-box')
    expect(wrapperBox.attributes('aria-label')).toBe('Miko: 钻纸箱')
    expect(wrapperBox.find('.box-peeker').exists()).toBe(true)

    const wrapperHack = mount(Miko, {
      props: { state: 'hacking' },
    })
    expect(wrapperHack.classes()).toContain('state-hacking')
    expect(wrapperHack.attributes('aria-label')).toBe('Miko: 极客超频')
    expect(wrapperHack.find('.sunglasses').exists()).toBe(true)
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

  it('triggers dizzy reaction on rapid clicks in interactive mode', async () => {
    const wrapper = mount(Miko, {
      props: { interactive: true },
    })

    await wrapper.trigger('click')
    await wrapper.trigger('click')
    await wrapper.trigger('click')
    await wrapper.trigger('click')

    expect(wrapper.classes()).toContain('state-dizzy')
    expect(wrapper.attributes('aria-label')).toBe('Miko: 眩晕')
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
