import { computed, ref, shallowRef } from 'vue'

/**
 * Coordinates the full-height right sidebar dock owned by `AppShell` so page-scoped right sidebars
 * (such as `HomeSidePanel`) extend cleanly from the very top edge of the window beside
 * `BrowserTabStrip`, separated from the middle column by a continuous top-to-bottom divider.
 */
const dockHost = shallowRef<HTMLElement | null>(null)
const dockOpen = ref(false)
const dockResizing = ref(false)

export function useShellRightSidebar() {
  function registerHost(element: HTMLElement | null): void {
    dockHost.value = element
  }

  function syncDockState(state: { open: boolean; resizing: boolean }): void {
    dockOpen.value = state.open
    dockResizing.value = state.open && state.resizing
  }

  function resetDockState(): void {
    dockOpen.value = false
    dockResizing.value = false
  }

  return {
    dockHost: computed(() => dockHost.value),
    dockOpen: computed(() => dockOpen.value),
    dockResizing: computed(() => dockResizing.value),
    registerHost,
    syncDockState,
    resetDockState
  }
}
