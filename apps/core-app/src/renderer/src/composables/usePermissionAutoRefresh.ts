import { watch } from 'vue'
import { useDocumentVisibility, useIntervalFn, useWindowFocus } from '@vueuse/core'

export interface PermissionAutoRefreshOptions {
  /** Background poll interval while the page is visible (ms). */
  intervalMs?: number
  /** Re-run the refresh when the window regains focus. Default true. */
  refreshOnFocus?: boolean
}

/**
 * Keeps a permission page live while the user is on it.
 *
 * A permission page is exactly where a user leaves to the OS System Settings,
 * grants something, and comes back — so we:
 *  - re-run `refresh` when the window regains focus, and
 *  - poll on a modest interval while the page is visible.
 *
 * The backend file-access checks these refreshes trigger also emit
 * `PERMISSIONS_REFRESHED`, which nudges the file-system watcher to reconcile any
 * roots that just became accessible (instead of waiting for its 30s poll).
 *
 * Pass a *silent* refresh (one that doesn't toggle a full-page loading state) so
 * the background polling doesn't flicker the UI. Timers/listeners are bound to the
 * current component scope and cleaned up automatically on unmount.
 */
export function usePermissionAutoRefresh(
  refresh: () => void | Promise<void>,
  options: PermissionAutoRefreshOptions = {}
): void {
  const intervalMs = options.intervalMs ?? 10_000
  const refreshOnFocus = options.refreshOnFocus ?? true

  const run = (): void => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => {
        // Background refresh is best-effort; the page's own error handling covers
        // user-initiated checks.
      })
  }

  if (refreshOnFocus) {
    const focused = useWindowFocus()
    watch(focused, (isFocused, wasFocused) => {
      if (isFocused && !wasFocused) {
        run()
      }
    })
  }

  const visibility = useDocumentVisibility()
  useIntervalFn(() => {
    if (visibility.value === 'visible') {
      run()
    }
  }, intervalMs)
}
