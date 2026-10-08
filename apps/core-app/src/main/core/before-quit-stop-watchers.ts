import type { BeforeQuitGuardResult } from './before-quit-guard'
import { runWithBeforeQuitTimeout } from './before-quit-guard'
import { BeforeQuitStopWatchersEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'

/**
 * Closing a watcher is a handful of synchronous FSEventStream calls plus awaiting in-flight
 * metadata work; anything longer is a stuck watcher, and the quit flow must not wait on it.
 */
const BEFORE_QUIT_STOP_WATCHERS_TIMEOUT_MS = 2_000

let stopWatchersPromise: Promise<BeforeQuitGuardResult> | null = null

/**
 * Stops native file watchers before anything else in the quit flow.
 *
 * Every path that ends the process reaches `app.exit` eventually (the before-quit finalizer,
 * Sentry's will-quit handler, the dev force-exit timer; in the main process `process.exit` *is*
 * `app.exit`), and `app.exit` tears the Node environment down without waiting for module
 * unload. An FSEvents stream that is still running at that point aborts the process from its
 * own thread. So the streams are stopped up front, through `BEFORE_QUIT_STOP_WATCHERS`, instead
 * of relying on `unloadAll` reaching the watcher module in time.
 *
 * precore's before-quit flow and DevProcessManager's forced shutdown both call this; the
 * promise is shared, so the handlers run once and the second caller just joins.
 */
export function stopWatchersBeforeQuit(
  timeoutMs = BEFORE_QUIT_STOP_WATCHERS_TIMEOUT_MS
): Promise<BeforeQuitGuardResult> {
  if (!stopWatchersPromise) {
    stopWatchersPromise = runWithBeforeQuitTimeout(
      () =>
        touchEventBus.emitAsync(
          TalexEvents.BEFORE_QUIT_STOP_WATCHERS,
          new BeforeQuitStopWatchersEvent()
        ),
      timeoutMs
    )
  }
  return stopWatchersPromise
}
