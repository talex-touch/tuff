<script lang="ts" setup name="ShellTerminalPanel">
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import type {
  HerdrOscState,
  HerdrStreamClosedPayload
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type {
  TerminalSessionHandle,
  TerminalSessionHandlers
} from '@talex-touch/utils/transport/sdk/domains/terminal'
import type { HerdrDrawerTab, HerdrTabViewMode } from '~/modules/herdr/useHerdrRuntime'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxTerminal } from '@talex-touch/tuffex/terminal'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTerminalSdk } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { isBetaFeatureEnabled } from '../../../../shared/beta-features'
import { useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { buildTerminalInput } from '~/modules/layout/shell-terminal-command'
import { useShellTerminal } from '~/modules/layout/useShellTerminal'
import { useAccessibilitySupport } from '~/modules/platform/accessibility-support'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { mainWindowCommandChordLabel } from '~/modules/shortcuts/main-window-command-catalog'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { SHELL_MENU_CARD } from './shell-menu-panel'
import ShellHerdrConversationView from './ShellHerdrConversationView.vue'

interface LocalTabRuntime {
  session: TerminalSessionHandle | null
  controller: AbortController | null
  generation: number
  running: boolean
  starting: boolean
  sessionCwd?: string
  shellPromptReady: boolean
  flushingCommands: boolean
  promptSettleTimer: ReturnType<typeof setTimeout> | null
  promptFallbackTimer: ReturnType<typeof setTimeout> | null
}

const INITIAL_OUTPUT_SETTLE_MS = 80
const INITIAL_PROMPT_FALLBACK_MS = 450

const { t } = useI18n()
const log = createRendererLogger('ShellTerminalPanel')
const { isMac, isWindows } = useRendererPlatform()
const transport = useTuffTransport()
const localSdk = createTerminalSdk(transport)
const screenReaderMode = useAccessibilitySupport()
const shellTerminal = useShellTerminal()
const herdr = useHerdrRuntime()

const {
  terminalOpen,
  terminalHeight,
  isResizingTerminal,
  activeTabId,
  pendingCommands,
  peekPendingCommand,
  consumePendingCommand,
  clearPendingCommands,
  startResize,
  closeTerminal
} = shellTerminal
const tabs = herdr.drawerTabs
const activeTab = herdr.activeTab

const addMenuOpen = ref(false)
const bootstrappingTab = ref(false)
const terminalInstances = new Map<string, TerminalInstance>()
const localRuntimes = reactive<Record<string, LocalTabRuntime>>({})
const herdrAttachGeneration = new Map<string, number>()
const lastReattachNonce = new Map<string, number>()

const shortcutLabel = computed(() => mainWindowCommandChordLabel('toggle-terminal', isMac.value))
const terminalFontFamily = computed(() => appSetting.localAiCli?.terminalFontFamily || undefined)
const herdrEnabled = computed(() => isBetaFeatureEnabled(appSetting, 'herdrRuntime'))
const herdrConnected = computed(() => herdrEnabled.value && herdr.connection.value === 'connected')
const shouldUseLocalFallback = computed(
  () =>
    !herdrEnabled.value ||
    herdr.isFallback.value ||
    (herdr.connection.value === 'disconnected' && !herdr.loading.value)
)

function ensureLocalRuntime(tabId: string): LocalTabRuntime {
  if (!localRuntimes[tabId]) {
    localRuntimes[tabId] = {
      session: null,
      controller: null,
      generation: 0,
      running: false,
      starting: false,
      sessionCwd: undefined,
      shellPromptReady: false,
      flushingCommands: false,
      promptSettleTimer: null,
      promptFallbackTimer: null
    }
  }
  return localRuntimes[tabId]!
}

function clearLocalPromptTimers(rt: LocalTabRuntime): void {
  if (rt.promptSettleTimer !== null) {
    clearTimeout(rt.promptSettleTimer)
    rt.promptSettleTimer = null
  }
  if (rt.promptFallbackTimer !== null) {
    clearTimeout(rt.promptFallbackTimer)
    rt.promptFallbackTimer = null
  }
}

function markLocalPromptReady(tabId: string, targetGeneration: number): void {
  const rt = localRuntimes[tabId]
  if (!rt || targetGeneration !== rt.generation || rt.shellPromptReady) return
  clearLocalPromptTimers(rt)
  rt.shellPromptReady = true
  if (rt.running && rt.session) {
    void flushPendingCommandsForTab(tabId)
  }
}

function scheduleLocalPromptSettle(tabId: string, targetGeneration: number): void {
  const rt = localRuntimes[tabId]
  if (!rt || targetGeneration !== rt.generation || rt.shellPromptReady) return
  if (rt.promptSettleTimer !== null) {
    clearTimeout(rt.promptSettleTimer)
  }
  rt.promptSettleTimer = setTimeout(() => {
    rt.promptSettleTimer = null
    markLocalPromptReady(tabId, targetGeneration)
  }, INITIAL_OUTPUT_SETTLE_MS)
}

async function flushPendingCommandsForTab(tabId: string): Promise<void> {
  const rt = localRuntimes[tabId]
  if (!rt || rt.flushingCommands || !rt.running || !rt.session || !rt.shellPromptReady) return
  rt.flushingCommands = true
  let dispatched = false

  try {
    while (rt.running && rt.session && rt.shellPromptReady) {
      const next = peekPendingCommand()
      if (!next) break
      consumePendingCommand(next.id)

      const built = buildTerminalInput({
        command: next.command,
        cwd: next.cwd,
        lang: next.lang,
        currentCwd: rt.sessionCwd,
        platform: isWindows.value ? 'win32' : 'posix'
      })
      if (!built) continue

      rt.sessionCwd = built.nextCwd
      dispatched = true
      try {
        await rt.session.write(built.input)
      } catch (error) {
        log.error('Failed to send queued command to terminal session', { tabId, error })
      }
    }
  } finally {
    rt.flushingCommands = false
  }

  if (dispatched && activeTabId.value === tabId) {
    await nextTick()
    terminalInstances.get(tabId)?.fit()
    terminalInstances.get(tabId)?.focus()
  }
}

function getHerdrSession(tab: HerdrDrawerTab) {
  if (tab.kind !== 'herdr' || !tab.address) return null
  return herdr.sessionByAddress.value.get(tab.address) ?? null
}

function resolveTabTitle(tab: HerdrDrawerTab): string {
  if (tab.kind === 'herdr') {
    const session = getHerdrSession(tab)
    return session?.displayTitle || tab.title || tab.address || t('terminal.title')
  }
  return tab.title || t('terminal.title')
}

function resolveTabMachine(tab: HerdrDrawerTab): string | null {
  if (tab.kind !== 'herdr') return null
  const session = getHerdrSession(tab)
  return session?.machine ?? tab.machine ?? null
}

function resolveTabOscState(tab: HerdrDrawerTab): HerdrOscState | null {
  if (tab.kind !== 'herdr') return null
  const session = getHerdrSession(tab)
  return session?.status?.state ?? 'idle'
}

function tabStatusDotClass(tab: HerdrDrawerTab): string {
  if (tab.kind === 'herdr') {
    const osc = resolveTabOscState(tab)
    switch (osc) {
      case 'blocked':
        return 'is-blocked'
      case 'working':
        return 'is-working'
      case 'error':
        return 'is-error'
      case 'done':
        return 'is-running'
      default:
        return herdr.isAttached(tab.id)
          ? 'is-running'
          : herdr.isAttaching(tab.id)
            ? 'is-starting'
            : 'is-stopped'
    }
  }
  const rt = localRuntimes[tab.id]
  if (rt?.starting) return 'is-starting'
  if (rt?.running) return 'is-running'
  return 'is-stopped'
}

function tabStatusLabel(tab: HerdrDrawerTab): string {
  if (tab.kind === 'herdr') {
    const osc = resolveTabOscState(tab) ?? 'idle'
    return t(`herdr.status.${osc}`)
  }
  const rt = localRuntimes[tab.id]
  if (rt?.starting) return t('terminal.start')
  if (rt?.running) return t('terminal.running')
  return t('terminal.closed')
}

function writeToTab(tabId: string, data: string): Promise<void> {
  const view = terminalInstances.get(tabId)
  if (!view) return Promise.resolve()
  return view.write(data).catch((error) => {
    log.error('Failed to write output to terminal view', { tabId, error })
  })
}

async function startLocalSession(tabId: string, initialCwd?: string): Promise<void> {
  const rt = ensureLocalRuntime(tabId)
  if (rt.starting || rt.running) return
  const current = ++rt.generation
  rt.controller = new AbortController()
  rt.starting = true
  rt.shellPromptReady = false
  clearLocalPromptTimers(rt)

  const view = terminalInstances.get(tabId)
  const size = view?.getSize()
  const cols = size?.cols ?? 80
  const rows = size?.rows ?? 24
  let effectiveCwd = initialCwd?.trim() || peekPendingCommand()?.cwd

  const createOptions: TerminalSessionHandlers = {
    signal: rt.controller.signal,
    awaitDisplay: true,
    onData: (data) => {
      if (current === rt.generation) {
        if (!rt.shellPromptReady) {
          scheduleLocalPromptSettle(tabId, current)
        }
        return writeToTab(tabId, data)
      }
      return undefined
    },
    onExit: (exit) => {
      if (current !== rt.generation) return
      clearLocalPromptTimers(rt)
      rt.shellPromptReady = false
      rt.sessionCwd = undefined
      rt.running = false
      rt.session = null
      const code = exit.exitCode ?? exit.signal ?? 0
      void writeToTab(tabId, `\r\n\x1b[90m[${t('terminal.exit', { code })}]\x1b[0m\r\n`)
    }
  }

  try {
    let handle: TerminalSessionHandle
    try {
      handle = await localSdk.create(
        {
          cols,
          rows,
          ...(effectiveCwd ? { cwd: effectiveCwd } : {})
        },
        createOptions
      )
    } catch (error) {
      // If a temporary space or removed project directory no longer exists on disk,
      // fall back to spawning in the default home directory instead of leaving the
      // bottom terminal broken.
      if (
        effectiveCwd &&
        current === rt.generation &&
        String(error).includes('TERMINAL_CWD_INVALID')
      ) {
        effectiveCwd = undefined
        handle = await localSdk.create({ cols, rows }, createOptions)
      } else {
        throw error
      }
    }

    if (current !== rt.generation) {
      await handle.close().catch(() => {})
      return
    }

    rt.session = handle
    rt.sessionCwd = effectiveCwd
    rt.running = true
    await nextTick()
    if (activeTabId.value === tabId) {
      terminalInstances.get(tabId)?.fit()
      terminalInstances.get(tabId)?.focus()
    }

    if (rt.shellPromptReady) {
      void flushPendingCommandsForTab(tabId)
    } else if (rt.promptFallbackTimer === null) {
      rt.promptFallbackTimer = setTimeout(() => {
        rt.promptFallbackTimer = null
        markLocalPromptReady(tabId, current)
      }, INITIAL_PROMPT_FALLBACK_MS)
    }
  } catch (error) {
    if (current === rt.generation) {
      clearLocalPromptTimers(rt)
      rt.shellPromptReady = false
      rt.sessionCwd = undefined
      clearPendingCommands()
      log.error('Failed to spawn local PTY terminal process', { tabId, error })
      void writeToTab(tabId, `\r\n\x1b[31m${t('terminal.failed')}: ${String(error)}\x1b[0m\r\n`)
    }
  } finally {
    if (current === rt.generation) {
      rt.starting = false
    }
  }
}

async function stopLocalSession(tabId: string): Promise<void> {
  const rt = localRuntimes[tabId]
  if (!rt) return
  rt.generation += 1
  clearLocalPromptTimers(rt)
  rt.shellPromptReady = false
  rt.sessionCwd = undefined
  rt.controller?.abort()
  rt.controller = null
  const current = rt.session
  rt.session = null
  rt.starting = false
  rt.running = false
  await current?.close().catch(() => {})
}

function handleHerdrStreamClosed(tabId: string, payload: HerdrStreamClosedPayload): void {
  if (!tabs.value.some((tab) => tab.id === tabId)) return
  if (payload.reason === 'detached') return
  if (payload.reason === 'exited') {
    const code = payload.exitCode ?? payload.signal ?? 0
    void writeToTab(tabId, `\r\n\x1b[90m[${t('terminal.exit', { code })}]\x1b[0m\r\n`)
    return
  }
  if (payload.reason === 'restarted') {
    void writeToTab(tabId, `\r\n\x1b[90m[${t('terminal.herdr.restartedNotice')}]\x1b[0m\r\n`)
    return
  }
  if (payload.reason === 'lost') {
    void writeToTab(tabId, `\r\n\x1b[90m[${t('terminal.herdr.lostNotice')}]\x1b[0m\r\n`)
    return
  }
  if (payload.reason === 'core-disconnected') {
    void writeToTab(tabId, `\r\n\x1b[90m[${t('terminal.herdr.disconnectedNotice')}]\x1b[0m\r\n`)
  }
}

async function attachHerdrTab(tabId: string, options: { resumed?: boolean } = {}): Promise<void> {
  const tab = tabs.value.find((item) => item.id === tabId)
  if (!tab || tab.kind !== 'herdr' || !tab.address) return

  const currentGen = (herdrAttachGeneration.get(tabId) ?? 0) + 1
  herdrAttachGeneration.set(tabId, currentGen)

  const view = terminalInstances.get(tabId)
  const size = view?.getSize()
  const cols = size?.cols ?? 80
  const rows = size?.rows ?? 24

  try {
    const handle = await herdr.attach(tabId, {
      cols,
      rows,
      history: 2000,
      resumed: options.resumed,
      resizeNotifications: true,
      handlers: {
        awaitDisplay: true,
        onData: (data) => {
          if (herdrAttachGeneration.get(tabId) !== currentGen) return undefined
          return writeToTab(tabId, data)
        },
        onClosed: (payload) => {
          if (herdrAttachGeneration.get(tabId) !== currentGen) return
          handleHerdrStreamClosed(tabId, payload)
        }
      }
    })

    if (herdrAttachGeneration.get(tabId) !== currentGen) {
      await handle.detach().catch(() => {})
      return
    }

    await nextTick()
    if (activeTabId.value === tabId && terminalOpen.value) {
      terminalInstances.get(tabId)?.fit()
      terminalInstances.get(tabId)?.focus()
      void handle.focus(true).catch(() => {})
    }
  } catch (error) {
    if (herdrAttachGeneration.get(tabId) === currentGen) {
      log.error('Failed to attach herdr terminal stream', { tabId, error })
      void writeToTab(tabId, `\r\n\x1b[31m${t('terminal.failed')}: ${String(error)}\x1b[0m\r\n`)
    }
  }
}

function handleTabTerminalReady(tab: HerdrDrawerTab, instance: TerminalInstance): void {
  terminalInstances.set(tab.id, instance)
  lastReattachNonce.set(tab.id, tab.reattachNonce)
  if (tab.kind === 'herdr') {
    if (!herdr.isAttached(tab.id) && !herdr.isAttaching(tab.id)) {
      void attachHerdrTab(tab.id)
    } else if (activeTabId.value === tab.id && tab.viewMode === 'terminal') {
      instance.fit()
      instance.focus()
    }
    return
  }

  const rt = ensureLocalRuntime(tab.id)
  if (!rt.session && !rt.starting) {
    void startLocalSession(tab.id, peekPendingCommand()?.cwd)
  } else if (activeTabId.value === tab.id) {
    instance.fit()
    instance.focus()
    if (pendingCommands.value.length > 0 && rt.running && rt.shellPromptReady) {
      void flushPendingCommandsForTab(tab.id)
    }
  }
}

function handleTabInput(tab: HerdrDrawerTab, data: string): void {
  if (tab.kind === 'herdr') {
    const handle = herdr.getStreamHandle(tab.id)
    if (!handle) return
    void handle.write(data).catch((error) => {
      log.error('Failed to send input to herdr terminal stream', { tabId: tab.id, error })
    })
    return
  }

  const rt = localRuntimes[tab.id]
  if (!rt?.session || !rt.running) return
  if (data.includes('\r') || data.includes('\n')) {
    rt.sessionCwd = undefined
  }
  void rt.session.write(data).catch((error) => {
    log.error('Failed to send input to local terminal session', { tabId: tab.id, error })
  })
}

function handleTabResize(tab: HerdrDrawerTab, size: TerminalSize): void {
  if (tab.kind === 'herdr') {
    const handle = herdr.getStreamHandle(tab.id)
    if (!handle) return
    void handle.resize(size.cols, size.rows).catch(() => {})
    return
  }

  const rt = localRuntimes[tab.id]
  if (!rt?.session || !rt.running) return
  void rt.session.resize(size.cols, size.rows).catch(() => {})
}

function handlePaneFocusChange(tab: HerdrDrawerTab, focused: boolean): void {
  if (tab.kind !== 'herdr') return
  const handle = herdr.getStreamHandle(tab.id)
  if (!handle) return
  void handle.focus(focused).catch(() => {})
}

function setTabViewModeWithFocus(tabId: string, mode: HerdrTabViewMode): void {
  const currentTab = tabs.value.find((item) => item.id === tabId)
  if (!currentTab || currentTab.kind !== 'herdr') return
  herdr.setTabViewMode(tabId, mode)
  if (mode === 'terminal') {
    void nextTick(() => {
      terminalInstances.get(tabId)?.fit()
      terminalInstances.get(tabId)?.focus()
      const handle = herdr.getStreamHandle(tabId)
      if (handle && terminalOpen.value) {
        void handle.focus(true).catch(() => {})
      }
    })
  } else {
    const handle = herdr.getStreamHandle(tabId)
    if (handle) {
      void handle.focus(false).catch(() => {})
    }
  }
}

function setActiveViewMode(mode: HerdrTabViewMode): void {
  const current = activeTab.value
  if (!current || current.kind !== 'herdr') return
  setTabViewModeWithFocus(current.id, mode)
}

function switchTabToTerminal(tabId: string): void {
  setTabViewModeWithFocus(tabId, 'terminal')
}

function selectTab(tabId: string): void {
  if (activeTabId.value === tabId) return
  const previousId = activeTabId.value
  if (previousId) {
    const prevHandle = herdr.getStreamHandle(previousId)
    if (prevHandle) {
      void prevHandle.focus(false).catch(() => {})
    }
  }
  shellTerminal.setActiveTab(tabId)
  void nextTick(() => {
    const nextTab = tabs.value.find((item) => item.id === tabId)
    if (!nextTab || (nextTab.kind === 'herdr' && nextTab.viewMode !== 'terminal')) return
    terminalInstances.get(tabId)?.fit()
    terminalInstances.get(tabId)?.focus()
    const nextHandle = herdr.getStreamHandle(tabId)
    if (nextHandle && terminalOpen.value) {
      void nextHandle.focus(true).catch(() => {})
    }
  })
}

async function handleCloseTab(tab: HerdrDrawerTab): Promise<void> {
  if (tab.kind === 'herdr') {
    // Closing a herdr-core tab defaults to Detach (process stays alive in background).
    herdrAttachGeneration.delete(tab.id)
    lastReattachNonce.delete(tab.id)
    terminalInstances.delete(tab.id)
    await herdr.closeTab(tab.id)
    return
  }

  await stopLocalSession(tab.id)
  delete localRuntimes[tab.id]
  terminalInstances.delete(tab.id)
  shellTerminal.removeTab(tab.id)
}

async function handleKillActiveHerdrTab(): Promise<void> {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'herdr') return
  herdrAttachGeneration.delete(tab.id)
  lastReattachNonce.delete(tab.id)
  terminalInstances.delete(tab.id)
  try {
    await herdr.killTab(tab.id)
  } catch (error) {
    log.error('Failed to kill herdr terminal process', { tabId: tab.id, error })
    toast.error(t('terminal.failed'))
  }
}

async function handleInterruptActiveHerdrTab(): Promise<void> {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'herdr' || !tab.address) return
  try {
    await herdr.interrupt(tab.address)
  } catch (error) {
    log.error('Failed to interrupt herdr terminal turn', { address: tab.address, error })
    toast.error(t('herdr.actions.interruptFailed'))
  }
}

async function handleNewHerdrShell(machine?: string): Promise<void> {
  try {
    await herdr.openNewHerdrTab(machine ? { on: machine } : {})
  } catch (error) {
    log.error('Failed to create herdr shell; falling back if local', { machine, error })
    if (!machine) {
      shellTerminal.openLocalTab({})
    } else {
      toast.error(t('terminal.failed'))
    }
  }
}

function handleNewLocalFallbackShell(): void {
  shellTerminal.openLocalTab({})
}

function handleAttachExistingSession(address: string): void {
  herdr.openTerminalTab(address, { openDrawer: true })
}

async function restartActiveLocalSession(): Promise<void> {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'local') return
  await stopLocalSession(tab.id)
  terminalInstances.get(tab.id)?.reset()
  await startLocalSession(tab.id)
}

function clearActiveTerminal(): void {
  const tab = activeTab.value
  if (!tab) return
  const instance = terminalInstances.get(tab.id)
  instance?.clear()
  instance?.focus()
}

async function ensureInitialTab(): Promise<void> {
  if (bootstrappingTab.value || tabs.value.length > 0) return
  bootstrappingTab.value = true
  try {
    if (pendingCommands.value.length > 0) {
      handleNewLocalFallbackShell()
    } else if (herdrConnected.value) {
      await handleNewHerdrShell()
    } else if (shouldUseLocalFallback.value) {
      handleNewLocalFallbackShell()
    }
  } finally {
    bootstrappingTab.value = false
  }
}

watch(terminalOpen, (open) => {
  const current = activeTab.value
  if (open) {
    if (tabs.value.length === 0) {
      void ensureInitialTab()
    }
    void nextTick(() => {
      if (!current || (current.kind === 'herdr' && current.viewMode !== 'terminal')) return
      terminalInstances.get(current.id)?.fit()
      terminalInstances.get(current.id)?.focus()
      const handle = herdr.getStreamHandle(current.id)
      if (handle) {
        void handle.focus(true).catch(() => {})
      }
    })
  } else if (current) {
    const handle = herdr.getStreamHandle(current.id)
    if (handle) {
      void handle.focus(false).catch(() => {})
    }
  }
})

// If herdr finishes connecting (or settles into fallback-pty) while drawer is open with no tabs, bootstrap a tab.
watch([herdrConnected, shouldUseLocalFallback], () => {
  if (tabs.value.length === 0) {
    void ensureInitialTab()
  }
})

// Auto-reattach mounted herdr tabs whenever their reattachNonce advances (e.g. session restarted).
watch(
  tabs,
  (nextTabs) => {
    for (const tab of nextTabs) {
      if (tab.kind !== 'herdr') continue
      const prevNonce = lastReattachNonce.get(tab.id) ?? 0
      if (tab.reattachNonce > prevNonce) {
        lastReattachNonce.set(tab.id, tab.reattachNonce)
        if (tab.terminalMounted && terminalInstances.has(tab.id)) {
          void attachHerdrTab(tab.id, { resumed: true })
        }
      }
    }
  },
  { deep: false }
)

function ensureLocalTabForPendingCommand(): string {
  const current = activeTab.value
  if (current?.kind === 'local') return current.id
  const existingLocal = tabs.value.find((tab) => tab.kind === 'local')
  if (existingLocal) {
    selectTab(existingLocal.id)
    return existingLocal.id
  }
  return shellTerminal.openLocalTab({}).id
}

watch(
  () => pendingCommands.value.length,
  (count) => {
    if (count === 0) return
    const targetTabId = ensureLocalTabForPendingCommand()
    const rt = ensureLocalRuntime(targetTabId)
    if (rt.running && rt.session && rt.shellPromptReady) {
      void flushPendingCommandsForTab(targetTabId)
      return
    }
    if (!rt.session && !rt.starting && terminalInstances.has(targetTabId)) {
      void startLocalSession(targetTabId, peekPendingCommand()?.cwd)
    }
  },
  { immediate: true }
)

onMounted(() => {
  void ensureInitialTab()
})

onBeforeUnmount(() => {
  // Detach all herdr streams cleanly without killing background herdr-core processes.
  void herdr.detachAllStreams()
  for (const tabId of Object.keys(localRuntimes)) {
    void stopLocalSession(tabId)
  }
  terminalInstances.clear()
})
</script>

<template>
  <section
    class="ShellTerminalPanel"
    :class="{ 'is-resizing': isResizingTerminal }"
    :style="{ height: `${terminalHeight}px` }"
    role="region"
    :aria-label="t('terminal.title')"
  >
    <!-- Top resize handle -->
    <div
      class="ShellTerminalPanel-Resizer"
      :class="{ 'is-resizing': isResizingTerminal }"
      role="separator"
      aria-orientation="horizontal"
      tabindex="-1"
      @pointerdown="startResize"
    />

    <!-- Header bar with tab strip + actions -->
    <header class="ShellTerminalPanel-Header">
      <div class="ShellTerminalPanel-TabStripWrap">
        <div
          class="ShellTerminalPanel-TabList"
          role="tablist"
          :aria-label="t('terminal.title')"
          data-testid="terminal-tab-strip"
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="ShellTerminalPanel-Tab"
            :class="{ 'is-active': tab.id === activeTabId }"
            :data-tab-id="tab.id"
            :data-tab-kind="tab.kind"
            data-testid="terminal-tab"
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              class="ShellTerminalPanel-TabTrigger"
              :aria-selected="tab.id === activeTabId"
              :title="resolveTabTitle(tab)"
              data-testid="terminal-tab-trigger"
              @click="selectTab(tab.id)"
            >
              <span
                class="ShellTerminalPanel-StatusDot"
                :class="tabStatusDotClass(tab)"
                :title="tabStatusLabel(tab)"
                aria-hidden="true"
              />
              <span class="ShellTerminalPanel-TabTitle">{{ resolveTabTitle(tab) }}</span>
              <span
                v-if="resolveTabMachine(tab)"
                class="ShellTerminalPanel-TabMachineBadge"
                data-testid="terminal-tab-machine"
              >
                <span class="i-ri-server-line" aria-hidden="true" />
                <span>{{ resolveTabMachine(tab) }}</span>
              </span>
              <span
                class="ShellTerminalPanel-TabKindBadge"
                :class="tab.kind === 'herdr' ? 'is-hc' : 'is-local'"
                data-testid="terminal-tab-kind-badge"
              >
                {{
                  tab.kind === 'herdr'
                    ? t('terminal.herdr.badgeHc')
                    : t('terminal.herdr.badgeLocal')
                }}
              </span>
            </button>

            <button
              type="button"
              class="ShellTerminalPanel-TabClose"
              :title="
                tab.kind === 'herdr' ? t('terminal.herdr.detachTooltip') : t('terminal.closed')
              "
              :aria-label="
                tab.kind === 'herdr' ? t('terminal.herdr.detachTooltip') : t('terminal.closed')
              "
              :data-testid="tab.kind === 'herdr' ? 'terminal-tab-detach' : 'terminal-tab-close'"
              @click="handleCloseTab(tab)"
            >
              <span class="i-ri-close-line" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- + New / Attach dropdown menu -->
        <TxDropdownMenu
          v-model="addMenuOpen"
          placement="top-start"
          :min-width="220"
          :panel-card="SHELL_MENU_CARD"
          panel-background="refraction"
        >
          <template #trigger>
            <button
              type="button"
              class="ShellTerminalPanel-ActionBtn ShellTerminalPanel-AddBtn"
              data-testid="terminal-add-menu-trigger"
              :title="t('terminal.herdr.newMenuTitle')"
              :aria-label="t('terminal.herdr.newMenuTitle')"
            >
              <span class="i-ri-add-line" aria-hidden="true" />
            </button>
          </template>

          <TxDropdownItem
            v-if="herdrConnected"
            data-testid="terminal-menu-new-herdr-local"
            @select="handleNewHerdrShell()"
          >
            <span class="ShellTerminalPanel-MenuItem">
              <span class="i-ri-terminal-box-line" aria-hidden="true" />
              <span>{{ t('terminal.herdr.newLocalShell') }}</span>
            </span>
          </TxDropdownItem>

          <TxDropdownItem
            v-for="machine in herdrConnected ? herdr.connectedMachines.value : []"
            :key="machine.name"
            :data-testid="`terminal-menu-remote-${machine.name}`"
            @select="handleNewHerdrShell(machine.name)"
          >
            <span class="ShellTerminalPanel-MenuItem">
              <span class="i-ri-server-line" aria-hidden="true" />
              <span>{{ t('terminal.herdr.newRemoteShell', { machine: machine.name }) }}</span>
            </span>
          </TxDropdownItem>

          <template v-if="herdrConnected && herdr.unattachedLiveSessions.value.length > 0">
            <div class="ShellTerminalPanel-MenuSection">
              {{ t('terminal.herdr.unattachedSection') }}
            </div>
            <TxDropdownItem
              v-for="session in herdr.unattachedLiveSessions.value"
              :key="session.address"
              :data-testid="`terminal-menu-attach-${session.address}`"
              @select="handleAttachExistingSession(session.address)"
            >
              <span class="ShellTerminalPanel-MenuItem">
                <span class="i-ri-link" aria-hidden="true" />
                <span class="ShellTerminalPanel-MenuLabel">{{ session.displayTitle }}</span>
                <span v-if="session.machine" class="ShellTerminalPanel-MenuMeta">
                  {{ session.machine }}
                </span>
              </span>
            </TxDropdownItem>
          </template>

          <TxDropdownItem
            data-testid="terminal-menu-new-fallback-local"
            @select="handleNewLocalFallbackShell"
          >
            <span class="ShellTerminalPanel-MenuItem">
              <span class="i-ri-terminal-line" aria-hidden="true" />
              <span>{{ t('terminal.herdr.newFallbackShell') }}</span>
            </span>
          </TxDropdownItem>
        </TxDropdownMenu>

        <TxKbd v-if="shortcutLabel" class="ShellTerminalPanel-ShortcutBadge">
          {{ shortcutLabel }}
        </TxKbd>
      </div>

      <div class="ShellTerminalPanel-Actions">
        <div
          v-if="activeTab?.kind === 'herdr'"
          class="ShellTerminalPanel-ModeSwitch"
          role="group"
          :aria-label="t('terminal.herdr.viewModeLabel')"
          data-testid="terminal-view-mode-toggle"
        >
          <button
            type="button"
            class="ShellTerminalPanel-ModeBtn"
            :class="{ 'is-active': activeTab.viewMode === 'structured' }"
            :aria-pressed="activeTab.viewMode === 'structured'"
            data-testid="terminal-mode-card"
            @click="setActiveViewMode('structured')"
          >
            <span class="i-ri-layout-cards-line" aria-hidden="true" />
            <span>{{ t('terminal.herdr.modeCard') }}</span>
          </button>
          <button
            type="button"
            class="ShellTerminalPanel-ModeBtn"
            :class="{ 'is-active': activeTab.viewMode === 'terminal' }"
            :aria-pressed="activeTab.viewMode === 'terminal'"
            data-testid="terminal-mode-terminal"
            @click="setActiveViewMode('terminal')"
          >
            <span class="i-ri-terminal-box-line" aria-hidden="true" />
            <span>{{ t('terminal.herdr.modeTerminal') }}</span>
          </button>
        </div>

        <button
          class="ShellTerminalPanel-ActionBtn"
          type="button"
          :disabled="
            !activeTab || (activeTab.kind === 'herdr' && activeTab.viewMode !== 'terminal')
          "
          :title="t('terminal.clear')"
          :aria-label="t('terminal.clear')"
          data-testid="terminal-action-clear"
          @click="clearActiveTerminal"
        >
          <span class="i-ri-eraser-line" aria-hidden="true" />
        </button>

        <template v-if="activeTab?.kind === 'herdr'">
          <button
            class="ShellTerminalPanel-ActionBtn"
            type="button"
            :title="t('terminal.herdr.interruptTooltip')"
            :aria-label="t('terminal.herdr.interrupt')"
            data-testid="terminal-action-interrupt"
            @click="handleInterruptActiveHerdrTab"
          >
            <span class="i-ri-stop-circle-line" aria-hidden="true" />
          </button>

          <button
            class="ShellTerminalPanel-ActionBtn"
            type="button"
            :title="t('terminal.herdr.detachTooltip')"
            :aria-label="t('terminal.herdr.detach')"
            data-testid="terminal-action-detach"
            @click="handleCloseTab(activeTab)"
          >
            <span class="i-ri-link-unlink-m" aria-hidden="true" />
          </button>

          <button
            class="ShellTerminalPanel-ActionBtn ShellTerminalPanel-KillBtn"
            type="button"
            :title="t('terminal.herdr.killTooltip')"
            :aria-label="t('terminal.herdr.kill')"
            data-testid="terminal-tab-kill"
            @click="handleKillActiveHerdrTab"
          >
            <span class="i-ri-shut-down-line" aria-hidden="true" />
          </button>
        </template>

        <button
          v-else-if="activeTab?.kind === 'local'"
          class="ShellTerminalPanel-ActionBtn"
          type="button"
          :title="t('terminal.restart')"
          :aria-label="t('terminal.restart')"
          data-testid="terminal-action-restart"
          @click="restartActiveLocalSession"
        >
          <span
            class="i-ri-refresh-line"
            :class="{ 'is-spin': Boolean(localRuntimes[activeTab.id]?.starting) }"
            aria-hidden="true"
          />
        </button>

        <button
          class="ShellTerminalPanel-ActionBtn ShellTerminalPanel-CloseBtn"
          type="button"
          :title="t('shortcuts.commands.toggleTerminal')"
          :aria-label="t('shortcuts.commands.toggleTerminal')"
          data-testid="terminal-drawer-hide"
          @click="closeTerminal"
        >
          <span class="i-ri-arrow-down-s-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- Terminal & structured views (one per open tab; TxTerminal mounts only on demand) -->
    <div class="ShellTerminalPanel-Body">
      <div
        v-for="tab in tabs"
        v-show="tab.id === activeTabId"
        :key="tab.id"
        class="ShellTerminalPanel-Pane"
        role="tabpanel"
        :data-pane-id="tab.id"
      >
        <ShellHerdrConversationView
          v-if="tab.kind === 'herdr' && tab.viewMode === 'structured' && tab.address"
          :address="tab.address"
          @switch-terminal="switchTabToTerminal(tab.id)"
        />
        <div
          v-if="tab.terminalMounted"
          v-show="tab.kind === 'local' || tab.viewMode === 'terminal'"
          class="ShellTerminalPanel-TerminalPane"
          :data-pane-id="tab.id"
          @focusin="handlePaneFocusChange(tab, true)"
          @focusout="handlePaneFocusChange(tab, false)"
        >
          <TxTerminal
            class="ShellTerminalPanel-Terminal"
            :font-family="terminalFontFamily"
            :read-only="false"
            :auto-focus="
              tab.id === activeTabId && (tab.kind === 'local' || tab.viewMode === 'terminal')
            "
            :auto-scroll="true"
            :screen-reader-mode="screenReaderMode"
            @ready="(instance) => handleTabTerminalReady(tab, instance)"
            @data="(data) => handleTabInput(tab, data)"
            @resize="(size) => handleTabResize(tab, size)"
          />
        </div>
      </div>

      <div v-if="tabs.length === 0" class="ShellTerminalPanel-Empty" data-testid="terminal-empty">
        <p class="ShellTerminalPanel-EmptyText">
          {{
            herdr.loading.value && herdrEnabled
              ? t('terminal.herdr.connecting')
              : t('herdr.sidebar.empty')
          }}
        </p>
        <div class="ShellTerminalPanel-EmptyActions">
          <button
            v-if="herdrConnected"
            type="button"
            class="ShellTerminalPanel-EmptyBtn"
            data-testid="terminal-empty-new-herdr"
            @click="handleNewHerdrShell()"
          >
            {{ t('terminal.herdr.newLocalShell') }}
          </button>
          <button
            type="button"
            class="ShellTerminalPanel-EmptyBtn"
            data-testid="terminal-empty-new-local"
            @click="handleNewLocalFallbackShell"
          >
            {{ t('terminal.herdr.newFallbackShell') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ShellTerminalPanel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--tx-bg-color);
  border-top: 1px solid var(--tx-border-color);
  z-index: 10;
  -webkit-app-region: no-drag;

  &.is-resizing {
    user-select: none;
  }
}

.ShellTerminalPanel-Resizer {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 20;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--tx-color-primary);
    opacity: 0;
    transition: opacity 150ms ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &:hover::after,
  &.is-resizing::after {
    opacity: 0.8;
  }
}

.ShellTerminalPanel-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  box-sizing: border-box;
  background: var(--tx-fill-color-lighter);
  border-bottom: 1px solid var(--tx-border-color-lighter);
  flex-shrink: 0;
}

.ShellTerminalPanel-TabStripWrap {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ShellTerminalPanel-TabList {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.ShellTerminalPanel-Tab {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  height: 26px;
  padding: 0 4px 0 8px;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-regular);
  box-shadow: inset 0 0 0 1px transparent;

  &:hover {
    background: var(--tx-fill-color-light);
    color: var(--tx-text-color-primary);
  }

  &.is-active {
    background: var(--tx-bg-color);
    color: var(--tx-text-color-primary);
    box-shadow: inset 0 0 0 1px var(--tx-border-color);
  }
}

.ShellTerminalPanel-TabTrigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 210px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
    border-radius: 5px;
  }
}

.ShellTerminalPanel-TabTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellTerminalPanel-TabMachineBadge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 5px;
  border-radius: 5px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
  font-weight: 400;
}

.ShellTerminalPanel-TabKindBadge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &.is-hc {
    background: var(--tx-color-primary-light-9);
    color: color-mix(in srgb, var(--tx-color-primary) 50%, var(--tx-text-color-primary));
  }

  &.is-local {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-secondary);
  }
}

.ShellTerminalPanel-TabClose {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellTerminalPanel-StatusDot {
  display: inline-block;
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tx-text-color-placeholder);

  &.is-running {
    background: var(--tx-color-success);
  }

  &.is-working {
    background: var(--tx-color-primary);
  }

  &.is-blocked,
  &.is-starting {
    background: var(--tx-color-warning);
  }

  &.is-error {
    background: var(--tx-color-danger);
  }

  &.is-stopped {
    background: var(--tx-text-color-placeholder);
  }
}

.ShellTerminalPanel-ShortcutBadge {
  flex-shrink: 0;
  font-size: 10px;
  opacity: 0.75;
}

.ShellTerminalPanel-MenuItem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 13px;
}

.ShellTerminalPanel-MenuLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellTerminalPanel-MenuMeta {
  flex-shrink: 0;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
}

.ShellTerminalPanel-MenuSection {
  padding: 6px 10px 2px;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ShellTerminalPanel-Actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.ShellTerminalPanel-ModeSwitch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  padding: 2px;
  margin-right: 4px;
  box-sizing: border-box;
  border-radius: 7px;
  background: var(--tx-fill-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.ShellTerminalPanel-ModeBtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-regular);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;

  &:hover:not(.is-active) {
    color: var(--tx-text-color-primary);
  }

  &.is-active {
    background: var(--tx-bg-color);
    color: var(--tx-text-color-primary);
    box-shadow: inset 0 0 0 1px var(--tx-border-color);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellTerminalPanel-ActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular);
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .is-spin {
    @media (prefers-reduced-motion: no-preference) {
      animation: terminal-spin 1s linear infinite;
    }
  }
}

.ShellTerminalPanel-KillBtn {
  color: color-mix(in srgb, var(--tx-color-danger) 55%, var(--tx-text-color-primary));

  &:hover:not(:disabled) {
    background: var(--tx-color-danger-light-9);
    color: color-mix(in srgb, var(--tx-color-danger) 55%, var(--tx-text-color-primary));
  }
}

@keyframes terminal-spin {
  from {
    rotate: 0deg;
  }
  to {
    rotate: 360deg;
  }
}

.ShellTerminalPanel-Body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--tx-bg-color);
}

.ShellTerminalPanel-Pane,
.ShellTerminalPanel-TerminalPane {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.ShellTerminalPanel-Terminal {
  width: 100%;
  height: 100%;

  :deep(.tx-terminal) {
    min-height: 0;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    padding: 6px 12px;
  }

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    background-color: transparent !important;
  }
}

.ShellTerminalPanel-Empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.ShellTerminalPanel-EmptyText {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.ShellTerminalPanel-EmptyActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ShellTerminalPanel-EmptyBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color);
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 3px var(--tx-color-primary-light-9);
  }
}
</style>
