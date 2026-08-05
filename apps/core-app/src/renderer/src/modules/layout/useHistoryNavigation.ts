import { hasWindow } from '@talex-touch/utils/env'
import { onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'

interface RouterHistoryState {
  back?: unknown
  forward?: unknown
}

/**
 * Reads the shell's back/forward availability off the browser history.
 *
 * Vue Router stores the neighbouring entries on `history.state` (`back` / `forward`) as it
 * navigates, which is the only way to know whether a step exists — `history.length` counts the
 * whole session including entries ahead of the current position, so it cannot tell "can go
 * back" from "can go forward".
 */
export function useHistoryNavigation() {
  const router = useRouter()

  const canGoBack = ref(false)
  const canGoForward = ref(false)

  function readHistoryState(): RouterHistoryState {
    if (!hasWindow()) return {}
    const state = window.history.state
    return state && typeof state === 'object' ? (state as RouterHistoryState) : {}
  }

  function sync(): void {
    const state = readHistoryState()
    canGoBack.value = state.back != null
    canGoForward.value = state.forward != null
  }

  sync()

  // `afterEach` fires once the entry is committed, so `history.state` already describes the
  // destination. Reading it in `beforeEach` would report the previous entry's neighbours.
  const stopAfterEach = router.afterEach(() => {
    sync()
  })

  // Covers history moves the router never sees, e.g. the mouse's side buttons or a trackpad
  // swipe, both of which go straight to the browser history.
  if (hasWindow()) {
    window.addEventListener('popstate', sync)
    onScopeDispose(() => window.removeEventListener('popstate', sync))
  }

  onScopeDispose(stopAfterEach)

  function goBack(): void {
    if (!canGoBack.value) return
    router.back()
  }

  function goForward(): void {
    if (!canGoForward.value) return
    router.forward()
  }

  return { canGoBack, canGoForward, goBack, goForward }
}
