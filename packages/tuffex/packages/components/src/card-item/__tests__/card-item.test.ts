import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCardItem from '../src/TxCardItem.vue'

describe('txCardItem', () => {
  it('renders title, subtitle, description, and icon avatar', () => {
    const wrapper = mount(TxCardItem, {
      props: {
        title: 'Sync settings',
        subtitle: 'Workspace',
        description: 'Keeps devices aligned.',
        iconClass: 'i-carbon-settings',
      },
    })

    expect(wrapper.attributes('role')).toBe('button')
    expect(wrapper.attributes('tabindex')).toBe('-1')
    expect(wrapper.find('.tx-card-item__title').text()).toBe('Sync settings')
    expect(wrapper.find('.tx-card-item__subtitle').text()).toBe('Workspace')
    expect(wrapper.find('.tx-card-item__desc').text()).toBe('Keeps devices aligned.')
    expect(wrapper.find('.tx-card-item__avatar--icon i').classes()).toContain('i-carbon-settings')
    expect(wrapper.classes()).not.toContain('tx-card-item--no-left')
  })

  it('maps avatar size and rounded shape to CSS variables', () => {
    const wrapper = mount(TxCardItem, {
      props: {
        avatarText: 'AI',
        avatarSize: 48,
        avatarShape: 'rounded',
      },
    })

    const left = wrapper.find('.tx-card-item__left')

    expect(left.attributes('style')).toContain('--tx-card-item-avatar-size: 48px')
    expect(left.attributes('style')).toContain('--tx-card-item-avatar-radius: 12px')
    expect(wrapper.find('.tx-card-item__avatar--text').text()).toBe('AI')
  })

  it('prefers avatar url over icon class and avatar text', () => {
    const wrapper = mount(TxCardItem, {
      props: {
        avatarUrl: 'https://example.test/avatar.png',
        iconClass: 'i-carbon-user',
        avatarText: 'TU',
      },
    })

    const image = wrapper.find('.tx-card-item__avatar-img')

    expect(image.exists()).toBe(true)
    expect(image.attributes('src')).toBe('https://example.test/avatar.png')
    expect(wrapper.find('.tx-card-item__avatar--icon').exists()).toBe(false)
    expect(wrapper.find('.tx-card-item__avatar--text').exists()).toBe(false)
  })

  it('renders custom slots and suppresses empty optional sections', () => {
    const wrapper = mount(TxCardItem, {
      slots: {
        avatar: '<span class="custom-avatar">A</span>',
        title: '<strong>Custom title</strong>',
        subtitle: '<span>Custom subtitle</span>',
        description: '<p>Custom description</p>',
        right: '<button type="button">Open</button>',
      },
    })

    expect(wrapper.find('.custom-avatar').text()).toBe('A')
    expect(wrapper.find('.tx-card-item__title').text()).toBe('Custom title')
    expect(wrapper.find('.tx-card-item__subtitle').text()).toBe('Custom subtitle')
    expect(wrapper.find('.tx-card-item__desc').text()).toBe('Custom description')
    expect(wrapper.find('.tx-card-item__right button').text()).toBe('Open')
  })

  it('marks active and clickable states and emits click from mouse and Enter', async () => {
    const wrapper = mount(TxCardItem, {
      props: {
        clickable: true,
        active: true,
      },
    })

    expect(wrapper.classes()).toContain('tx-card-item--clickable')
    expect(wrapper.classes()).toContain('tx-card-item--active')
    expect(wrapper.attributes('tabindex')).toBe('0')

    await wrapper.trigger('click')
    await wrapper.trigger('keydown.enter')

    expect(wrapper.emitted('click')).toHaveLength(2)
  })

  it('blocks click events and focus when disabled', async () => {
    const wrapper = mount(TxCardItem, {
      props: {
        clickable: true,
        disabled: true,
      },
    })

    expect(wrapper.classes()).toContain('tx-card-item--disabled')
    expect(wrapper.attributes('tabindex')).toBe('-1')

    await wrapper.trigger('click')
    await wrapper.trigger('keydown.enter')

    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('marks no-left layout when no avatar source is provided', () => {
    const wrapper = mount(TxCardItem, {
      props: {
        title: 'No icon',
      },
    })

    expect(wrapper.classes()).toContain('tx-card-item--no-left')
    expect(wrapper.find('.tx-card-item__left').exists()).toBe(false)
  })
})
