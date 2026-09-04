import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { TxPopover } from '../../popover'
import TxAvatar from '../src/TxAvatar.vue'
import TxAvatarGroup from '../src/TxAvatarGroup.vue'

const avatarSource = readFileSync(
  resolve(process.cwd(), 'packages/components/src/avatar/src/TxAvatar.vue'),
  'utf8',
)

/**
 * The status-dot fix is pure CSS and `mount` does not apply `<style scoped>`, so
 * these rules can only be asserted against the source. Slice out one rule body at
 * a time — an open-ended match would run past the selector into a later rule and
 * stay green after the line under test was deleted.
 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1)
    throw new Error(`rule not found: ${selector}`)
  const bodyStart = start + `\n${selector} {`.length
  const end = css.indexOf('\n}', bodyStart)
  if (end === -1)
    throw new Error(`unterminated rule: ${selector}`)
  return css.slice(bodyStart, end)
}

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

  it('keeps stacking offsets out of inline styles so :hover can override them', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { overlap: 10 },
      slots: {
        default: `
          <TxAvatar name="A One" />
          <TxAvatar name="B Two" />
        `,
      },
      global: { components: { TxAvatar } },
    })

    const avatars = wrapper.findAllComponents(TxAvatar)
    for (const [index, avatar] of avatars.entries()) {
      const style = avatar.attributes('style') ?? ''
      // Inline wins over every selector, so a hovered avatar could never lift or
      // come forward while these two lived here.
      expect(style).not.toContain('margin-left')
      expect(style).not.toContain('z-index')
      expect(style).toContain(`--tx-avatar-group-index: ${index + 1}`)
    }
  })

  it('exposes hover affordances as root classes', () => {
    const slots = { default: '<TxAvatar name="A One" />' }
    const global = { components: { TxAvatar } }

    const byDefault = mount(TxAvatarGroup, { slots, global })
    expect(byDefault.classes()).toContain('is-hover-lift')
    expect(byDefault.classes()).not.toContain('is-spread-hover')

    const disabled = mount(TxAvatarGroup, { props: { hoverEffect: 'none' }, slots, global })
    expect(disabled.classes()).not.toContain('is-hover-lift')

    const spread = mount(TxAvatarGroup, {
      props: { spreadOnHover: true, spreadOverlap: 4 },
      slots,
      global,
    })
    expect(spread.classes()).toContain('is-spread-hover')
    expect(spread.attributes('style')).toContain('--tx-avatar-group-spread-overlap: 4px')
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

/**
 * The real anchor teleports its panel and waits on a floating-position pass, so
 * panel content is stubbed open here — same approach popover.test.ts takes.
 */
const BaseAnchorStub = defineComponent({
  name: 'TxBaseAnchor',
  props: ['referenceClass'],
  setup(props, { slots }) {
    return () => h('div', { class: ['anchor-stub', props.referenceClass] }, [
      slots.reference?.(),
      h('div', { class: 'anchor-content' }, slots.default?.({ side: 'top' })),
    ])
  },
})

describe('txAvatarGroup overflow popover', () => {
  const overflowSlots = {
    default: `
      <TxAvatar name="A One" />
      <TxAvatar name="B Two" />
      <TxAvatar name="C Three" />
      <TxAvatar name="D Four" />
    `,
  }
  const global = { components: { TxAvatar } }

  it('adds no floating layer while the popover is off', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { max: 2 },
      slots: overflowSlots,
      global,
    })

    expect(wrapper.findComponent(TxPopover).exists()).toBe(false)
    expect(wrapper.find('.tx-avatar-group__more').classes()).toContain('tx-avatar-group__item')
  })

  it('wraps the +N avatar once the popover is on', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { max: 2, overflowPopover: true },
      slots: overflowSlots,
      global,
    })

    const popover = wrapper.findComponent(TxPopover)
    expect(popover.exists()).toBe(true)
    // The reference element becomes the flex item, so it is what must carry the
    // stacking classes...
    expect(popover.props('referenceClass')).toEqual([
      'tx-avatar-group__item',
      'tx-avatar-group__more-ref',
    ])
    // ...and the avatar inside it must not, or the negative margin applies twice.
    expect(wrapper.find('.tx-avatar-group__more').classes()).not.toContain('tx-avatar-group__item')
  })

  it('skips the popover when nothing overflowed', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { max: 4, overflowPopover: true },
      slots: overflowSlots,
      global,
    })

    expect(wrapper.findComponent(TxPopover).exists()).toBe(false)
  })

  it('renders the hidden avatars in the default panel', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { max: 2, overflowPopover: true },
      slots: overflowSlots,
      global: { ...global, stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    const grid = wrapper.find('.tx-avatar-group__overflow-grid')
    expect(grid.exists()).toBe(true)

    // The panel holds the two avatars `max` cut off — not all four, and not the +N.
    const panelAvatars = grid.findAllComponents(TxAvatar)
    expect(panelAvatars.map(avatar => avatar.props('name'))).toEqual(['C Three', 'D Four'])
  })

  it('lets the overflow slot replace the panel and read the count', () => {
    const wrapper = mount(TxAvatarGroup, {
      props: { max: 1, overflowPopover: true },
      slots: {
        ...overflowSlots,
        overflow: '<span class="custom-panel">{{ params.count }}/{{ params.nodes.length }}</span>',
      },
      global: { ...global, stubs: { TxBaseAnchor: BaseAnchorStub } },
    })

    expect(wrapper.find('.tx-avatar-group__overflow-grid').exists()).toBe(false)
    expect(wrapper.find('.custom-panel').text()).toBe('3/3')
  })
})

describe('txAvatar status dot geometry', () => {
  const style = avatarSource.slice(avatarSource.indexOf('<style scoped>'))

  it('does not clip at the root', () => {
    // The root is both the shape and the status dot's positioning context. Clipping
    // here shaves a corner-anchored dot down to a sliver on every rounded shape.
    expect(ruleBody(style, '.tx-avatar')).not.toContain('overflow: hidden')
  })

  it('clips the image and fallback instead, so the shape survives', () => {
    expect(ruleBody(style, '.tx-avatar__image')).toContain('border-radius: inherit')

    const fallback = ruleBody(style, '.tx-avatar__fallback')
    expect(fallback).toContain('border-radius: inherit')
    expect(fallback).toContain('overflow: hidden')
  })

  it('insets the dot per shape rather than pinning it to the bounding box corner', () => {
    expect(ruleBody(style, '.tx-avatar--circle')).toContain('--tx-avatar-status-inset')
    expect(ruleBody(style, '.tx-avatar--square')).toContain('--tx-avatar-status-inset')
    expect(ruleBody(style, '.tx-avatar--rounded')).toContain('--tx-avatar-status-inset')

    const status = ruleBody(style, '.tx-avatar__status')
    expect(status).toContain('bottom: var(--tx-avatar-status-inset')
    expect(status).toContain('right: var(--tx-avatar-status-inset')
    // Without border-box the ring is added outside the size variable, so the dot
    // measures wider than the inset maths (and the docs) assume.
    expect(status).toContain('box-sizing: border-box')
  })
})
