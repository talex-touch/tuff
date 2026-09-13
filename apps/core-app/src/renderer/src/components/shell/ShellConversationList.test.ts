// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { ProjectEvents } from '@talex-touch/utils/transport/sdk/domains/project'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
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
/** Hoisted so `mockClear` is typed on the mock, not on a plain Pinia-shaped function. */
const historyRefreshMock = vi.hoisted(() => vi.fn(async () => undefined))
const historyRemoveMock = vi.hoisted(() => vi.fn(async () => undefined))
const listState = vi.hoisted(() => ({
  projects: [] as ProjectRecord[],
  sessions: [] as LocalAiCliSessionSummary[],
  picked: null as ProjectRecord | null
}))

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
 */
vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: defineComponent({
    name: 'TxDropdownMenu',
    props: {
      modelValue: { type: Boolean, default: false },
      placement: { type: String, default: undefined }
    },
    emits: ['update:modelValue'],
    setup(_props, { slots }) {
      return () => h('div', { class: 'tx-dropdown' }, [slots.trigger?.(), slots.default?.()])
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
      return () =>
        h(
          'button',
          {
            type: 'button',
            class: 'tx-dropdown-item',
            disabled: props.disabled,
            onClick: () => {
              if (!props.disabled) emit('select')
            }
          },
          slots.default?.()
        )
    }
  })
}))

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

// ShellSidebar pulls these in; the picker behaviour under test does not need their chrome.
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

vi.mock('~/modules/layout/useShellSidebar', () => ({
  useShellSidebar: () => ({ collapsed: ref(false), isDragging: ref(false), startDrag: vi.fn() })
}))

vi.mock('~/modules/settings/categories', () => ({
  groupedSettingNavigation: () => []
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {}
}))

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

async function mountList(): Promise<VueWrapper> {
  const wrapper = mount(ShellConversationList, {
    global: { plugins: [createPinia()] }
  })
  await flushPromises()
  return wrapper
}

async function mountSidebar(): Promise<VueWrapper> {
  const wrapper = mount(ShellSidebar, {
    global: {
      plugins: [createPinia()],
      stubs: { ShellConversationList: true }
    }
  })
  await flushPromises()
  return wrapper
}

function sidebarNav(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.attributes('title') === label)
  if (!button) throw new Error(`Missing sidebar nav item: ${label}`)
  return button
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
  historyHolder.conversations!.value = []
  historyHolder.loading!.value = false
  historyRefreshMock.mockClear()
  historyRemoveMock.mockClear()

  transportOnMock.mockReturnValue(() => undefined)
  transportSendMock.mockImplementation(async (event: unknown) => {
    if (event === ProjectEvents.list) return listState.projects
    if (event === LocalAiCliEvents.session.list) return listState.sessions
    if (event === ProjectEvents.selectDirectory) return listState.picked
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

    const header = body.find('.ShellConversationList-ProjectHeader')
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

describe('shellSidebar project picker', () => {
  it('leaves the shell parked on Home when the folder picker is cancelled', async () => {
    listState.picked = null
    const wrapper = await mountSidebar()
    const store = useProjectStore()

    await sidebarNav(wrapper, 'shell.newProject').trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBeUndefined()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('starts a blank Home conversation owned by the folder the user picked', async () => {
    listState.picked = project({ id: 'p1', name: 'Picked' })
    const wrapper = await mountSidebar()
    const store = useProjectStore()

    await sidebarNav(wrapper, 'shell.newProject').trigger('click')
    await flushPromises()

    expect(store.pendingProjectId).toBe('p1')
    expect(store.consumePendingProjectId()).toBe('p1')
    expect(pushMock).toHaveBeenCalledWith('/home')
  })

  it('clears the pending project owner when New Chat is chosen', async () => {
    listState.picked = project({ id: 'p1' })
    const wrapper = await mountSidebar()
    const store = useProjectStore()

    await sidebarNav(wrapper, 'shell.newProject').trigger('click')
    await flushPromises()
    expect(store.pendingProjectId).toBe('p1')

    await sidebarNav(wrapper, 'shell.newChat').trigger('click')

    expect(store.pendingProjectId).toBeNull()
  })
})
