// @vitest-environment jsdom

import type {
  HerdrConnectionState,
  HerdrMachineView,
  HerdrStreamHandle
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  localCreate: vi.fn(),
  localWrite: vi.fn(async () => {}),
  localResize: vi.fn(async () => {}),
  localClose: vi.fn(async () => {}),
  herdrAttach: vi.fn(),
  herdrCloseTab: vi.fn(),
  herdrKillTab: vi.fn(),
  herdrInterrupt: vi.fn(async () => ({ terminal: 't1', action: 'interrupt' })),
  herdrOpenNewTab: vi.fn(),
  herdrOpenTerminalTab: vi.fn(),
  herdrDetachAll: vi.fn(async () => {}),
  streamWrite: vi.fn(async () => {}),
  streamResize: vi.fn(async () => {}),
  streamFocus: vi.fn(async () => {}),
  streamDetach: vi.fn(async () => {}),
  terminalWrite: vi.fn(async () => {}),
  terminalFit: vi.fn(),
  terminalFocus: vi.fn(),
  terminalClear: vi.fn(),
  terminalReset: vi.fn(),
  appSetting: {
    betaFeatures: {
      herdrRuntime: true
    },
    localAiCli: {
      terminalFontFamily: ''
    }
  }
}))

const connectionRef = ref<HerdrConnectionState>('connected')
const loadingRef = ref(false)
const liveSessionsRef = ref<HerdrProjectedSession[]>([])
const connectedMachinesRef = ref<HerdrMachineView[]>([])
const tabViewModes = reactive<Record<string, 'structured' | 'terminal'>>({})
const tabTerminalEntered = reactive<Record<string, boolean>>({})
const streamMap = new Map<string, HerdrStreamHandle>()
const terminalEmitters = new Map<
  string,
  {
    emitData: (data: string) => void
    emitResize: (size: { cols: number; rows: number }) => void
  }
>()

import {
  resetShellTerminalTabsForTesting,
  useShellTerminal
} from '~/modules/layout/useShellTerminal'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/terminal', () => ({
  createTerminalSdk: () => ({
    create: mocks.localCreate
  })
}))

vi.mock('~/modules/platform/accessibility-support', () => ({
  useAccessibilitySupport: () => ref(false)
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    isMac: ref(true),
    isWindows: ref(false),
    isLinux: ref(false)
  })
}))

vi.mock('~/modules/shortcuts/main-window-command-catalog', () => ({
  mainWindowCommandChordLabel: () => '⌃`'
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: reactive(mocks.appSetting)
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => {
    const shell = useShellTerminal()
    const enrich = (tab: (typeof shell.tabs.value)[number]) => {
      if (tab.kind !== 'herdr') {
        return { ...tab, viewMode: 'terminal' as const, terminalMounted: true }
      }
      const viewMode = tabViewModes[tab.id] ?? 'terminal'
      const terminalMounted = tabTerminalEntered[tab.id] === true || viewMode === 'terminal'
      return { ...tab, viewMode, terminalMounted }
    }
    return {
      connection: connectionRef,
      loading: loadingRef,
      isConnected: computed(() => connectionRef.value === 'connected'),
      isFallback: computed(
        () => connectionRef.value === 'fallback-pty' || connectionRef.value === 'unavailable'
      ),
      liveSessions: liveSessionsRef,
      connectedMachines: connectedMachinesRef,
      drawerTabs: computed(() => shell.tabs.value.map(enrich)),
      activeTab: computed(() => (shell.activeTab.value ? enrich(shell.activeTab.value) : null)),
      sessionByAddress: computed(() => {
        const map = new Map<string, HerdrProjectedSession>()
        for (const s of liveSessionsRef.value) map.set(s.address, s)
        return map
      }),
      unattachedLiveSessions: computed(() => {
        const open = new Set(
          shell.tabs.value.filter((t) => t.kind === 'herdr' && t.address).map((t) => t.address!)
        )
        return liveSessionsRef.value.filter((s) => !open.has(s.address))
      }),
      setTabViewMode: (tabId: string, mode: 'structured' | 'terminal') => {
        tabViewModes[tabId] = mode
        if (mode === 'terminal') tabTerminalEntered[tabId] = true
      },
      attach: mocks.herdrAttach,
      closeTab: mocks.herdrCloseTab,
      killTab: mocks.herdrKillTab,
      interrupt: mocks.herdrInterrupt,
      openNewHerdrTab: mocks.herdrOpenNewTab,
      openTerminalTab: mocks.herdrOpenTerminalTab,
      detachAllStreams: mocks.herdrDetachAll,
      getStreamHandle: (id: string) => streamMap.get(id),
      isAttached: (id: string) => streamMap.has(id),
      isAttaching: () => false
    }
  }
}))

vi.mock('./ShellHerdrConversationView.vue', () => ({
  default: {
    name: 'ShellHerdrConversationView',
    props: {
      address: { type: String, default: '' }
    },
    emits: ['switch-terminal'],
    template:
      '<div data-testid="conversation-view-stub" :data-address="address"><button type="button" data-testid="stub-takeover" @click="$emit(\'switch-terminal\')">Take Over</button></div>'
  }
}))

vi.mock('@talex-touch/tuffex/kbd', () => ({
  TxKbd: { template: '<kbd><slot /></kbd>' }
}))

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: {
    name: 'TxDropdownMenu',
    props: {
      modelValue: { type: Boolean, default: false }
    },
    emits: ['update:modelValue'],
    template: '<div class="tx-dropdown-stub"><slot name="trigger" /><slot /></div>'
  },
  TxDropdownItem: {
    name: 'TxDropdownItem',
    emits: ['select'],
    template:
      '<button type="button" class="tx-dropdown-item-stub" @click="$emit(\'select\')"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/terminal', () => ({
  TxTerminal: {
    name: 'TxTerminal',
    emits: ['ready', 'data', 'resize'],
    mounted(this: { $el: HTMLElement | null; $emit: (event: string, ...args: unknown[]) => void }) {
      const paneId = (this.$el?.parentElement as HTMLElement | null)?.dataset?.paneId ?? 'default'
      terminalEmitters.set(paneId, {
        emitData: (data: string) => this.$emit('data', data),
        emitResize: (size: { cols: number; rows: number }) => this.$emit('resize', size)
      })
      this.$emit('ready', {
        write: mocks.terminalWrite,
        fit: mocks.terminalFit,
        focus: mocks.terminalFocus,
        clear: mocks.terminalClear,
        reset: mocks.terminalReset,
        getSize: () => ({ cols: 100, rows: 30 })
      })
    },
    template: '<div class="tx-terminal-stub" />'
  }
}))

import ShellTerminalPanel from './ShellTerminalPanel.vue'

function makeSession(overrides: Partial<HerdrProjectedSession> = {}): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: 'agent-shell',
    title: '',
    argv: ['zsh'],
    cwd: '/Users/dev',
    foregroundName: 'zsh',
    foregroundCwd: '/Users/dev',
    foregroundPid: 10,
    state: 'live',
    status: { state: 'working' },
    statusMs: 1000,
    reported: true,
    turn: 1,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 100,
    rows: 30,
    pid: 10,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 900,
    finishedMs: null,
    projectId: null,
    projectName: null,
    displayTitle: 'agent-shell',
    ...overrides
  }
}

describe('ShellTerminalPanel multi-tab drawer & fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamMap.clear()
    terminalEmitters.clear()
    for (const k of Object.keys(tabViewModes)) delete tabViewModes[k]
    for (const k of Object.keys(tabTerminalEntered)) delete tabTerminalEntered[k]
    resetShellTerminalTabsForTesting()
    useShellTerminal().openTerminal()
    mocks.appSetting.betaFeatures.herdrRuntime = true
    connectionRef.value = 'connected'
    loadingRef.value = false
    liveSessionsRef.value = [
      makeSession({ address: 't1', name: 'main-shell', displayTitle: 'main-shell' }),
      makeSession({
        address: 'prod/t2',
        machine: 'prod',
        name: 'deploy',
        displayTitle: 'deploy',
        status: { state: 'blocked', kind: 'permission' }
      })
    ]
    connectedMachinesRef.value = [
      {
        name: 'prod',
        target: 'ssh://prod',
        id: 'm1',
        host: 'prod.internal',
        version: '0.2.0',
        state: 'connected',
        session: 'default',
        temporary: false,
        via: false,
        sinceMs: 1000,
        why: null
      }
    ]

    const shell = useShellTerminal()

    mocks.herdrOpenNewTab.mockImplementation(async (req?: { on?: string }) => {
      const address = req?.on ? `${req.on}/t99` : 't1'
      return shell.openHerdrTab(address, {
        title: req?.on ? 'remote-shell' : 'main-shell',
        machine: req?.on ?? null
      })
    })
    mocks.herdrOpenTerminalTab.mockImplementation((address: string) => {
      const s = liveSessionsRef.value.find((item) => item.address === address)
      return shell.openHerdrTab(address, {
        title: s?.displayTitle ?? address,
        machine: s?.machine ?? null
      })
    })
    mocks.herdrAttach.mockImplementation(async (tabId: string) => {
      const handle: HerdrStreamHandle = {
        streamId: `s-${tabId}`,
        terminal: makeSession({ address: tabId.replace(/^herdr:/, '') }),
        automaticInput: true,
        resizeNotifications: true,
        write: mocks.streamWrite,
        sendAutoInput: vi.fn(async () => {}),
        resize: mocks.streamResize,
        focus: mocks.streamFocus,
        detach: mocks.streamDetach
      }
      streamMap.set(tabId, handle)
      return handle
    })
    mocks.herdrCloseTab.mockImplementation(async (tabId: string) => {
      streamMap.delete(tabId)
      shell.removeTab(tabId)
    })
    mocks.herdrKillTab.mockImplementation(async (tabId: string) => {
      streamMap.delete(tabId)
      shell.removeTab(tabId)
      return { terminal: tabId.replace(/^herdr:/, ''), action: 'kill' }
    })
    mocks.localCreate.mockResolvedValue({
      id: 'pty-local-1',
      write: mocks.localWrite,
      resize: mocks.localResize,
      close: mocks.localClose
    })
  })

  afterEach(() => {
    resetShellTerminalTabsForTesting()
  })

  it('mounts multi-tab herdr drawer, attaches streams with awaitDisplay, and supports + menu options', async () => {
    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    // Auto-created herdr local tab with hc badge.
    expect(mocks.herdrOpenNewTab).toHaveBeenCalledWith({})
    expect(mocks.herdrAttach).toHaveBeenCalledWith(
      'herdr:t1',
      expect.objectContaining({
        cols: 100,
        rows: 30,
        handlers: expect.objectContaining({ awaitDisplay: true })
      })
    )
    expect(wrapper.find('[data-testid="terminal-tab-kind-badge"]').text()).toBe(
      'terminal.herdr.badgeHc'
    )

    // Input & resize flow to active herdr stream.
    terminalEmitters.get('herdr:t1')?.emitData('ls\r')
    terminalEmitters.get('herdr:t1')?.emitResize({ cols: 120, rows: 40 })
    expect(mocks.streamWrite).toHaveBeenCalledWith('ls\r')
    expect(mocks.streamResize).toHaveBeenCalledWith(120, 40)

    // + menu allows attaching existing unattached remote session prod/t2.
    const attachRemoteBtn = wrapper.find('[data-testid="terminal-menu-attach-prod/t2"]')
    expect(attachRemoteBtn.exists()).toBe(true)
    await attachRemoteBtn.trigger('click')
    await flushPromises()

    expect(mocks.herdrOpenTerminalTab).toHaveBeenCalledWith('prod/t2', { openDrawer: true })
    expect(wrapper.findAll('[data-testid="terminal-tab"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="terminal-tab-machine"]').text()).toContain('prod')

    // + menu allows starting new shell on connected remote machine 'prod'.
    const newRemoteBtn = wrapper.find('[data-testid="terminal-menu-remote-prod"]')
    expect(newRemoteBtn.exists()).toBe(true)
    await newRemoteBtn.trigger('click')
    await flushPromises()
    expect(mocks.herdrOpenNewTab).toHaveBeenCalledWith({ on: 'prod' })

    wrapper.unmount()
    expect(mocks.herdrDetachAll).toHaveBeenCalledTimes(1)
  })

  it('defaults closing a herdr tab to Detach and provides an explicit Kill button', async () => {
    const shell = useShellTerminal()
    shell.openHerdrTab('t1', { title: 'main-shell' })
    shell.openHerdrTab('prod/t2', { title: 'deploy', machine: 'prod' })

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    // Clicking tab close button calls closeTab (Detach), NEVER killTab.
    const detachBtns = wrapper.findAll('[data-testid="terminal-tab-detach"]')
    expect(detachBtns[0]!.attributes('title')).toBe('terminal.herdr.detachTooltip')
    await detachBtns[0]!.trigger('click')
    await flushPromises()

    expect(mocks.herdrCloseTab).toHaveBeenCalledWith('herdr:t1')
    expect(mocks.herdrKillTab).not.toHaveBeenCalled()

    // Explicit Kill button calls killTab for the active herdr tab.
    const killBtn = wrapper.find('[data-testid="terminal-tab-kill"]')
    expect(killBtn.exists()).toBe(true)
    await killBtn.trigger('click')
    await flushPromises()

    expect(mocks.herdrKillTab).toHaveBeenCalledWith('herdr:prod/t2')
    wrapper.unmount()
  })

  it('auto-reattaches mounted herdr tab when reattachNonce advances', async () => {
    const shell = useShellTerminal()
    shell.openHerdrTab('t1', { title: 'main-shell' })

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()
    expect(mocks.herdrAttach).toHaveBeenCalledTimes(1)

    shell.bumpTabReattach('t1')
    await flushPromises()

    expect(mocks.herdrAttach).toHaveBeenCalledTimes(2)
    expect(mocks.herdrAttach).toHaveBeenLastCalledWith(
      'herdr:t1',
      expect.objectContaining({ resumed: true })
    )
    wrapper.unmount()
  })

  it('seamlessly falls back to local PtySessionCore when herdr is in fallback-pty or disabled', async () => {
    connectionRef.value = 'fallback-pty'
    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    expect(mocks.herdrOpenNewTab).not.toHaveBeenCalled()
    expect(mocks.localCreate).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="terminal-tab-kind-badge"]').text()).toBe(
      'terminal.herdr.badgeLocal'
    )

    const paneId = useShellTerminal().activeTabId.value!
    terminalEmitters.get(paneId)?.emitData('pwd\r')
    expect(mocks.localWrite).toHaveBeenCalledWith('pwd\r')

    wrapper.unmount()
    expect(mocks.localClose).toHaveBeenCalledTimes(1)
  })

  it('falls back to local PtySessionCore when betaFeatures.herdrRuntime is disabled', async () => {
    mocks.appSetting.betaFeatures.herdrRuntime = false
    connectionRef.value = 'connected'
    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    expect(mocks.herdrOpenNewTab).not.toHaveBeenCalled()
    expect(mocks.localCreate).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="terminal-tab-kind-badge"]').text()).toBe(
      'terminal.herdr.badgeLocal'
    )
    wrapper.unmount()
  })

  it('tracks focus across herdr tab switches', async () => {
    const shell = useShellTerminal()
    shell.openHerdrTab('t1', { title: 'main-shell' })
    shell.openHerdrTab('prod/t2', { title: 'deploy', machine: 'prod' })

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()
    mocks.streamFocus.mockClear()

    // Currently prod/t2 is active; switch back to t1.
    const triggers = wrapper.findAll('[data-testid="terminal-tab-trigger"]')
    await triggers[0]!.trigger('click')
    await flushPromises()

    expect(mocks.streamFocus).toHaveBeenCalledWith(false)
    expect(mocks.streamFocus).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })

  it('implements true Terminal-on-Demand: structured mode renders Card View without attaching PTY until switched', async () => {
    const shell = useShellTerminal()
    const tab = shell.openHerdrTab('t1', { title: 'main-shell' })
    tabViewModes[tab.id] = 'structured'
    tabTerminalEntered[tab.id] = false

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    // Structured view is rendered; TxTerminal is NOT mounted and attach is NOT called!
    expect(wrapper.find('[data-testid="conversation-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('.tx-terminal-stub').exists()).toBe(false)
    expect(mocks.herdrAttach).not.toHaveBeenCalled()

    // Segmented mode toggle shows Card active with semantic aria-pressed.
    expect(wrapper.find('[data-testid="terminal-mode-card"]').attributes('aria-pressed')).toBe(
      'true'
    )
    expect(wrapper.find('[data-testid="terminal-mode-terminal"]').attributes('aria-pressed')).toBe(
      'false'
    )

    // Clicking takeover from conversation view switches to terminal mode & attaches stream on demand!
    await wrapper.find('[data-testid="stub-takeover"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="conversation-view-stub"]').exists()).toBe(false)
    expect(wrapper.find('.tx-terminal-stub').exists()).toBe(true)
    expect(mocks.herdrAttach).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="terminal-mode-terminal"]').attributes('aria-pressed')).toBe(
      'true'
    )

    // Switching back to Card hides TxTerminal (keeping it mounted for scrollback) and blurs stream.
    mocks.streamFocus.mockClear()
    await wrapper.find('[data-testid="terminal-mode-card"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="conversation-view-stub"]').exists()).toBe(true)
    expect(wrapper.find('.tx-terminal-stub').exists()).toBe(true)
    expect(mocks.streamFocus).toHaveBeenCalledWith(false)
    expect(mocks.herdrCloseTab).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
