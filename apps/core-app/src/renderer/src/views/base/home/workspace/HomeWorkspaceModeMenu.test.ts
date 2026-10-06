// @vitest-environment jsdom
/**
 * The mode chip and its menu (`home-composer` › 对话与智能体弹层): one flat list of 「对话」 and the
 * enabled profiles, the profile switches one level down in 「管理智能体」, and the states around
 * them. TxDropdownMenu is stubbed to an in-place panel that, like the anchor, closes on Escape at the
 * document; TxSwitch and TxSkeleton are the real ones.
 */
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomeWorkspaceModeMenu from './HomeWorkspaceModeMenu.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('@talex-touch/tuffex/dropdown-menu', async () => {
  const { defineComponent, h, onBeforeUnmount, onMounted } = await import('vue')
  return {
    TxDropdownMenu: defineComponent({
      name: 'TxDropdownMenu',
      props: { modelValue: { type: Boolean, default: false } },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        const onKeydown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape' && props.modelValue) emit('update:modelValue', false)
        }
        onMounted(() => document.addEventListener('keydown', onKeydown))
        onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
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

function profile(id: string, name: string, enabled = true): AiAgentProfile {
  return {
    id,
    name,
    enabled,
    runtimeProvider: 'pi-core',
    allowedToolIds: ['file.read', 'file.list'],
    permissionPolicy: { mode: 'manual' }
  } as unknown as AiAgentProfile
}

const COORDINATOR = profile('tuff-pi', 'Tuff Pi Coordinator')
const RESEARCHER = profile('research', '资料研究员', false)

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountMenu(props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(HomeWorkspaceModeMenu, {
    props: {
      mode: 'chat',
      profileId: undefined,
      profiles: [COORDINATOR, RESEARCHER],
      profilesLoading: false,
      profilesError: false,
      profileSaving: null,
      branchOnChange: false,
      locked: false,
      ...props
    },
    attachTo: document.body
  })
  return wrapper
}

async function openMenu(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const menu = mountMenu(props)
  await menu.get('.ComposerChip').trigger('click')
  await nextTick()
  return menu
}

function rowNames(menu: VueWrapper): string[] {
  return menu
    .findAll('.HomeWorkspaceModeMenu-Row[role="menuitemradio"]')
    .map((row) => row.get('.HomeWorkspaceModeMenu-Name').text())
}

function rowNamed(menu: VueWrapper, name: string) {
  const found = menu
    .findAll('.HomeWorkspaceModeMenu-Row')
    .find((row) => row.find('.HomeWorkspaceModeMenu-Name').text() === name)
  if (!found) throw new Error(`no row ${name}`)
  return found
}

/** Escape where focus is, as the keyboard sends it; the stubbed anchor closes at the document. */
async function pressEscape(): Promise<void> {
  ;(document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await nextTick()
  await nextTick()
}

describe('HomeWorkspaceModeMenu', () => {
  it('names the chip after the mode or the profile, never with a prefix', async () => {
    const menu = mountMenu()
    expect(menu.get('.ComposerChip-Label').text()).toBe('home.workspace.mode.chat')

    await menu.setProps({ mode: 'agent', profileId: 'tuff-pi' })
    expect(menu.get('.ComposerChip-Label').text()).toBe('Tuff Pi Coordinator')
    expect(menu.get('.ComposerChip').classes()).not.toContain('is-danger')
    expect(menu.get('.ComposerChip').attributes('aria-label')).toBe(
      'home.workspace.mode.menu · Tuff Pi Coordinator'
    )
  })

  it('lists 「对话」 and the enabled profiles by name only, and reads them again on every open', async () => {
    const menu = await openMenu()

    expect(rowNames(menu)).toEqual(['home.workspace.mode.chat', 'Tuff Pi Coordinator'])
    expect(menu.find('.HomeWorkspaceModeMenu-Hint').exists()).toBe(false)
    // Positive control below: the same finder sees both switches in 「管理智能体」.
    expect(menu.findAllComponents({ name: 'TuffSwitch' })).toHaveLength(0)
    expect(rowNamed(menu, 'home.workspace.mode.chat').attributes('aria-checked')).toBe('true')
    expect(menu.emitted('load-profiles')).toHaveLength(1)
    // Opening lands on the current choice, so the arrows start from it.
    await nextTick()
    expect(document.activeElement).toBe(rowNamed(menu, 'home.workspace.mode.chat').element)
  })

  it('turns a picked profile into Agent mode with that profile, and 「对话」 back into Chat', async () => {
    const menu = await openMenu()
    await rowNamed(menu, 'Tuff Pi Coordinator').trigger('click')
    expect(menu.emitted('select-agent')).toEqual([['tuff-pi']])

    await menu.setProps({ mode: 'agent', profileId: 'tuff-pi' })
    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    await rowNamed(menu, 'home.workspace.mode.chat').trigger('click')
    expect(menu.emitted('select-chat')).toHaveLength(1)
  })

  it('says a mode change continues in a branch, and holds it while a reply runs', async () => {
    const menu = await openMenu({ branchOnChange: true })
    expect(menu.get('.HomeWorkspaceModeMenu-Note').text()).toBe('home.workspace.mode.branchHint')

    await menu.setProps({ locked: true })
    expect(menu.get('.HomeWorkspaceModeMenu-Note').text()).toBe('home.workspace.mode.branchLocked')
    const agentRow = rowNamed(menu, 'Tuff Pi Coordinator')
    expect(agentRow.attributes('aria-disabled')).toBe('true')
    await agentRow.trigger('click')
    expect(menu.emitted('select-agent')).toBeUndefined()
  })

  it('keeps the switches one level down, in 「管理智能体」, and starts every open on the list', async () => {
    const menu = await openMenu()
    await rowNamed(menu, 'home.workspace.profile.manage').trigger('click')
    await nextTick()

    expect(menu.get('.HomeWorkspaceModeMenu-Back').text()).toContain(
      'home.workspace.profile.manage'
    )
    const rows = menu.findAll('.HomeWorkspaceModeMenu-ManageRow')
    expect(rows.map((row) => row.get('.HomeWorkspaceModeMenu-Name').text())).toEqual([
      'Tuff Pi Coordinator',
      '资料研究员'
    ])
    expect(rows[0]!.get('.HomeWorkspaceModeMenu-Hint').text()).toBe(
      'home.workspace.profile.summary'
    )
    expect(rows[1]!.classes()).toContain('is-disabled')
    expect(menu.findAllComponents({ name: 'TuffSwitch' })).toHaveLength(2)

    await rows[1]!.findComponent({ name: 'TuffSwitch' }).vm.$emit('update:modelValue', true)
    expect(menu.emitted('toggle-profile')).toEqual([[RESEARCHER, true]])

    await menu.get('.HomeWorkspaceModeMenu-Back').trigger('click')
    expect(rowNames(menu)).toEqual(['home.workspace.mode.chat', 'Tuff Pi Coordinator'])

    await menu.get('.HomeWorkspaceModeMenu-Row[role="menuitem"]').trigger('click')
    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    expect(menu.find('.HomeWorkspaceModeMenu-Back').exists()).toBe(false)
  })

  it('keeps the switch being saved enabled and in focus, and drops its repeat presses', async () => {
    const menu = await openMenu()
    await rowNamed(menu, 'home.workspace.profile.manage').trigger('click')
    await nextTick()
    const switches = () => menu.findAll('[role="switch"]')
    ;(switches()[0]!.element as HTMLElement).focus()

    await menu.setProps({ profileSaving: 'tuff-pi' })
    // A disabled control drops focus to the page (Chromium's focus fixup; jsdom does not run it, so
    // the attribute is what is asserted). The other switches wait out the save.
    expect(switches()[0]!.attributes('disabled')).toBeUndefined()
    expect(switches()[0]!.attributes('aria-busy')).toBe('true')
    expect(switches()[1]!.attributes('disabled')).toBeDefined()
    expect(document.activeElement).toBe(switches()[0]!.element)

    await switches()[0]!.trigger('click')
    expect(menu.emitted('toggle-profile')).toBeUndefined()

    await menu.setProps({ profileSaving: null })
    expect(switches()[0]!.attributes('aria-busy')).toBeUndefined()
    await switches()[0]!.trigger('click')
    expect(menu.emitted('toggle-profile')).toEqual([[COORDINATOR, false]])
  })

  it('returns focus to the chip when Escape closes the menu, even after focus fell to the page', async () => {
    const menu = await openMenu()
    await nextTick()
    expect(document.activeElement).toBe(rowNamed(menu, 'home.workspace.mode.chat').element)
    await pressEscape()
    expect(menu.find('.dropdown-stub__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(menu.get('.ComposerChip').element)

    // A press on a locked row lands on the group behind it, and focus leaves for the page.
    await menu.setProps({ branchOnChange: true, locked: true })
    await menu.get('.ComposerChip').trigger('click')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(rowNamed(menu, 'home.workspace.mode.chat').element)
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)
    await pressEscape()
    expect(menu.find('.dropdown-stub__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(menu.get('.ComposerChip').element)
  })

  it('leaves focus the user moved out of the menu where it is when Escape closes it', async () => {
    const menu = await openMenu()
    const elsewhere = document.body.appendChild(document.createElement('button'))
    elsewhere.focus()

    await pressEscape()
    expect(menu.find('.dropdown-stub__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(elsewhere)
  })

  it('shows a skeleton row on the first read and the reason when there is nothing to run', async () => {
    const loading = await openMenu({ profiles: [], profilesLoading: true })
    expect(loading.find('.HomeWorkspaceModeMenu-Skeleton').exists()).toBe(true)
    loading.unmount()

    const failed = await openMenu({ profiles: [], profilesError: true })
    expect(failed.get('[role="alert"]').text()).toContain('home.workspace.profile.loadFailed')
    await failed.get('.HomeWorkspaceModeMenu-Link').trigger('click')
    expect(failed.emitted('load-profiles')).toHaveLength(2)
    failed.unmount()

    const none = await openMenu({ profiles: [] })
    expect(none.get('.HomeWorkspaceModeMenu-State').text()).toBe('home.workspace.profile.none')
    none.unmount()

    const off = await openMenu({ profiles: [RESEARCHER] })
    expect(off.get('.HomeWorkspaceModeMenu-State').text()).toBe(
      'home.workspace.profile.noneEnabled'
    )
  })

  it('warns in the chip and the menu when the profile the conversation names can no longer run', async () => {
    const menu = await openMenu({ mode: 'agent', profileId: 'research' })

    expect(menu.get('.ComposerChip').classes()).toContain('is-danger')
    expect(menu.get('.HomeWorkspaceModeMenu-State.is-danger').text()).toBe(
      'home.workspace.profile.unavailable'
    )
  })
})
