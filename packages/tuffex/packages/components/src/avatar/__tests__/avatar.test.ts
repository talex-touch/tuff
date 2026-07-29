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

  it('exposes button semantics and keyboard activation when clickable', async () => {
    const wrapper = mount(TxAvatar, {
      props: { name: 'Clickable', clickable: true },
    })

    // A clickable avatar must be tab-reachable with button semantics.
    expect(wrapper.attributes('role')).toBe('button')
    expect(wrapper.attributes('tabindex')).toBe('0')

    // Enter and Space activate through the same guard as a click.
    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('click')).toHaveLength(2)

    // A static avatar is not a button and stays out of the tab order.
    const staticAvatar = mount(TxAvatar, { props: { name: 'Static' } })
    expect(staticAvatar.attributes('role')).toBeUndefined()
    expect(staticAvatar.attributes('tabindex')).toBeUndefined()
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

  it('injects the group ring inline so it reaches slotted avatars', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { overlap: 10 },
      slots: {
        default: `
          <TxAvatar name="A One" />
          <TxAvatar name="B Two" />
        `,
      },
      global: {
        components: {
          TxAvatar,
        },
      },
    })

    const avatars = wrapper.findAllComponents(TxAvatar)
    expect(avatars).toHaveLength(2)
    // Scoped .tx-avatar-group__item never matches slot content, so the ring border
    // must be injected inline onto every avatar's root.
    for (const avatar of avatars) {
      expect(avatar.attributes('style')).toContain('border: 2px solid')
    }
  })

  it('leaves a grouped avatar\'s own shape intact', () => {
    const wrapper = mount(TxAvatarGroup, {
      slots: {
        default: '<TxAvatar name="A One" shape="square" />',
      },
      global: {
        components: {
          TxAvatar,
        },
      },
    })

    const avatar = wrapper.findComponent(TxAvatar)
    // The ring must not carry an inline border-radius: that would outrank the
    // `shape` classes and force every grouped avatar circular.
    expect(avatar.attributes('style')).not.toContain('border-radius')
    expect(avatar.classes()).toContain('tx-avatar--square')
  })
})
