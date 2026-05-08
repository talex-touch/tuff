import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAvatar from '../src/TxAvatar.vue'
import TxAvatarGroup from '../src/TxAvatarGroup.vue'

describe('txAvatar', () => {
  it('renders initials from names and custom colors', () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Talex DreamSoul',
        backgroundColor: '#111827',
        textColor: '#f9fafb',
      },
    })

    expect(wrapper.find('.tx-avatar__text').text()).toBe('TD')
    expect(wrapper.attributes('style')).toContain('--tx-avatar-bg: #111827')
    expect(wrapper.attributes('style')).toContain('--tx-avatar-text: #f9fafb')
  })

  it('falls back when image loading fails', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        src: '/missing.png',
        alt: 'Missing avatar',
        name: 'Ada Lovelace',
      },
    })

    expect(wrapper.find('img').attributes('alt')).toBe('Missing avatar')

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.tx-avatar__text').text()).toBe('AL')
  })

  it('prioritizes slot over icon and name fallback', () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Slot User',
        icon: 'user',
      },
      slots: {
        default: '<span class="custom-avatar">SU</span>',
      },
    })

    expect(wrapper.find('.custom-avatar').text()).toBe('SU')
    expect(wrapper.find('.tx-avatar__text').exists()).toBe(false)
  })

  it('normalizes custom size and emits click only when clickable', async () => {
    const wrapper = mount(TxAvatar, {
      props: {
        name: 'Clickable',
        size: '56px',
        clickable: true,
      },
    })

    expect(wrapper.attributes('style')).toContain('--tx-avatar-size: 56px')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    const staticAvatar = mount(TxAvatar, {
      props: {
        name: 'Static',
      },
    })
    await staticAvatar.trigger('click')
    expect(staticAvatar.emitted('click')).toBeUndefined()
  })
})

describe('txAvatarGroup', () => {
  it('limits visible avatars and renders extra count', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: {
        max: 2,
        size: 'small',
        overlap: 10,
      },
      slots: {
        default: `
          <TxAvatar name="A One" />
          <TxAvatar name="B Two" />
          <TxAvatar name="C Three" />
        `,
      },
      global: {
        components: {
          TxAvatar,
        },
      },
    })

    const avatars = wrapper.findAllComponents(TxAvatar)
    expect(avatars).toHaveLength(3)
    expect(avatars[0].props('size')).toBe('small')
    expect(avatars[2].text()).toContain('+1')
    expect(wrapper.attributes('style')).toContain('--tx-avatar-group-overlap: 10px')
  })
})
