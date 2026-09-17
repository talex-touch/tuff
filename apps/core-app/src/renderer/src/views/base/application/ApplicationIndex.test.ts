// @vitest-environment jsdom
import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry
} from '@talex-touch/utils/transport/events/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ApplicationIndex from './ApplicationIndex.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

const state = vi.hoisted(() => ({
  listEntries: vi.fn(),
  listSummaries: vi.fn(),
  diagnose: vi.fn(),
  setEntryEnabled: vi.fn(),
  reindex: vi.fn(),
  removeEntry: vi.fn(),
  launch: vi.fn(),
  usage: vi.fn(),
  getAliases: vi.fn(),
  setAliases: vi.fn(),
  getShortcut: vi.fn(),
  setShortcut: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useSettingsSdk: () => ({
    appIndex: {
      listEntries: state.listEntries,
      listSummaries: state.listSummaries,
      diagnose: state.diagnose,
      setEntryEnabled: state.setEntryEnabled,
      reindex: state.reindex,
      removeEntry: state.removeEntry,
      launch: state.launch,
      usage: state.usage,
      getAliases: state.getAliases,
      setAliases: state.setAliases,
      getShortcut: state.getShortcut,
      setShortcut: state.setShortcut
    }
  })
}))

function entry(overrides: Partial<AppIndexManagedEntry> = {}): AppIndexManagedEntry {
  return {
    path: '/Applications/Calculator.app',
    name: 'Calculator',
    displayName: 'Calculator',
    enabled: true,
    source: 'scanned',
    launchKind: 'path',
    launchTarget: '/Applications/Calculator.app',
    ...overrides
  }
}

function diagnostic(overrides: Partial<AppIndexDiagnoseResult> = {}): AppIndexDiagnoseResult {
  return {
    success: true,
    status: 'found',
    target: '/Applications/Calculator.app',
    ...overrides
  } as AppIndexDiagnoseResult
}

function mountPage() {
  return mount(ApplicationIndex, {
    global: {
      stubs: {
        // The shell is covered by its own callers; here it only has to render the slots and
        // forward the search it owns.
        SettingsPage: {
          name: 'SettingsPage',
          props: ['search'],
          emits: ['update:search'],
          template: '<div><slot name="aside" /><slot name="detail" /><slot name="overlay" /></div>'
        },
        AppList: {
          name: 'AppList',
          props: ['items', 'selectedId', 'loading', 'loadFailed', 'searched'],
          template: '<div />'
        },
        AppDetail: {
          name: 'AppDetail',
          props: ['entry', 'diagnostic', 'diagnosing', 'busy'],
          template: '<div />'
        },
        AppIndexLaunchZoneDrawer: true,
        TxButton: { template: '<button><slot /></button>' }
      }
    }
  })
}

describe('ApplicationIndex', () => {
  beforeEach(() => {
    // Selecting an entry fans out to usage, aliases and the shortcut. Without defaults every
    // selection in every test logs three rejections that have nothing to do with what it asserts.
    state.usage.mockResolvedValue({ success: true, executeCount: 0 })
    state.getAliases.mockResolvedValue({ success: true, aliases: [] })
    state.getShortcut.mockResolvedValue({ success: true, accelerator: null })
    state.listSummaries.mockResolvedValue({ success: true, summaries: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * This page used to read the CoreBox search session, whose empty query returns that surface's
   * recommendations — five rows against an index of a hundred and fifty. The managed-entry list
   * is the index, so every indexed application is listed whether or not search would surface it.
   */
  it('lists every indexed entry, including ones excluded from recall', async () => {
    state.listEntries.mockResolvedValue([
      entry(),
      entry({ path: '/Applications/Terminal.app', name: 'Terminal', displayName: 'Terminal' }),
      entry({
        path: '/Applications/Hidden.app',
        name: 'Hidden',
        displayName: 'Hidden',
        enabled: false
      })
    ])

    const wrapper = mountPage()
    await flushPromises()

    const list = wrapper.findComponent({ name: 'AppList' })
    const items = list.props('items') as Array<{ name: string; disabled?: boolean }>
    expect(items.map((item) => item.name)).toEqual(['Calculator', 'Terminal', 'Hidden'])
    expect(items.find((item) => item.name === 'Hidden')?.disabled).toBe(true)

    wrapper.unmount()
  })

  /**
   * Diagnostics are a probe per entry. Selecting an entry only changes what the detail pane
   * describes, so walking the list costs nothing; the probe is what opening the Diagnose drawer
   * asks for, and nothing but an explicit rescan changes the answer — so a path pays for one.
   */
  it('diagnoses on request rather than on selection, and only once per path', async () => {
    state.listEntries.mockResolvedValue([
      entry(),
      entry({ path: '/Applications/Terminal.app', name: 'Terminal', displayName: 'Terminal' })
    ])
    state.diagnose.mockResolvedValue(diagnostic())

    const wrapper = mountPage()
    await flushPromises()

    expect(state.diagnose).not.toHaveBeenCalled()

    const list = wrapper.findComponent({ name: 'AppList' })
    list.vm.$emit('select', '/Applications/Calculator.app')
    await flushPromises()

    const detail = wrapper.findComponent({ name: 'AppDetail' })
    expect((detail.props('entry') as AppIndexManagedEntry).path).toBe(
      '/Applications/Calculator.app'
    )
    // Selection alone must not spend a probe: this is the whole point of moving it behind
    // the drawer, and an arrow-key walk down 150 entries would otherwise run 150 of them.
    expect(state.diagnose).not.toHaveBeenCalled()

    detail.vm.$emit('diagnose', entry())
    await flushPromises()

    expect(state.diagnose).toHaveBeenCalledTimes(1)
    expect(state.diagnose).toHaveBeenCalledWith({
      target: '/Applications/Calculator.app',
      query: '/Applications/Calculator.app'
    })
    expect(wrapper.findComponent({ name: 'AppDetail' }).props('diagnostic')).toMatchObject({
      success: true
    })

    // Re-opening the drawer for an entry already answered reuses the stored verdict.
    detail.vm.$emit('diagnose', entry())
    await flushPromises()
    expect(state.diagnose).toHaveBeenCalledTimes(1)

    // A different path is a different answer, so it pays for exactly one probe of its own.
    detail.vm.$emit('diagnose', entry({ path: '/Applications/Terminal.app', name: 'Terminal' }))
    await flushPromises()

    expect(state.diagnose).toHaveBeenCalledTimes(2)
    expect(state.diagnose).toHaveBeenLastCalledWith({
      target: '/Applications/Terminal.app',
      query: '/Applications/Terminal.app'
    })

    wrapper.unmount()
  })

  it('filters the list locally against the shell-owned search', async () => {
    state.listEntries.mockResolvedValue([
      entry(),
      entry({ path: '/Applications/Terminal.app', name: 'Terminal', displayName: 'Terminal' })
    ])

    const wrapper = mountPage()
    await flushPromises()

    wrapper.findComponent({ name: 'SettingsPage' }).vm.$emit('update:search', 'term')
    await nextTick()

    const items = wrapper.findComponent({ name: 'AppList' }).props('items') as Array<{
      name: string
    }>
    expect(items.map((item) => item.name)).toEqual(['Terminal'])
    // Local filtering, not a re-read of the index.
    expect(state.listEntries).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  /**
   * The page used to call the generic `openApp` shell handler, which has no idea which catalog
   * row it is opening — so a launch from here was recorded nowhere and the same application
   * counted differently depending on which surface the user reached it from. The entry point is
   * the part that makes the count attributable, so it is asserted rather than the bare call.
   */
  it('launches through the app-index channel, attributed to this surface', async () => {
    state.listEntries.mockResolvedValue([entry()])
    state.launch.mockResolvedValue({ success: true })

    const wrapper = mountPage()
    await flushPromises()

    wrapper.findComponent({ name: 'AppDetail' }).vm.$emit('launch', entry())
    await flushPromises()

    expect(state.launch).toHaveBeenCalledWith({
      path: '/Applications/Calculator.app',
      entryPoint: 'settings-app-detail'
    })

    wrapper.unmount()
  })

  /**
   * A binding decides whether an application belongs to the list's shortcut view, so the summaries
   * behind that view have to survive a change made from the detail pane. Without the re-read the
   * view keeps showing an application the user just unbound.
   */
  it('re-reads the list summaries after a shortcut is changed', async () => {
    state.listEntries.mockResolvedValue([entry()])
    state.setShortcut.mockResolvedValue({ success: true, status: 'updated' })
    state.listSummaries.mockResolvedValue({
      success: true,
      summaries: [
        {
          path: '/Applications/Calculator.app',
          executeCount: 4,
          hasShortcut: true,
          hasAliases: false
        }
      ]
    })

    const wrapper = mountPage()
    await flushPromises()

    const items = () =>
      wrapper.findComponent({ name: 'AppList' }).props('items') as Array<{
        hasShortcut?: boolean
        executeCount?: number
      }>
    expect(items()[0]).toMatchObject({ hasShortcut: true, executeCount: 4 })

    state.listSummaries.mockResolvedValue({
      success: true,
      summaries: [
        {
          path: '/Applications/Calculator.app',
          executeCount: 4,
          hasShortcut: false,
          hasAliases: false
        }
      ]
    })
    wrapper.findComponent({ name: 'AppDetail' }).vm.$emit('update-shortcut', entry(), '')
    await flushPromises()

    expect(state.setShortcut).toHaveBeenCalledWith({
      path: '/Applications/Calculator.app',
      accelerator: ''
    })
    expect(items()[0]).toMatchObject({ hasShortcut: false })

    wrapper.unmount()
  })

  it('drops the cached diagnostic and the selection when an entry is removed', async () => {
    state.listEntries.mockResolvedValue([entry()])
    state.diagnose.mockResolvedValue(diagnostic())
    state.removeEntry.mockResolvedValue({ success: true, status: 'removed' })

    const wrapper = mountPage()
    await flushPromises()

    const list = wrapper.findComponent({ name: 'AppList' })
    list.vm.$emit('select', '/Applications/Calculator.app')
    await flushPromises()

    state.listEntries.mockResolvedValue([])
    wrapper.findComponent({ name: 'AppDetail' }).vm.$emit('remove', entry())
    await flushPromises()

    const detail = wrapper.findComponent({ name: 'AppDetail' })
    expect(detail.props('entry')).toBeNull()
    expect(detail.props('diagnostic')).toBeNull()

    wrapper.unmount()
  })

  /**
   * The setter replaces one app's whole alias list, and the pane composes its draft from the
   * `aliases` prop — which still holds the pre-save array until the first call returns. A second
   * submission let through therefore carries a list without the alias the first one added, and
   * being written last it wins: the alias is gone with no error anywhere.
   */
  it('drops an alias submission that arrives while one is in flight', async () => {
    state.listEntries.mockResolvedValue([entry()])
    const pending = Promise.withResolvers<{ success: boolean }>()
    state.setAliases.mockReturnValue(pending.promise)

    const wrapper = mountPage()
    await flushPromises()

    const detail = wrapper.findComponent({ name: 'AppDetail' })
    detail.vm.$emit('update-aliases', entry(), ['first'])
    detail.vm.$emit('update-aliases', entry(), ['second'])
    await flushPromises()

    expect(state.setAliases).toHaveBeenCalledTimes(1)
    expect(state.setAliases).toHaveBeenCalledWith({
      path: '/Applications/Calculator.app',
      aliases: ['first']
    })

    pending.resolve({ success: true })
    await flushPromises()
    wrapper.unmount()
  })
})
