// @vitest-environment jsdom

import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { VueWrapper } from '@vue/test-utils'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import ShellProjectFolder from './ShellProjectFolder.vue'

/**
 * The project menu against the real tuffex dropdown, where ShellConversationList.test.ts stands in
 * a mock. The mock cannot catch a slot name or an attribute the real components route elsewhere —
 * TxDropdownItem's root is TxCardItem, which takes `title` as a prop — so this file mounts them.
 */

const transportSendMock = vi.hoisted(() => vi.fn())
const statusState = vi.hoisted(() => ({ current: undefined as unknown }))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    on: vi.fn(() => () => undefined),
    stream: vi.fn()
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

/**
 * The floating layer is the one piece left out: both slots render in place and a click on the
 * reference toggles it, which is all TxDropdownMenu and TxDropdownSubmenu ask of their popover.
 */
const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { class: 'popover-stub' }, [
        h(
          'div',
          {
            class: 'popover-stub__reference',
            onClick: () => emit('update:modelValue', !props.modelValue)
          },
          slots.reference?.()
        ),
        h('div', { class: 'popover-stub__content' }, slots.default?.())
      ])
  }
})

function agent(
  id: LocalAiCliProviderId,
  overrides: Partial<LocalAiCliProviderStatus> = {}
): LocalAiCliProviderStatus {
  return {
    id,
    label: id,
    enabled: true,
    installed: true,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    },
    ...overrides
  }
}

function agentStatus(providers: LocalAiCliProviderStatus[]): LocalAiCliStatus {
  return { betaAvailable: true, enabled: true, defaultProvider: null, providers }
}

const project: ProjectRecord = {
  id: 'p1',
  rootPath: '/work/p1',
  name: 'Tuff',
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1
}

const mounted: VueWrapper[] = []

async function mountFolder(): Promise<VueWrapper> {
  const wrapper = mount(ShellProjectFolder, {
    attachTo: document.body,
    props: { project, rows: [], activeId: null },
    global: { plugins: [createPinia()], stubs: { TxPopover: PopoverStub } }
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function openMenu(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('.ShellProjectFolder-More').trigger('click')
  await flushPromises()
}

/** The root menu's own rows, in order: its items and the submenu's trigger row, not the nested panel. */
function rootItems(wrapper: VueWrapper) {
  return wrapper
    .findAll('[role="menuitem"]')
    .filter((item) => !item.element.closest('.tx-dropdown-submenu__panel'))
}

function agentItems(wrapper: VueWrapper) {
  return wrapper.findAll('.tx-dropdown-submenu__panel [role="menuitem"]')
}

beforeEach(() => {
  transportSendMock.mockReset()
  statusState.current = agentStatus([
    agent('pi', { label: 'Pi', installed: false }),
    agent('claude', { label: 'Claude Code' })
  ])
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (event === LocalAiCliEvents.status.get) return statusState.current
    throw new Error('Unexpected transport event from the project folder')
  })
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('shellProjectFolder menu on the real tuffex dropdown', () => {
  it('walks the grouped rows with the arrow keys, submenu row included', async () => {
    const wrapper = await mountFolder()
    await openMenu(wrapper)

    const items = rootItems(wrapper)
    expect(items.map((item) => item.text())).toEqual([
      'shell.projects.newChat',
      'shell.projects.openInLocalAgent',
      'shell.projects.adoptSessions',
      'shell.projects.rename',
      'shell.projects.pin',
      'shell.projects.archive'
    ])
    const submenuRow = items[1]!
    expect(submenuRow.classes()).toContain('tx-dropdown-submenu__trigger')
    expect(submenuRow.attributes('aria-haspopup')).toBe('menu')

    // Opening focuses the first row; the group wrappers do not stop the menu's arrow traversal.
    await nextTick()
    expect(document.activeElement).toBe(items[0]!.element)
    const visited: string[] = []
    for (let step = 0; step < items.length - 1; step++) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      )
      visited.push((document.activeElement as HTMLElement).textContent?.trim() ?? '')
    }
    expect(visited).toEqual(items.slice(1).map((item) => item.text()))
  })

  it('names its groups for screen readers, shows no headings, and leads every row with an icon', async () => {
    const wrapper = await mountFolder()
    await openMenu(wrapper)

    const groups = wrapper.findAll('[role="group"]')
    expect(groups.map((group) => group.attributes('aria-label'))).toEqual([
      'shell.projects.chats',
      'shell.projects.groupLocalAgents',
      'shell.projects.groupProject'
    ])
    // The names stay out of the visible text: a heading only repeated what its rows say.
    for (const name of [
      'shell.projects.chats',
      'shell.projects.groupLocalAgents',
      'shell.projects.groupProject'
    ]) {
      expect(wrapper.text()).not.toContain(name)
    }
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(2)

    const icons = rootItems(wrapper).map((item) => {
      const glyphs = item.findAll('.ShellProjectFolder-MenuIcon')
      expect(glyphs).toHaveLength(1)
      expect(glyphs[0]!.attributes('aria-hidden')).toBe('true')
      return glyphs[0]!.classes().find((name) => name.startsWith('i-ri-'))
    })
    expect(icons).toEqual([
      'i-ri-chat-new-line',
      'i-ri-terminal-box-line',
      'i-ri-download-2-line',
      'i-ri-edit-line',
      'i-ri-pushpin-line',
      'i-ri-archive-line'
    ])
  })

  it('lists the agents with the reason a blocked one cannot run, and opens the chosen one', async () => {
    const wrapper = await mountFolder()
    await openMenu(wrapper)

    const agents = agentItems(wrapper)
    expect(agents.map((item) => item.find('.ShellProjectFolder-Agent').text())).toEqual([
      'Pi',
      'Claude Code'
    ])
    expect(agents.map((item) => item.attributes('aria-disabled'))).toEqual(['true', undefined])
    // The reason rides in TxDropdownItem's `right` slot, beside the name.
    expect(agents[0]!.find('.tx-card-item__right .ShellProjectFolder-AgentNote').text()).toBe(
      'shell.projects.agentNotInstalled'
    )
    expect(agents[1]!.find('.tx-card-item__right').exists()).toBe(false)

    await agents[0]!.trigger('click')
    expect(wrapper.emitted('runAgent')).toBeUndefined()

    await agents[1]!.trigger('click')
    expect(wrapper.emitted('runAgent')).toEqual([['claude']])
  })

  it.each([
    ['off macOS', { betaAvailable: false, enabled: false }],
    ['while the master switch in Settings is off', { betaAvailable: true, enabled: false }]
  ])('leaves the local-agent group out %s', async (_when, gate) => {
    statusState.current = { ...agentStatus([agent('claude', { label: 'Claude Code' })]), ...gate }
    const wrapper = await mountFolder()
    await openMenu(wrapper)
    expect(rootItems(wrapper).map((item) => item.text())).toEqual([
      'shell.projects.newChat',
      'shell.projects.rename',
      'shell.projects.pin',
      'shell.projects.archive'
    ])
    expect(
      wrapper.find('[role="group"][aria-label="shell.projects.groupLocalAgents"]').exists()
    ).toBe(false)
    // One hairline left, between the two groups that remain.
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1)
  })

  it('puts the adopt hint where the DOM keeps it', async () => {
    const wrapper = await mountFolder()

    const adopt = rootItems(wrapper).find((item) => item.text() === 'shell.projects.adoptSessions')
    expect(adopt?.attributes('title')).toBeUndefined()
    expect(adopt?.find('span[title]').attributes('title')).toBe('shell.projects.adoptSessionsHint')
  })

  it('wears the corners flow light, which its agent submenu inherits', async () => {
    const wrapper = await mountFolder()

    // TxDropdownSubmenu takes the root's `panelCard.flowLight` when it sets none of its own. The
    // stub declares only `modelValue`, so the card props arrive as attributes.
    const cardOf = (popover: VueWrapper | undefined) =>
      (popover?.vm.$attrs as Record<string, unknown> | undefined)?.['panel-card']
    const [root, submenu] = wrapper.findAllComponents({ name: 'TxPopover' })
    expect(cardOf(root)).toEqual({ flowLight: 'corners' })
    expect(cardOf(submenu)).toMatchObject({ flowLight: 'corners' })
  })
})
