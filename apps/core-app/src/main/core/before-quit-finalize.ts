/**
 * The tail of the before-quit flow: broadcast, then either hand off to the dev shutdown manager
 * or quit.
 *
 * Extracted because the handler in precore.ts calls event.preventDefault() unconditionally, so
 * anything that throws before app.quit() leaves the app unquittable - every later attempt is
 * prevented too, and the user has to force-kill it. broadcastBeforeQuit resolves the channel and
 * builds a transport, both of which can be in a bad state at shutdown, and it sat outside any
 * try/catch (#796).
 *
 * Nothing here may throw past its own step. The contract is simply: this function always ends in
 * a quit or an explicit delegation, whatever the callbacks do.
 */
export interface BeforeQuitFinalizeOptions {
  broadcast: () => void
  shouldDelegateToDevManager: () => boolean
  delegateToDevManager: () => void
  quit: () => void
  logError: (message: string, error: unknown) => void
}

export interface BeforeQuitFinalizeResult {
  /** True when the dev shutdown manager took over and this flow must not call quit. */
  delegated: boolean
}

export function finalizeBeforeQuit(options: BeforeQuitFinalizeOptions): BeforeQuitFinalizeResult {
  try {
    options.broadcast()
  } catch (error) {
    // A renderer that never hears about the quit is a far smaller problem than an app that
    // cannot be closed.
    options.logError('before-quit broadcast failed, continuing shutdown', error)
  }

  let delegated = false
  try {
    if (options.shouldDelegateToDevManager()) {
      options.delegateToDevManager()
      delegated = true
    }
  } catch (error) {
    // Delegation failing means nobody else is going to quit for us, so fall through and do it.
    options.logError('dev shutdown delegation failed, quitting directly', error)
    delegated = false
  }

  if (delegated) {
    return { delegated: true }
  }

  options.quit()
  return { delegated: false }
}
