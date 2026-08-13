/**
 * A window in which OS clipboard changes are the app's own doing and must not be recorded.
 *
 * Selection capture sends a real Cmd/Ctrl+C to the foreground app and then restores the previous
 * clipboard. The native watcher cannot tell those writes apart from a user copy, so the selected
 * text - a password, a private message - was persisted to clipboard_history, shown in the history
 * UI and forwarded to plugins, and the restore added a duplicate row of the pre-existing entry
 * (#769).
 *
 * Kept in its own module so neither side imports the other: the clipboard pipeline and the
 * selection-capture service both depend on this and not on each other.
 */

/**
 * Upper bound on a single scope. A crash or a hung shortcut must not leave capture suppressed for
 * the rest of the session, so the window expires on its own even if the scope never closes.
 */
const MAX_SUPPRESSION_MS = 5_000

let activeScopes = 0
let expiresAt = 0

/**
 * Runs `task` with clipboard capture suppressed. Nested scopes are counted, so an inner scope
 * finishing does not re-enable capture while an outer one is still open.
 */
export async function withClipboardCaptureSuppressed<T>(task: () => Promise<T>): Promise<T> {
  activeScopes += 1
  expiresAt = Math.max(expiresAt, Date.now() + MAX_SUPPRESSION_MS)
  try {
    return await task()
  } finally {
    activeScopes = Math.max(0, activeScopes - 1)
    if (activeScopes === 0) {
      expiresAt = 0
    }
  }
}

export function isClipboardCaptureSuppressed(now: number = Date.now()): boolean {
  return activeScopes > 0 && now < expiresAt
}

/** Test seam: clears state a failed scope may have left behind. */
export function resetClipboardCaptureSuppression(): void {
  activeScopes = 0
  expiresAt = 0
}
