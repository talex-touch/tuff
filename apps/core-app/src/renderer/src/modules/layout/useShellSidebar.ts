import type { SidebarLayoutState } from './shell-sidebar-state'
import { computed, ref } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import {
  clampExpandedWidth,
  resolveDragState,
  resolveRenderedWidth,
  SIDEBAR_EXPANDED_DEFAULT,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_RAIL_WIDTH_MAC
} from './shell-sidebar-state'

/**
 * Live drag state. Non-null only between `pointerdown` and `pointerup`.
 *
 * Held outside the persisted settings on purpose: `appSetting` auto-saves, so writing to it on
 * every pointer move would fire an IPC round trip per frame.
 */
const dragState = ref<SidebarLayoutState | null>(null)

/**
 * Module-level so the sidebar and the chrome bar inside it share one state — a per-call
 * composable would give the collapse button its own copy.
 */
function readPersistedState(): SidebarLayoutState {
  const shell = appSetting.shell as
    | { sidebarWidth?: unknown; sidebarCollapsed?: unknown }
    | undefined

  return {
    collapsed: shell?.sidebarCollapsed === true,
    expandedWidth: clampExpandedWidth(shell?.sidebarWidth)
  }
}

function persistState(state: SidebarLayoutState): void {
  // Existing configs predate `shell`, and the storage layer hands back whatever is on disk, so
  // the object may genuinely be missing rather than merely stale.
  if (!appSetting.shell || typeof appSetting.shell !== 'object') {
    appSetting.shell = { sidebarWidth: SIDEBAR_EXPANDED_DEFAULT, sidebarCollapsed: false }
  }

  appSetting.shell.sidebarWidth = clampExpandedWidth(state.expandedWidth)
  appSetting.shell.sidebarCollapsed = state.collapsed
}

export function useShellSidebar() {
  const { isMac } = useRendererPlatform()

  const state = computed<SidebarLayoutState>(() => dragState.value ?? readPersistedState())
  const collapsed = computed(() => state.value.collapsed)
  const railWidth = computed(() => (isMac.value ? SIDEBAR_RAIL_WIDTH_MAC : SIDEBAR_RAIL_WIDTH))
  const width = computed(() => resolveRenderedWidth(state.value, railWidth.value))
  const isDragging = computed(() => dragState.value !== null)

  function toggle(): void {
    const current = readPersistedState()
    persistState({ collapsed: !current.collapsed, expandedWidth: current.expandedWidth })
  }

  function startDrag(event: PointerEvent): void {
    event.preventDefault()
    dragState.value = readPersistedState()

    // Listeners go on `window`, not on the grip. The pointer leaves the 5px strip on the very
    // first move, and pointer capture is best-effort — it throws for a pointer the browser no
    // longer considers active, which would otherwise strand the drag with no way to end it.
    const handle = event.currentTarget
    if (handle instanceof HTMLElement) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // Capture is an optimisation here; the window listeners already cover the drag.
      }
    }

    // Pointer events arrive faster than the compositor can draw, and each one resizes a
    // backdrop-filtered surface. Applying every event made the edge stutter behind the cursor;
    // coalescing to one write per frame keeps it on the pointer.
    let pendingX: number | null = null
    let frame: number | null = null

    const flush = (): void => {
      frame = null
      const current = dragState.value
      if (!current || pendingX === null) return
      dragState.value = resolveDragState(pendingX, current)
    }

    const onMove = (moveEvent: PointerEvent): void => {
      if (!dragState.value) return
      pendingX = moveEvent.clientX
      if (frame === null) frame = requestAnimationFrame(flush)
    }

    const onEnd = (endEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pendingX = null

      // A release with no intervening frame still has to land somewhere: read the final
      // position so a quick flick to a new width is not silently dropped.
      const current = dragState.value
      const finalState = current ? resolveDragState(endEvent.clientX, current) : null
      dragState.value = null
      if (finalState) persistState(finalState)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  return { collapsed, width, isDragging, toggle, startDrag }
}
