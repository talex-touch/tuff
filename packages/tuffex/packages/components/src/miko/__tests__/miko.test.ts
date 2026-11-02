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
