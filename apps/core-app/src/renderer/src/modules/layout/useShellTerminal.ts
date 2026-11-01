import { computed, ref } from 'vue'

export const DEFAULT_TERMINAL_HEIGHT = 280
export const MIN_TERMINAL_HEIGHT = 140
export const MAX_TERMINAL_HEIGHT_RATIO = 0.8

const terminalOpen = ref(false)
const terminalMounted = ref(false)
const terminalHeight = ref(DEFAULT_TERMINAL_HEIGHT)
const isResizingTerminal = ref(false)

function clampTerminalHeight(height: number): number {
  const max = Math.floor(window.innerHeight * MAX_TERMINAL_HEIGHT_RATIO)
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(max, height))
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

  return {
    terminalOpen: computed(() => terminalOpen.value),
    terminalMounted: computed(() => terminalMounted.value),
    terminalHeight: computed(() => terminalHeight.value),
    isResizingTerminal: computed(() => isResizingTerminal.value),
    toggleTerminal,
    openTerminal,
    closeTerminal,
    startResize
  }
}
