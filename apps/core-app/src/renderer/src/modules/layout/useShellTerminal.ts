import type { ShellTerminalCommandRequest } from './shell-terminal-command'
import { computed, ref } from 'vue'
import { normalizeShellCommand } from './shell-terminal-command'

export const DEFAULT_TERMINAL_HEIGHT = 280
export const MIN_TERMINAL_HEIGHT = 140
export const MAX_TERMINAL_HEIGHT_RATIO = 0.8

export interface RunShellTerminalCommandOptions {
  cwd?: string
  lang?: string
}

export type ShellTerminalTabKind = 'herdr' | 'local'

export interface ShellTerminalTab {
  id: string
  kind: ShellTerminalTabKind
  /** Immutable herdr-core terminal address when kind === 'herdr'. */
  address?: string
  /** Remote machine name, or null for local terminals. */
  machine?: string | null
  title: string
  /** Incremented whenever a mounted herdr tab should re-attach (e.g. restarted). */
  reattachNonce: number
}

export interface OpenHerdrTabOptions {
  title?: string
  machine?: string | null
  openDrawer?: boolean
}

export interface OpenLocalTabOptions {
  title?: string
  openDrawer?: boolean
}

const terminalOpen = ref(false)
const terminalMounted = ref(false)
const terminalHeight = ref(DEFAULT_TERMINAL_HEIGHT)
const isResizingTerminal = ref(false)
const tabs = ref<ShellTerminalTab[]>([])
const activeTabId = ref<string | null>(null)
const pendingCommands = ref<ShellTerminalCommandRequest[]>([])
let localTabSequence = 0
let nextCommandId = 1

function clampTerminalHeight(height: number): number {
  const max = Math.floor(window.innerHeight * MAX_TERMINAL_HEIGHT_RATIO)
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(max, height))
}

export function resetShellTerminalTabsForTesting(): void {
  tabs.value = []
  activeTabId.value = null
  pendingCommands.value = []
  localTabSequence = 0
  nextCommandId = 1
}

export function useShellTerminal() {
  function toggleTerminal(): void {
    if (!terminalMounted.value) {
      terminalMounted.value = true
    }
    terminalOpen.value = !terminalOpen.value
  }

  function openTerminal(): void {
    terminalMounted.value = true
    terminalOpen.value = true
  }

  function closeTerminal(): void {
    terminalOpen.value = false
  }

  function runCommand(command: string, options: RunShellTerminalCommandOptions = {}): boolean {
    if (!normalizeShellCommand(command)) return false
    openTerminal()
    const cwd = options.cwd?.trim() || undefined
    pendingCommands.value = [
      ...pendingCommands.value,
      {
        id: nextCommandId++,
        command,
        ...(cwd ? { cwd } : {}),
        ...(options.lang ? { lang: options.lang } : {})
      }
    ]
    return true
  }

  function peekPendingCommand(): ShellTerminalCommandRequest | undefined {
    return pendingCommands.value[0]
  }

  function consumePendingCommand(id: number): void {
    if (!pendingCommands.value.some((item) => item.id === id)) return
    pendingCommands.value = pendingCommands.value.filter((item) => item.id !== id)
  }

  function clearPendingCommands(): void {
    pendingCommands.value = []
  }

  function findTabByAddress(address: string): ShellTerminalTab | undefined {
    return tabs.value.find((tab) => tab.kind === 'herdr' && tab.address === address)
  }

  function openHerdrTab(address: string, options: OpenHerdrTabOptions = {}): ShellTerminalTab {
    const existing = findTabByAddress(address)
    if (existing) {
      if (options.title !== undefined || options.machine !== undefined) {
        tabs.value = tabs.value.map((tab) =>
          tab.id === existing.id
            ? {
                ...tab,
                ...(options.title !== undefined ? { title: options.title } : {}),
                ...(options.machine !== undefined ? { machine: options.machine } : {})
              }
            : tab
        )
      }
      activeTabId.value = existing.id
      if (options.openDrawer !== false) {
        openTerminal()
      }
      return tabs.value.find((tab) => tab.id === existing.id) ?? existing
    }

    const tab: ShellTerminalTab = {
      id: `herdr:${address}`,
      kind: 'herdr',
      address,
      machine: options.machine ?? null,
      title: options.title || address,
      reattachNonce: 0
    }
    tabs.value = [...tabs.value, tab]
    activeTabId.value = tab.id
    if (options.openDrawer !== false) {
      openTerminal()
    }
    return tab
  }

  function openLocalTab(options: OpenLocalTabOptions = {}): ShellTerminalTab {
    localTabSequence += 1
    const tab: ShellTerminalTab = {
      id: `local:${localTabSequence}`,
      kind: 'local',
      machine: null,
      title: options.title ?? '',
      reattachNonce: 0
    }
    tabs.value = [...tabs.value, tab]
    activeTabId.value = tab.id
    if (options.openDrawer !== false) {
      openTerminal()
    }
    return tab
  }

  function setActiveTab(tabId: string): void {
    if (!tabs.value.some((tab) => tab.id === tabId)) return
    activeTabId.value = tabId
  }

  function removeTab(tabId: string): void {
    const index = tabs.value.findIndex((tab) => tab.id === tabId)
    if (index === -1) return
    const nextTabs = tabs.value.filter((tab) => tab.id !== tabId)
    tabs.value = nextTabs
    if (activeTabId.value === tabId) {
      if (nextTabs.length === 0) {
        activeTabId.value = null
      } else {
        const fallbackIndex = Math.min(index, nextTabs.length - 1)
        activeTabId.value = nextTabs[fallbackIndex]?.id ?? null
      }
    }
  }

  function updateTabMeta(
    tabId: string,
    patch: Partial<Pick<ShellTerminalTab, 'title' | 'machine'>>
  ): void {
    let changed = false
    const nextTabs = tabs.value.map((tab) => {
      if (tab.id !== tabId) return tab
      const nextTitle = patch.title ?? tab.title
      const nextMachine = patch.machine !== undefined ? patch.machine : tab.machine
      if (nextTitle === tab.title && nextMachine === tab.machine) return tab
      changed = true
      return { ...tab, title: nextTitle, machine: nextMachine }
    })
    if (changed) {
      tabs.value = nextTabs
    }
  }

  function bumpTabReattach(tabIdOrAddress: string): boolean {
    let bumped = false
    const nextTabs = tabs.value.map((tab) => {
      if (tab.id !== tabIdOrAddress && tab.address !== tabIdOrAddress) return tab
      bumped = true
      return { ...tab, reattachNonce: tab.reattachNonce + 1 }
    })
    if (bumped) {
      tabs.value = nextTabs
    }
    return bumped
  }

  function startResize(event: PointerEvent): void {
    event.preventDefault()
    isResizingTerminal.value = true

    const handle = event.currentTarget
    if (handle instanceof HTMLElement) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is an optimisation; window listeners cover the drag.
      }
    }

    let pendingY: number | null = null
    let frame: number | null = null

    const flush = (): void => {
      frame = null
      if (pendingY === null) return
      terminalHeight.value = clampTerminalHeight(window.innerHeight - pendingY)
    }

    const onMove = (moveEvent: PointerEvent): void => {
      pendingY = moveEvent.clientY
      if (frame === null) {
        frame = requestAnimationFrame(flush)
      }
    }

    const onEnd = (endEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pendingY = null
      terminalHeight.value = clampTerminalHeight(window.innerHeight - endEvent.clientY)
      isResizingTerminal.value = false
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)

  return {
    terminalOpen: computed(() => terminalOpen.value),
    terminalMounted: computed(() => terminalMounted.value),
    terminalHeight: computed(() => terminalHeight.value),
    isResizingTerminal: computed(() => isResizingTerminal.value),
    tabs: computed(() => tabs.value),
    activeTabId: computed(() => activeTabId.value),
    activeTab,
    pendingCommands: computed(() => pendingCommands.value),
    toggleTerminal,
    openTerminal,
    closeTerminal,
    runCommand,
    peekPendingCommand,
    consumePendingCommand,
    clearPendingCommands,
    openHerdrTab,
    openLocalTab,
    setActiveTab,
    removeTab,
    updateTabMeta,
    bumpTabReattach,
    findTabByAddress,
    startResize
  }
}
