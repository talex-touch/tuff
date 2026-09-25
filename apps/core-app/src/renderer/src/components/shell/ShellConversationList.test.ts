// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { ProjectEvents } from '@talex-touch/utils/transport/sdk/domains/project'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, provide, ref, watch } from 'vue'
import { useProjectStore } from '~/stores/projects'

import { omniPanelShowEvent } from '../../../../shared/events/omni-panel'
import ShellConversationList from './ShellConversationList.vue'
import ShellSidebar from './ShellSidebar.vue'

const transportSendMock = vi.hoisted(() => vi.fn())
const transportOnMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())
const routeState = vi.hoisted(() => ({
  path: '/home',
  params: {} as Record<string, string>
}))
const historyHolder = vi.hoisted(() => ({
  conversations: undefined as Ref<ConversationRecord[]> | undefined,
  loading: undefined as Ref<boolean> | undefined
}))
/** Reactive like the real settings store, so a folder toggle re-renders and survives a remount. */
const settingsHolder = vi.hoisted(() => ({
  appSetting: undefined as Record<string, unknown> | undefined
}))
const sidebarHolder = vi.hoisted(() => ({
  collapsed: undefined as Ref<boolean> | undefined
}))
/** Hoisted so `mockClear` is typed on the mock, not on a plain Pinia-shaped function. */
const historyRefreshMock = vi.hoisted(() => vi.fn(async () => undefined))
const historyRemoveMock = vi.hoisted(() => vi.fn(async () => undefined))
const listState = vi.hoisted(() => ({
  projects: [] as ProjectRecord[],
  sessions: [] as LocalAiCliSessionSummary[],
  picked: null as ProjectRecord | null,
  discoveryResult: { discovered: 0, skipped: 0, incomplete: false },
  discoveryError: null as Error | null,
  discoveryRows: [] as LocalAiCliSessionSummary[]
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}))

vi.mock('vue-sonner', () => ({ toast: toastMock }))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock,
    on: transportOnMock,
    stream: vi.fn()
  })
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock })
}))

vi.mock('vue-i18n', () => ({
  // Keys as labels: assertions target behaviour, not translated prose.
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: defineComponent({
    name: 'TxSkeleton',
    props: {
      width: { type: [Number, String], default: undefined },
      height: { type: [Number, String], default: undefined },
      radius: { type: [Number, String], default: undefined },
      lines: { type: Number, default: undefined },
      gap: { type: Number, default: undefined }
    },
    setup() {
      return () => h('div', { class: 'tx-skeleton' })
    }
  })
}))

/**
 * The real dropdown only renders its items while open. Rendering the slots eagerly keeps the
 * assertions about *which* actions exist independent of popover mechanics.
 *
 * What it keeps is the order a choice runs in: the item emits `select`, then closes its menu, as
 * TxDropdownItem does. The close is played at its worst — a tick after the change, the way the real
 * menu focuses its first item on open, focus goes back to the trigger as the ARIA menu pattern asks
 * (TxDropdownMenu does not do this today) — so a field focused as soon as a choice renders it would
 * lose the focus again.
 */
vi.mock('@talex-touch/tuffex/dropdown-menu', () => {
  const closeMenu = Symbol('close-menu')
  return {
    TxDropdownMenu: defineComponent({
      name: 'TxDropdownMenu',
      props: {
        modelValue: { type: Boolean, default: false },
        placement: { type: String, default: undefined }
      },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        const trigger = ref<HTMLElement | null>(null)
        provide(closeMenu, () => emit('update:modelValue', false))
        watch(
          () => props.modelValue,
          (open, wasOpen) => {
            if (wasOpen && !open) {
              void nextTick(() => trigger.value?.querySelector('button')?.focus())
            }
          }
        )
        return () =>
          h('div', { class: 'tx-dropdown' }, [
            h(
              'span',
              { ref: trigger, onClick: () => emit('update:modelValue', !props.modelValue) },
              slots.trigger?.()
            ),
            slots.default?.()
          ])
      }
    }),
    TxDropdownItem: defineComponent({
      name: 'TxDropdownItem',
      props: {
        disabled: { type: Boolean, default: false },
        danger: { type: Boolean, default: false }
      },
      emits: ['select'],
      setup(props, { slots, emit }) {
        const close = inject<(() => void) | null>(closeMenu, null)
        return () =>
          h(
            'button',
            {
              type: 'button',
              class: 'tx-dropdown-item',
              disabled: props.disabled,
              onClick: () => {
                if (props.disabled) return
                emit('select')
                close?.()
              }
            },
            slots.default?.()
          )
      }
    })
  }
})

vi.mock('~/modules/conversation/useConversationHistory', () => {
  historyHolder.conversations = ref<ConversationRecord[]>([])
  historyHolder.loading = ref(false)
  return {
    useConversationHistory: () => ({
      conversations: historyHolder.conversations,
      loading: historyHolder.loading,
      refresh: historyRefreshMock,
      remove: historyRemoveMock,
      load: vi.fn(async () => null),
      persist: vi.fn(async () => undefined)
    })
  }
})

// ShellSidebar pulls these in; the behaviour under test does not need their chrome.
vi.mock('./ShellChromeBar.vue', () => ({
  default: defineComponent({
    name: 'ShellChromeBar',
    setup() {
      return () => null
    }
  })
}))
vi.mock('./ShellSearchEntry.vue', () => ({
  default: defineComponent({
    name: 'ShellSearchEntry',
    props: {
      placeholder: { type: String, default: undefined },
      kbd: { type: String, default: undefined }
    },
    emits: ['activate'],
    setup() {
      return () => h('div', { class: 'shell-search-entry' })
    }
  })
}))
vi.mock('./ShellNavGroup.vue', () => ({ default: defineComponent({ name: 'ShellNavGroup' }) }))
vi.mock('./ShellBackRow.vue', () => ({ default: defineComponent({ name: 'ShellBackRow' }) }))

vi.mock('~/modules/layout/useShellSidebar', () => {
  sidebarHolder.collapsed = ref(false)
  return {
    useShellSidebar: () => ({
      collapsed: sidebarHolder.collapsed,
      isDragging: ref(false),
      startDrag: vi.fn()
    })
  }
})

vi.mock('~/modules/settings/categories', () => ({
  groupedSettingNavigation: () => []
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  settingsHolder.appSetting = vue.reactive({})
  return { appSetting: settingsHolder.appSetting }
})

vi.mock('~/modules/hooks/env-hooks', () => ({
  useEnv: () => ({ packageJson: ref({ version: '1.2.3' }) })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: ref(true) })
}))

function project(overrides: Partial<ProjectRecord> & Pick<ProjectRecord, 'id'>): ProjectRecord {
  return {
    rootPath: `/work/${overrides.id}`,
    name: overrides.id,
    pinned: false,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    ...overrides
  }
}

function conversation(
  overrides: Partial<ConversationRecord> & Pick<ConversationRecord, 'id'>
): ConversationRecord {
  return {
    title: overrides.id,
    projectId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function session(
  overrides: Partial<LocalAiCliSessionSummary> & Pick<LocalAiCliSessionSummary, 'sessionRef'>
): LocalAiCliSessionSummary {
  return {
    projectId: null,
    provider: 'pi',
    title: overrides.sessionRef,
    state: 'available',
    origin: 'tuff',
    createdAt: 1,
    updatedAt: 1,
    lastSeenAt: 1,
    ...overrides
  }
}

function settings(): Record<string, unknown> {
  return settingsHolder.appSetting!
}

/** Opens folders the way a previous session would have left them. */
function seedExpanded(...projectIds: string[]): void {
  settings().shell = { sidebarWidth: 260, sidebarCollapsed: false, expandedProjectIds: projectIds }
}

function storedExpandedIds(): unknown {
  return (settings().shell as { expandedProjectIds?: unknown } | undefined)?.expandedProjectIds
}

async function mountList(): Promise<VueWrapper> {
  const wrapper = mount(ShellConversationList, {
    global: { plugins: [createPinia()] }
  })
  await flushPromises()
  return wrapper
}

/**
 * The sidebar, with the real conversation list inside when `withList` is set — the single-highlight
 * rule spans New Chat (sidebar) and the folder and conversation rows (list), so only the two together
 * can show it holds.
 */
async function mountSidebar(
  options: { withList?: boolean; activeProjectId?: string | null } = {}
): Promise<VueWrapper> {
  const wrapper = mount(ShellSidebar, {
    global: {
      plugins: [createPinia()],
      stubs: options.withList ? {} : { ShellConversationList: true }
    }
  })
  if (options.activeProjectId !== undefined) {
    useProjectStore().setActiveProjectId(options.activeProjectId)
  }
  await flushPromises()
  return wrapper
}

function sidebarNav(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.attributes('title') === label)
  if (!button) throw new Error(`Missing sidebar nav item: ${label}`)
  return button
}

function folderNamed(wrapper: VueWrapper, projectId: string): DOMWrapper<Element> {
  const folder = wrapper
    .findAll('.ShellProjectFolder')
    .find((item) => item.find('.ShellProjectFolder-Name').text() === projectId)
  if (!folder) throw new Error(`Missing project folder: ${projectId}`)
  return folder
}

function isExpanded(folder: DOMWrapper<Element>): boolean {
  return folder.find('.ShellProjectFolder-Toggle').attributes('aria-expanded') === 'true'
}

/** Every element the sidebar marks as the current page, by its visible text. */
function currentRows(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[aria-current="page"]').map((item) => item.text())
}

function sentCalls(event: unknown) {
  return transportSendMock.mock.calls.filter(([sent]) => sent === event)
}

function discoverItem(wrapper: VueWrapper) {
  const item = wrapper
    .findAll('.tx-dropdown-item')
    .find((candidate) => candidate.text() === 'shell.projects.discoverSessions')
  if (!item) throw new Error('Missing Discover Local Sessions action')
  return item
}

function menuItem(scope: DOMWrapper<Element>, label: string): DOMWrapper<HTMLElement> {
  const item = scope
    .findAll<HTMLElement>('.tx-dropdown-item')
    .find((candidate) => candidate.text() === label)
  if (!item) throw new Error(`Missing menu item: ${label}`)
  return item
}

/** Presses a key in `field` and reports whether the field claimed it. */
function pressKey(field: DOMWrapper<Element>, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  field.element.dispatchEvent(event)
  return event.defaultPrevented
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

beforeEach(() => {
  routeState.path = '/home'
  routeState.params = {}
  pushMock.mockReset()
  transportSendMock.mockReset()
  transportOnMock.mockReset()
  listState.projects = []
  listState.sessions = []
  listState.picked = null
  listState.discoveryResult = { discovered: 0, skipped: 0, incomplete: false }
  listState.discoveryError = null
  listState.discoveryRows = []
  toastMock.success.mockReset()
  toastMock.warning.mockReset()
  toastMock.error.mockReset()
  toastMock.info.mockReset()
  historyHolder.conversations!.value = []
  historyHolder.loading!.value = false
  historyRefreshMock.mockClear()
  historyRemoveMock.mockClear()
  sidebarHolder.collapsed!.value = false
  for (const key of Object.keys(settings())) delete settings()[key]

  transportOnMock.mockReturnValue(() => undefined)
  transportSendMock.mockImplementation(async (event: unknown, payload?: unknown) => {
    if (event === ProjectEvents.list) return listState.projects
    if (event === ProjectEvents.rename) {
      const { id, name } = payload as { id: string; name: string }
      listState.projects = listState.projects.map((item) =>
        item.id === id ? { ...item, name } : item
      )
      return listState.projects.find((item) => item.id === id)
    }
    if (event === LocalAiCliEvents.session.list) return listState.sessions
    if (event === ProjectEvents.selectDirectory) return listState.picked
    if (event === LocalAiCliEvents.session.discover) {
      if (listState.discoveryError) throw listState.discoveryError
      listState.sessions = [...listState.sessions, ...listState.discoveryRows]
      return listState.discoveryResult
    }
    if (event === LocalAiCliEvents.session.forget) return { forgotten: true }
    if (event === omniPanelShowEvent) return undefined
    throw new Error('Unexpected transport event from the shell sidebar')
  })
})

describe('shellConversationList session rows', () => {
  it('opens only the available session with its opaque refs and blocks missing or conflicting ones', async () => {
    listState.projects = [project({ id: 'p1' })]
    listState.sessions = [
      session({ sessionRef: 'ref-ok', projectId: 'p1', title: 'available' }),
      session({ sessionRef: 'ref-missing', projectId: 'p1', title: 'missing', state: 'missing' }),
      session({ sessionRef: 'ref-conflict', projectId: 'p1', title: 'conflict', state: 'conflict' })
    ]
    seedExpanded('p1')
    const wrapper = await mountList()

    const rows = wrapper.findAll('.ShellProjectRows-Session')
    expect(rows).toHaveLength(3)
    const rowNamed = (title: string) => {
      const row = rows.find((item) => item.text().includes(title))
      if (!row) throw new Error(`Missing session row: ${title}`)
      return row
    }

    expect(rowNamed('available').attributes('disabled')).toBeUndefined()
    expect(rowNamed('missing').attributes('disabled')).toBeDefined()
    expect(rowNamed('conflict').attributes('disabled')).toBeDefined()

    await rowNamed('available').trigger('click')

    expect(
      transportSendMock.mock.calls
        .filter(([event]) => event === omniPanelShowEvent)
        .map(([, payload]) => payload)
    ).toEqual([
      {
        captureSelection: false,
        source: 'project-local-ai',
        localAi: { projectId: 'p1', sessionRef: 'ref-ok', provider: 'pi' }
      }
    ])

    transportSendMock.mockClear()
    await rowNamed('missing').trigger('click')
    await rowNamed('conflict').trigger('click')
    expect(transportSendMock.mock.calls.filter(([event]) => event === omniPanelShowEvent)).toEqual(
      []
    )
  })

  it('forgets only the stored pointer, never reaching for the provider task or terminal', async () => {
    listState.projects = [project({ id: 'p1' })]
    listState.sessions = [session({ sessionRef: 'ref-ok', projectId: 'p1' })]
    seedExpanded('p1')
    const wrapper = await mountList()

    const forget = wrapper
      .findAll('.tx-dropdown-item')
      .find((item) => item.text() === 'shell.projects.forgetPointer')
    if (!forget) throw new Error('Missing Forget Pointer action')
    await forget.trigger('click')
    await flushPromises()

    expect(transportSendMock).toHaveBeenCalledWith(LocalAiCliEvents.session.forget, {
      sessionRef: 'ref-ok'
    })
    const sentEvents = transportSendMock.mock.calls.map(([event]) => event)
    expect(sentEvents).not.toContain(LocalAiCliEvents.task.stream)
    expect(sentEvents).not.toContain(LocalAiCliEvents.terminal.create)
  })
})

describe('shellConversationList project folders', () => {
  it('starts a project conversation from the name without touching the folder', async () => {
    listState.projects = [project({ id: 'p1', name: 'Clickable Project' })]
    const wrapper = await mountList()
    const store = useProjectStore()

    const name = wrapper.find('.ShellProjectFolder-Name')
    expect(name.text()).toBe('Clickable Project')

    await name.trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBe('p1')
    expect(store.activeProjectId).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })

  it('folds and unfolds from the toggle alone, without navigating', async () => {
    listState.projects = [project({ id: 'p1' })]
    historyHolder.conversations!.value = [conversation({ id: 'c1', projectId: 'p1' })]
    const wrapper = await mountList()
    const store = useProjectStore()
    const toggle = wrapper.find('.ShellProjectFolder-Toggle')

    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('aria-label')).toBe('shell.projects.expand')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('shell.projects.collapse')
    expect(wrapper.find('.ShellProjectFolder-Children').text()).toContain('c1')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.ShellProjectFolder-Children').exists()).toBe(false)

    expect(pushMock).not.toHaveBeenCalled()
    expect(store.pendingProjectId).toBeUndefined()
    expect(store.activeProjectId).toBeNull()
  })

  it('reaches toggle, name and actions in that order from the keyboard', async () => {
    listState.projects = [project({ id: 'p1' })]
    const wrapper = await mountList()

    const focusable = wrapper
      .find('.ShellProjectFolder-Row')
      .findAll('button, input')
      .filter((item) => item.attributes('tabindex') !== '-1')
      .slice(0, 3)
      .map((item) => item.classes()[0])

    expect(focusable).toEqual([
      'ShellProjectFolder-Toggle',
      'ShellProjectFolder-Name',
      'ShellProjectFolder-More'
    ])
  })

  it('keeps only the ⋯ menu on the folder row, with New Chat still inside it', async () => {
    listState.projects = [project({ id: 'p1' })]
    const wrapper = await mountList()
    const store = useProjectStore()
    const row = wrapper.find('.ShellProjectFolder-Row')

    const iconButtons = row
      .findAll('button')
      .filter((item) => item.text() === '')
      .map((item) => item.classes()[0])
    expect(iconButtons).toEqual(['ShellProjectFolder-Toggle', 'ShellProjectFolder-More'])
    expect(row.findAll('.tx-dropdown-item').map((item) => item.text())).toEqual([
      'shell.projects.newChat',
      'shell.projects.runLocalAgent',
      'shell.projects.discoverSessions',
      'shell.projects.rename',
      'shell.projects.pin',
      'shell.projects.archive'
    ])

    await row.findAll('.tx-dropdown-item')[0]!.trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })

  it('shows a muted line, not a button, inside an open project with nothing in it', async () => {
    listState.projects = [project({ id: 'p1', name: 'Empty Project' })]
    seedExpanded('p1')
    const wrapper = await mountList()

    const children = wrapper.find('.ShellProjectFolder-Children')
    expect(children.find('.ShellProjectFolder-Empty').text()).toBe('shell.projects.empty')
    expect(children.findAll('button')).toHaveLength(0)
  })

  it('starts every folder closed', async () => {
    listState.projects = [project({ id: 'p1' }), project({ id: 'p2' })]
    historyHolder.conversations!.value = [conversation({ id: 'c1', projectId: 'p1' })]
    const wrapper = await mountList()

    expect(isExpanded(folderNamed(wrapper, 'p1'))).toBe(false)
    expect(isExpanded(folderNamed(wrapper, 'p2'))).toBe(false)
    expect(wrapper.find('.ShellProjectFolder-Children').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('c1')
  })

  it('opens the folder of the project that becomes current', async () => {
    listState.projects = [project({ id: 'p1' }), project({ id: 'p2' })]
    const wrapper = await mountList()

    useProjectStore().setActiveProjectId('p2')
    await nextTick()

    expect(isExpanded(folderNamed(wrapper, 'p2'))).toBe(true)
    expect(isExpanded(folderNamed(wrapper, 'p1'))).toBe(false)
    expect(storedExpandedIds()).toEqual(['p2'])
  })

  it('remembers a hand-opened folder in the shell settings across a remount', async () => {
    listState.projects = [project({ id: 'p1' }), project({ id: 'p2' })]
    const first = await mountList()

    await folderNamed(first, 'p1').find('.ShellProjectFolder-Toggle').trigger('click')
    expect(storedExpandedIds()).toEqual(['p1'])
    first.unmount()

    const second = await mountList()
    expect(isExpanded(folderNamed(second, 'p1'))).toBe(true)
    expect(isExpanded(folderNamed(second, 'p2'))).toBe(false)
  })

  it('forgets folders whose project no longer exists once the projects load', async () => {
    listState.projects = [project({ id: 'p1' })]
    seedExpanded('p1', 'deleted')
    const wrapper = await mountList()

    expect(storedExpandedIds()).toEqual(['p1'])
    expect(isExpanded(folderNamed(wrapper, 'p1'))).toBe(true)
  })
})

describe('shellConversationList project rename', () => {
  it('leaves Enter and Escape to an IME mid-composition, then saves on a plain Enter', async () => {
    listState.projects = [project({ id: 'p1', name: 'Old' })]
    const wrapper = await mountList()

    await menuItem(folderNamed(wrapper, 'Old'), 'shell.projects.rename').trigger('click')
    const field = wrapper.find('input.ShellProjectFolder-Rename')
    await field.setValue('新名')

    // Picking a candidate, closing the candidate list, and the Enter an engine that ends the
    // composition first still marks with keyCode 229: none is the field's, so none is claimed.
    expect(pressKey(field, { key: 'Enter', isComposing: true })).toBe(false)
    expect(pressKey(field, { key: 'Escape', isComposing: true })).toBe(false)
    expect(pressKey(field, { key: 'Enter', keyCode: 229 })).toBe(false)
    await flushPromises()

    expect(sentCalls(ProjectEvents.rename)).toEqual([])
    expect(wrapper.find('input.ShellProjectFolder-Rename').exists()).toBe(true)

    expect(pressKey(field, { key: 'Enter' })).toBe(true)
    await flushPromises()

    expect(sentCalls(ProjectEvents.rename)).toEqual([
      [ProjectEvents.rename, { id: 'p1', name: '新名' }]
    ])
    expect(wrapper.find('input.ShellProjectFolder-Rename').exists()).toBe(false)
    expect(folderNamed(wrapper, '新名').exists()).toBe(true)
  })

  it('abandons the rename on a plain Escape', async () => {
    listState.projects = [project({ id: 'p1', name: 'Old' })]
    const wrapper = await mountList()

    await menuItem(folderNamed(wrapper, 'Old'), 'shell.projects.rename').trigger('click')
    const field = wrapper.find('input.ShellProjectFolder-Rename')
    await field.setValue('Discarded')

    expect(pressKey(field, { key: 'Escape' })).toBe(true)
    await flushPromises()

    expect(sentCalls(ProjectEvents.rename)).toEqual([])
    expect(wrapper.find('input.ShellProjectFolder-Rename').exists()).toBe(false)
    expect(folderNamed(wrapper, 'Old').exists()).toBe(true)
  })

  it('focuses the field with the name selected once the menu has handed focus back', async () => {
    listState.projects = [project({ id: 'p1', name: 'Old Name' })]
    const wrapper = mount(ShellConversationList, {
      attachTo: document.body,
      global: { plugins: [createPinia()] }
    })
    await flushPromises()
    const focused: string[] = []
    const recordFocus = (event: FocusEvent): void => {
      focused.push((event.target as Element).className)
    }
    document.addEventListener('focusin', recordFocus)

    try {
      const folder = folderNamed(wrapper, 'Old Name')
      await folder.find('.ShellProjectFolder-More').trigger('click')
      const rename = menuItem(folder, 'shell.projects.rename')
      // A pointer's mousedown focuses the item before its click lands.
      rename.element.focus()
      await rename.trigger('click')
      await flushPromises()
      await nextFrame()

      const field = wrapper.find<HTMLInputElement>('input.ShellProjectFolder-Rename').element
      expect(document.activeElement).toBe(field)
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Old Name'.length])
      // The menu did take focus back to its trigger; the field took it after that.
      expect(focused).toEqual([
        'tx-dropdown-item',
        'ShellProjectFolder-More',
        'ShellProjectFolder-Rename'
      ])
    } finally {
      document.removeEventListener('focusin', recordFocus)
      wrapper.unmount()
    }
  })
})

describe('shellConversationList sections', () => {
  it('lists Projects, then Chats, then the archived toggle', async () => {
    listState.projects = [project({ id: 'p1' }), project({ id: 'filed', archived: true })]
    historyHolder.conversations!.value = [conversation({ id: 'hi' })]
    const wrapper = await mountList()

    const sections = Array.from(wrapper.find('nav').element.children).map(
      (section) => section.className
    )
    expect(sections).toEqual([
      'ShellConversationList-Section ShellConversationList-Section--projects',
      'ShellConversationList-Section ShellConversationList-Section--chats',
      'ShellConversationList-Archived'
    ])
    const titles = wrapper.findAll('.ShellConversationList-SectionTitle').map((item) => item.text())
    expect(titles).toEqual(['shell.projects.section', 'shell.projects.chats'])
    expect(wrapper.find('.ShellConversationList-Section--chats').text()).toContain('hi')
  })

  it('keeps the Projects title, its +, and a folder offer when there are no projects', async () => {
    listState.picked = project({ id: 'p1', name: 'Picked' })
    const wrapper = await mountList()
    const store = useProjectStore()

    const projectsSection = wrapper.find('.ShellConversationList-Section--projects')
    expect(projectsSection.find('.ShellConversationList-SectionTitle').text()).toBe(
      'shell.projects.section'
    )
    expect(projectsSection.find('.ShellConversationList-SectionAction').exists()).toBe(true)
    expect(wrapper.find('.ShellConversationList-Section--chats').exists()).toBe(false)

    const offer = projectsSection.find('.ShellConversationList-NewFromFolder')
    expect(offer.text()).toBe('shell.projects.newFromFolder')
    await offer.trigger('click')
    await flushPromises()

    expect(sentCalls(ProjectEvents.selectDirectory)).toHaveLength(1)
    expect(store.pendingProjectId).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })

  it('drops the folder offer once a project exists', async () => {
    listState.projects = [project({ id: 'p1' })]
    const wrapper = await mountList()

    expect(wrapper.find('.ShellConversationList-NewFromFolder').exists()).toBe(false)
  })
})

describe('shellConversationList loading skeleton', () => {
  it("stands in for the Projects section in that section's own boxes", async () => {
    let finishHistory = (): void => {}
    historyRefreshMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishHistory = () => resolve(undefined)
        })
    )
    const wrapper = await mountList()

    const skeleton = wrapper.find('.ShellConversationList-Skeleton')
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    // The loaded list's section and header containers, so their metrics cannot drift apart; where
    // the rows' height comes from is held to the loaded rows' by ShellConversationList.geometry.test.ts.
    expect(skeleton.classes()).toContain('ShellConversationList-Section')
    expect(Array.from(skeleton.element.children, (child) => child.className)).toEqual([
      'ShellConversationList-SectionHeader',
      'ShellConversationList-SkeletonRow',
      'ShellConversationList-SkeletonRow',
      'ShellConversationList-SkeletonRow'
    ])
    // Each row: a square the size of a row icon, in the icon column, then the name column with the
    // bar in it — one line of the name's type, which is what makes a loaded row as tall as it is.
    for (const row of skeleton.findAll('.ShellConversationList-SkeletonRow')) {
      expect(Array.from(row.element.children, (child) => child.className)).toEqual([
        'tx-skeleton',
        'ShellConversationList-SkeletonName'
      ])
      const placeholders = row.findAllComponents({ name: 'TxSkeleton' })
      expect(placeholders).toHaveLength(2)
      expect(placeholders[0]!.props()).toMatchObject({
        width: 'var(--shell-row-icon)',
        height: 'var(--shell-row-icon)'
      })
      expect(row.find('.ShellConversationList-SkeletonName > .tx-skeleton').exists()).toBe(true)
    }

    finishHistory()
    await flushPromises()

    expect(wrapper.find('.ShellConversationList-Skeleton').exists()).toBe(false)
    const projectsSection = wrapper.find('.ShellConversationList-Section--projects').element
    expect(projectsSection.firstElementChild?.className).toBe('ShellConversationList-SectionHeader')
  })
})

describe('shellConversationList archived projects', () => {
  it('stays collapsed, then offers only unarchive and refuses to dispatch', async () => {
    listState.projects = [
      project({ id: 'live', name: 'Live' }),
      project({ id: 'filed', name: 'Filed', archived: true })
    ]
    listState.sessions = [session({ sessionRef: 'ref-old', projectId: 'filed', title: 'old work' })]
    historyHolder.conversations!.value = [
      conversation({ id: 'c-filed', projectId: 'filed', updatedAt: 5 })
    ]
    const wrapper = await mountList()

    expect(wrapper.find('.ShellConversationList-ArchivedBody').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('old work')

    await wrapper.find('.ShellConversationList-ArchivedToggle').trigger('click')
    const body = wrapper.find('.ShellConversationList-ArchivedBody')
    expect(body.exists()).toBe(true)

    const header = body.find('.ShellProjectFolder-Row')
    expect(header.find('.ShellProjectFolder-Toggle').element.tagName).toBe('SPAN')
    expect(header.find('.ShellProjectFolder-Name').element.tagName).toBe('SPAN')
    expect(header.findAll('.tx-dropdown-item').map((item) => item.text())).toEqual([
      'shell.projects.unarchive'
    ])
    const bodyActions = body.findAll('.tx-dropdown-item').map((item) => item.text())
    expect(bodyActions).not.toContain('shell.projects.runLocalAgent')
    expect(bodyActions).not.toContain('shell.projects.newChat')

    const archivedSession = body.find('.ShellProjectRows-Session')
    expect(archivedSession.attributes('disabled')).toBeDefined()
    const continueAction = body
      .findAll('.tx-dropdown-item')
      .find((item) => item.text() === 'shell.projects.continue')
    expect(continueAction?.attributes('disabled')).toBeDefined()

    await archivedSession.trigger('click')
    expect(transportSendMock.mock.calls.filter(([event]) => event === omniPanelShowEvent)).toEqual(
      []
    )
  })
})

describe('shell sidebar single current row', () => {
  beforeEach(() => {
    listState.projects = [project({ id: 'talex-touch' })]
    historyHolder.conversations!.value = [
      conversation({ id: 'hi', updatedAt: 3 }),
      conversation({ id: 'in-project', projectId: 'talex-touch', updatedAt: 2 })
    ]
  })

  it('lights only the conversation row on a stored thread', async () => {
    routeState.path = '/home/c/in-project'
    routeState.params = { id: 'in-project' }
    const wrapper = await mountSidebar({ withList: true, activeProjectId: 'talex-touch' })

    expect(currentRows(wrapper)).toEqual(['in-project'])
    expect(folderNamed(wrapper, 'talex-touch').classes()).not.toContain('is-current')
    expect(sidebarNav(wrapper, 'shell.newChat').classes()).not.toContain('active')
  })

  it('lights only the project row, opened, on a blank conversation inside it', async () => {
    const wrapper = await mountSidebar({ withList: true, activeProjectId: 'talex-touch' })
    const folder = folderNamed(wrapper, 'talex-touch')

    expect(currentRows(wrapper)).toEqual(['talex-touch'])
    expect(folder.classes()).toContain('is-current')
    expect(isExpanded(folder)).toBe(true)
    expect(sidebarNav(wrapper, 'shell.newChat').classes()).not.toContain('active')
    expect(wrapper.find('.ShellConversationList-Section--chats').text()).toContain('hi')
  })

  it('lights only New Chat on a blank conversation outside every project', async () => {
    const wrapper = await mountSidebar({ withList: true, activeProjectId: null })

    expect(currentRows(wrapper)).toEqual(['shell.newChat'])
    expect(sidebarNav(wrapper, 'shell.newChat').classes()).toContain('active')
    expect(folderNamed(wrapper, 'talex-touch').classes()).not.toContain('is-current')
  })

  it('leaves the project row alone on another page, where that page is current', async () => {
    routeState.path = '/store'
    const wrapper = await mountSidebar({ withList: true, activeProjectId: 'talex-touch' })

    expect(currentRows(wrapper)).toEqual(['shell.store'])
  })
})

describe('shellConversationList new project', () => {
  it('leaves the shell parked on Home when the folder picker is cancelled', async () => {
    listState.picked = null
    const wrapper = await mountList()
    const store = useProjectStore()

    const add = wrapper.find('.ShellConversationList-SectionAction')
    expect(add.attributes('aria-label')).toBe('shell.newProject')
    await add.trigger('click')
    await flushPromises()

    expect(sentCalls(ProjectEvents.selectDirectory)).toHaveLength(1)
    expect(store.pendingProjectId).toBeUndefined()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('starts a blank Home conversation owned by the folder the user picked', async () => {
    listState.picked = project({ id: 'p1', name: 'Picked' })
    const wrapper = await mountList()
    const store = useProjectStore()

    await wrapper.find('.ShellConversationList-SectionAction').trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBe('p1')
    expect(store.consumePendingProjectId()).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })
})

describe('shellSidebar navigation', () => {
  it('clears the pending project owner when New Chat is chosen', async () => {
    listState.picked = project({ id: 'p1' })
    const wrapper = await mountSidebar({ withList: true })
    const store = useProjectStore()

    await wrapper.find('.ShellConversationList-SectionAction').trigger('click')
    await flushPromises()
    expect(store.pendingProjectId).toBe('p1')

    await sidebarNav(wrapper, 'shell.newChat').trigger('click')

    expect(store.pendingProjectId).toBeNull()
  })

  it('moves New Project off the expanded nav and keeps it on the rail', async () => {
    const expanded = await mountSidebar()
    expect(
      expanded.findAll('button').filter((item) => item.attributes('title') === 'shell.newProject')
    ).toHaveLength(0)
    expanded.unmount()

    sidebarHolder.collapsed!.value = true
    listState.picked = project({ id: 'p1' })
    const rail = await mountSidebar()
    const store = useProjectStore()

    await sidebarNav(rail, 'shell.newProject').trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })
})

describe('shellConversationList session discovery', () => {
  it('does not scan provider archives until the user asks for this project', async () => {
    listState.projects = [project({ id: 'p1' })]
    await mountList()

    expect(sentCalls(LocalAiCliEvents.session.discover)).toEqual([])
  })

  it('adopts discovered sessions for the requested project, refreshes rows, and reports the count', async () => {
    listState.projects = [project({ id: 'p1' })]
    listState.discoveryResult = { discovered: 1, skipped: 0, incomplete: false }
    listState.discoveryRows = [
      session({
        sessionRef: 'ref-adopted',
        projectId: 'p1',
        title: 'adopted',
        origin: 'discovered'
      })
    ]
    seedExpanded('p1')
    const wrapper = await mountList()
    const listCallsBefore = sentCalls(LocalAiCliEvents.session.list).length

    await discoverItem(wrapper).trigger('click')
    await flushPromises()

    expect(sentCalls(LocalAiCliEvents.session.discover)).toEqual([
      [LocalAiCliEvents.session.discover, { projectId: 'p1' }]
    ])
    expect(sentCalls(LocalAiCliEvents.session.list).length).toBeGreaterThan(listCallsBefore)
    expect(wrapper.text()).toContain('adopted')
    expect(toastMock.success).toHaveBeenCalledWith('shell.projects.discoveryComplete')
  })

  it('maps empty, bounded, and failed scans to distinct feedback without adding rows', async () => {
    const scenarios = [
      {
        result: { discovered: 0, skipped: 0, incomplete: false },
        method: 'info' as const,
        key: 'shell.projects.discoveryEmpty'
      },
      {
        result: { discovered: 3, skipped: 0, incomplete: true },
        method: 'warning' as const,
        key: 'shell.projects.discoveryPartial'
      }
    ]

    for (const scenario of scenarios) {
      toastMock.success.mockReset()
      toastMock.warning.mockReset()
      toastMock.error.mockReset()
      toastMock.info.mockReset()
      listState.projects = [project({ id: 'p1' })]
      listState.discoveryResult = scenario.result
      seedExpanded('p1')
      const wrapper = await mountList()

      await discoverItem(wrapper).trigger('click')
      await flushPromises()

      expect(toastMock[scenario.method]).toHaveBeenCalledWith(scenario.key)
      expect(wrapper.find('.ShellProjectFolder-Children').exists()).toBe(true)
      expect(wrapper.findAll('.ShellProjectRows-Session')).toHaveLength(0)
      wrapper.unmount()
    }

    toastMock.error.mockReset()
    listState.discoveryError = new Error('discovery failed')
    seedExpanded('p1')
    const wrapper = await mountList()

    await discoverItem(wrapper).trigger('click')
    await flushPromises()

    expect(toastMock.error).toHaveBeenCalledWith('shell.projects.discoveryFailed')
    expect(wrapper.find('.ShellProjectFolder-Children').exists()).toBe(true)
    expect(wrapper.findAll('.ShellProjectRows-Session')).toHaveLength(0)
  })
})
