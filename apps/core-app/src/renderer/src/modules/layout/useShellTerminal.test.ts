// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_HEIGHT,
  MIN_TERMINAL_HEIGHT,
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

    // Initially closed
    if (terminalOpen.value) {
      closeTerminal()
    }
    expect(terminalOpen.value).toBe(false)

    // Toggle on
    toggleTerminal()
    expect(terminalOpen.value).toBe(true)
    expect(terminalMounted.value).toBe(true)

    // Toggle off
    toggleTerminal()
    expect(terminalOpen.value).toBe(false)
    expect(terminalMounted.value).toBe(true)

    // Explicit open
    openTerminal()
    expect(terminalOpen.value).toBe(true)

    // Explicit close
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

    // Move pointer almost to bottom (innerHeight - 790 = 10, below MIN_TERMINAL_HEIGHT of 140)
    const moveEvent = new PointerEvent('pointermove', { clientY: 790, pointerId: 1 })
    window.dispatchEvent(moveEvent)

    const upEvent = new PointerEvent('pointerup', { clientY: 790, pointerId: 1 })
    window.dispatchEvent(upEvent)

    expect(terminalHeight.value).toBe(MIN_TERMINAL_HEIGHT)
  })
})
