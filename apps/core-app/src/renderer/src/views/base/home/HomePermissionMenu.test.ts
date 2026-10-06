// @vitest-environment jsdom
/**
 * The permission chip and its menu (`home-composer` › 权限弹层): three rows with no second line,
 * 「完全允许」 confirmed in its own row by a second activation, and the reset row under 「自动审阅」.
 * TxDropdownMenu is stubbed to an in-place panel, as in the model menu's suite.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomePermissionMenu from './HomePermissionMenu.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('@talex-touch/tuffex/dropdown-menu', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    TxDropdownMenu: defineComponent({
      name: 'TxDropdownMenu',
      props: { modelValue: { type: Boolean, default: false } },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        return () =>
          h('div', { class: 'dropdown-stub' }, [
            h(
              'div',
              {
                class: 'dropdown-stub__trigger',
                onClick: () => emit('update:modelValue', !props.modelValue)
              },
              slots.trigger?.()
            ),
            props.modelValue
              ? h('div', { class: 'dropdown-stub__panel', role: 'menu' }, slots.default?.())
              : null
          ])
      }
    })
  }
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function openMenu(mode: 'off' | 'review' | 'full'): Promise<VueWrapper> {
  wrapper = mount(HomePermissionMenu, { props: { mode }, attachTo: document.body })
  await wrapper.get('.ComposerChip').trigger('click')
  await nextTick()
  return wrapper
}

function row(menu: VueWrapper, mode: string) {
  return menu.get(`.HomePermissionMenu-Option[data-mode="${mode}"]`)
}

function panelOpen(menu: VueWrapper): boolean {
  return menu.find('.dropdown-stub__panel').exists()
}

describe('HomePermissionMenu', () => {
  it('labels the chip with the mode alone, in the alarm hue only on 「完全允许」', async () => {
    wrapper = mount(HomePermissionMenu, { props: { mode: 'review' } })
    const chip = wrapper.get('.ComposerChip')
    expect(chip.get('.ComposerChip-Label').text()).toBe('home.permissionMode.review')
    expect(chip.find('.ComposerChip-Prefix').exists()).toBe(false)
    expect(chip.classes()).not.toContain('is-danger')
    // The full state stays in the name, so a chip folded to its shield still says it.
    expect(chip.attributes('aria-label')).toBe('home.permission · home.permissionMode.review')

    await wrapper.setProps({ mode: 'full' })
    expect(wrapper.get('.ComposerChip').classes()).toContain('is-danger')
  })

  it('lists the three modes with no second line, each sentence moved to the row title', async () => {
    const menu = await openMenu('review')

    const rows = menu.findAll('.HomePermissionMenu-Option')
    expect(rows.map((option) => option.attributes('data-mode'))).toEqual(['off', 'review', 'full'])
    expect(rows.map((option) => option.attributes('title'))).toEqual([
      'home.permissionHint.off',
      'home.permissionHint.review',
      'home.permissionHint.full'
    ])
    expect(menu.find('.HomePermissionMenu-ArmHint').exists()).toBe(false)
    expect(row(menu, 'review').attributes('aria-checked')).toBe('true')
    expect(row(menu, 'review').find('.HomePermissionMenu-Check').exists()).toBe(true)
    expect(menu.find('.HomePermissionMenu-Reset').text()).toContain('home.permissionResetApprovals')
    // Opening lands on the current mode, so the arrows start from it.
    await nextTick()
    expect(document.activeElement).toBe(row(menu, 'review').element)
  })

  it('takes 「完全允许」 only on the second activation of its own row', async () => {
    const menu = await openMenu('review')

    await row(menu, 'full').trigger('click')
    expect(menu.emitted('update:mode')).toBeUndefined()
    expect(panelOpen(menu)).toBe(true)
    expect(row(menu, 'full').classes()).toContain('is-arming')
    expect(row(menu, 'full').get('.HomePermissionMenu-ArmHint').text()).toBe(
      'home.permissionFullArm'
    )
    expect(row(menu, 'full').attributes('aria-describedby')).toBe('home-permission-arm-hint')
    expect(menu.get('.HomePermissionMenu-Status').text()).toBe('home.permissionFullArm')

    await row(menu, 'full').trigger('click')
    expect(menu.emitted('update:mode')).toEqual([['full']])
    expect(panelOpen(menu)).toBe(false)
  })

  it('drops a pending confirmation when the menu closes or another mode is chosen', async () => {
    const menu = await openMenu('off')
    await row(menu, 'full').trigger('click')

    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    expect(row(menu, 'full').classes()).not.toContain('is-arming')

    await row(menu, 'full').trigger('click')
    await row(menu, 'review').trigger('click')
    expect(menu.emitted('update:mode')).toEqual([['review']])
  })

  it('applies the other modes at once and returns focus to the chip', async () => {
    const menu = await openMenu('full')
    expect(menu.find('.HomePermissionMenu-Reset').exists()).toBe(false)

    await row(menu, 'off').trigger('click')
    await nextTick()

    expect(menu.emitted('update:mode')).toEqual([['off']])
    expect(panelOpen(menu)).toBe(false)
    expect(document.activeElement).toBe(menu.get('.ComposerChip').element)
  })

  it('resets the remembered approvals from 「自动审阅」 and closes', async () => {
    const menu = await openMenu('review')
    await menu.get('.HomePermissionMenu-Reset').trigger('click')

    expect(menu.emitted('reset')).toHaveLength(1)
    expect(panelOpen(menu)).toBe(false)
  })
})
