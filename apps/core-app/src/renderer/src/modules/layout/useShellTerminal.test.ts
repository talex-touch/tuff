// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_HEIGHT,
  MIN_TERMINAL_HEIGHT,
  resetShellTerminalTabsForTesting,
  useShellTerminal
} from './useShellTerminal'

class FakePointerEvent extends MouseEvent {
  pointerId: number
  constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
    super(type, params)
    this.pointerId = params.pointerId ?? 1
  }
}
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent
}

describe('useShellTerminal composable', () => {
  beforeEach(() => {
    resetShellTerminalTabsForTesting()
    useShellTerminal().closeTerminal()
  })

  it('toggles terminal state and lazily mounts', () => {
    const {
      terminalOpen,
      terminalMounted,
      terminalHeight,
      toggleTerminal,
      openTerminal,
      closeTerminal
    } = useShellTerminal()

    expect(terminalHeight.value).toBe(DEFAULT_TERMINAL_HEIGHT)

    if (terminalOpen.value) {
      closeTerminal()
    }
    expect(terminalOpen.value).toBe(false)

    toggleTerminal()
    expect(terminalOpen.value).toBe(true)
    expect(terminalMounted.value).toBe(true)

    toggleTerminal()
    expect(terminalOpen.value).toBe(false)
    expect(terminalMounted.value).toBe(true)

    openTerminal()
    expect(terminalOpen.value).toBe(true)

    closeTerminal()
    expect(terminalOpen.value).toBe(false)
  })

  it('respects min terminal height during resizing', () => {
    const { startResize, terminalHeight } = useShellTerminal()

    window.innerHeight = 800
    const handle = document.createElement('div')

    const downEvent = new PointerEvent('pointerdown', { clientY: 700, pointerId: 1 })
    handle.dispatchEvent(downEvent)
    startResize(downEvent)

    const moveEvent = new PointerEvent('pointermove', { clientY: 790, pointerId: 1 })
    window.dispatchEvent(moveEvent)

    const upEvent = new PointerEvent('pointerup', { clientY: 790, pointerId: 1 })
    window.dispatchEvent(upEvent)

    expect(terminalHeight.value).toBe(MIN_TERMINAL_HEIGHT)
  })

  it('manages multi-tab herdr and local terminal lifecycle cleanly', () => {
    const shell = useShellTerminal()

    const t1 = shell.openHerdrTab('t7', { title: 'codex', machine: null })
    expect(shell.terminalOpen.value).toBe(true)
    expect(shell.tabs.value).toHaveLength(1)
    expect(shell.activeTabId.value).toBe(t1.id)

    // Opening the same address reuses the existing tab instead of duplicating.
    const t1Again = shell.openHerdrTab('t7', { title: 'codex-updated' })
    expect(t1Again.id).toBe(t1.id)
    expect(shell.tabs.value).toHaveLength(1)
    expect(shell.tabs.value[0]?.title).toBe('codex-updated')

    const t2 = shell.openHerdrTab('prod/t2', { title: 'deploy', machine: 'prod' })
    const localTab = shell.openLocalTab({ title: 'shell' })
    expect(shell.tabs.value).toHaveLength(3)
    expect(shell.activeTabId.value).toBe(localTab.id)

    // Bump reattach increments nonce by id or address.
    expect(shell.bumpTabReattach('prod/t2')).toBe(true)
    expect(shell.findTabByAddress('prod/t2')?.reattachNonce).toBe(1)

    // Closing active tab selects adjacent neighbor.
    shell.removeTab(localTab.id)
    expect(shell.tabs.value).toHaveLength(2)
    expect(shell.activeTabId.value).toBe(t2.id)

    shell.removeTab(t2.id)
    shell.removeTab(t1.id)
    expect(shell.tabs.value).toHaveLength(0)
    expect(shell.activeTabId.value).toBeNull()
  })
})
