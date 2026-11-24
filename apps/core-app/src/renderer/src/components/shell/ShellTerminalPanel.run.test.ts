// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref } from 'vue'
import {
  resetShellTerminalTabsForTesting,
  useShellTerminal
} from '~/modules/layout/useShellTerminal'

interface CreateHandlerCapture {
  onData?: (data: string) => void | Promise<void>
  onExit?: (exit: { exitCode?: number; signal?: number }) => void
}

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  write: vi.fn(async () => {}),
  resize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  lastCreateHandlers: null as CreateHandlerCapture | null,
  terminalWrite: vi.fn(async () => {}),
  terminalFit: vi.fn(),
  terminalFocus: vi.fn(),
  terminalClear: vi.fn(),
  terminalReset: vi.fn(),
  terminalEmitData: null as ((data: string) => void) | null
}))

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
    create: mocks.create
  })
}))

vi.mock('~/modules/platform/accessibility-support', () => ({
  useAccessibilitySupport: () => ref(false)
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    platform: ref('darwin'),
    isMac: ref(true),
    isWindows: ref(false),
    isLinux: ref(false)
  })
}))

vi.mock('~/modules/shortcuts/main-window-command-catalog', () => ({
  mainWindowCommandChordLabel: () => '⌃`'
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: { localAiCli: {} }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@talex-touch/tuffex/dropdown-menu', () => ({
  TxDropdownMenu: { template: '<div><slot name="trigger" /><slot /></div>' },
  TxDropdownItem: { template: '<button><slot /></button>' }
}))

vi.mock('@talex-touch/tuffex/kbd', () => ({
  TxKbd: { template: '<kbd><slot /></kbd>' }
}))

vi.mock('./ShellHerdrConversationView.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => {
    const shell = useShellTerminal()
    const drawerTabs = computed(() =>
      shell.tabs.value.map((tab) => ({
        ...tab,
        viewMode: 'terminal' as const,
        terminalMounted: true
      }))
    )
    const activeTab = computed(
      () => drawerTabs.value.find((tab) => tab.id === shell.activeTabId.value) ?? null
    )
    return {
      connection: ref('disconnected'),
      loading: ref(false),
      isFallback: ref(true),
      liveSessions: ref([]),
      connectedMachines: ref([]),
      sessionByAddress: computed(() => new Map()),
      drawerTabs,
      activeTab,
      isAttached: () => false,
      isAttaching: () => false,
      getStreamHandle: () => undefined,
      attach: vi.fn(),
      closeTab: vi.fn(),
      killTab: vi.fn(),
      interrupt: vi.fn(),
      openNewHerdrTab: vi.fn(),
      openTerminalTab: vi.fn(),
      detachAllStreams: vi.fn(async () => {}),
      setTabViewMode: vi.fn()
    }
  }
}))

vi.mock('@talex-touch/tuffex/terminal', () => ({
  TxTerminal: defineComponent({
    name: 'TxTerminal',
    emits: ['ready', 'data', 'resize'],
    setup(_, { emit, expose }) {
      const instance = {
        write: mocks.terminalWrite,
        fit: mocks.terminalFit,
        focus: mocks.terminalFocus,
        clear: mocks.terminalClear,
        reset: mocks.terminalReset,
        getSize: () => ({ cols: 80, rows: 24 })
      }
      mocks.terminalEmitData = (data: string) => emit('data', data)
      expose(instance)
      return () => null
    },
    mounted() {
      this.$emit('ready', {
        write: mocks.terminalWrite,
        fit: mocks.terminalFit,
        focus: mocks.terminalFocus,
        clear: mocks.terminalClear,
        reset: mocks.terminalReset,
        getSize: () => ({ cols: 80, rows: 24 })
      })
    }
  })
}))

import ShellTerminalPanel from './ShellTerminalPanel.vue'

describe('ShellTerminalPanel queued command execution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetShellTerminalTabsForTesting()
    mocks.lastCreateHandlers = null
    mocks.create.mockImplementation(async (_req, options) => {
      mocks.lastCreateHandlers = options
      return {
        id: 'pty-1',
        write: mocks.write,
        resize: mocks.resize,
        close: mocks.close
      }
    })
    const terminal = useShellTerminal()
    terminal.closeTerminal()
    terminal.clearPendingCommands()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns in the queued cwd on cold start and runs the command without redundant cd', async () => {
    const terminal = useShellTerminal()
    terminal.runCommand('open login.html', {
      cwd: '/private/tmp/tuff-spaces/abc',
      lang: 'bash'
    })

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith(
      { cols: 80, rows: 24, cwd: '/private/tmp/tuff-spaces/abc' },
      expect.any(Object)
    )

    // Simulate initial zsh prompt output and let the settle window flush.
    mocks.lastCreateHandlers?.onData?.('user@mac abc % ')
    vi.advanceTimersByTime(100)
    await flushPromises()

    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(mocks.write).toHaveBeenCalledWith('open login.html\r')

    // Second command in the same cwd skips redundant cd.
    terminal.runCommand('ls -la', { cwd: '/private/tmp/tuff-spaces/abc', lang: 'bash' })
    await flushPromises()
    expect(mocks.write).toHaveBeenNthCalledWith(2, 'ls -la\r')

    // Switching to another cwd prefixes a safe cd before running.
    terminal.runCommand('pwd', { cwd: '/Users/demo/project', lang: 'bash' })
    await flushPromises()
    expect(mocks.write).toHaveBeenNthCalledWith(3, "cd -- '/Users/demo/project' && pwd\r")

    // Manual Enter in the terminal invalidates cached cwd so the next run restores it.
    mocks.terminalEmitData?.('cd ~\r')
    await nextTick()
    terminal.runCommand('open login.html', { cwd: '/Users/demo/project', lang: 'bash' })
    await flushPromises()
    expect(mocks.write).toHaveBeenNthCalledWith(4, 'cd ~\r')
    expect(mocks.write).toHaveBeenNthCalledWith(
      5,
      "cd -- '/Users/demo/project' && open login.html\r"
    )

    wrapper.unmount()
  })

  it('falls back to default cwd if the queued cwd no longer exists on disk', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('TERMINAL_CWD_INVALID'))
      .mockImplementationOnce(async (_req, options) => {
        mocks.lastCreateHandlers = options
        return {
          id: 'pty-fallback',
          write: mocks.write,
          resize: mocks.resize,
          close: mocks.close
        }
      })

    const terminal = useShellTerminal()
    terminal.runCommand('open login.html', { cwd: '/private/tmp/tuff-spaces/missing' })

    const wrapper = mount(ShellTerminalPanel)
    await flushPromises()

    expect(mocks.create).toHaveBeenNthCalledWith(
      1,
      { cols: 80, rows: 24, cwd: '/private/tmp/tuff-spaces/missing' },
      expect.any(Object)
    )
    expect(mocks.create).toHaveBeenNthCalledWith(2, { cols: 80, rows: 24 }, expect.any(Object))

    // Fallback prompt timer fires even if shell emitted no initial data.
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(mocks.write).toHaveBeenCalledWith(
      "cd -- '/private/tmp/tuff-spaces/missing' && open login.html\r"
    )

    wrapper.unmount()
  })
})
