import type { TuffItem } from '@talex-touch/utils'

/**
 * How a launched app reports itself back to the search engine.
 *
 * This used to be a direct `import searchEngineCore from '../../search-engine/search-core'`, and
 * search-core imports `appProvider` back, so the two modules instantiated each other at module
 * scope. That only worked because AppProvider's constructor is a single log call -- promoting any
 * of its methods into constructor-time work would have dereferenced `searchEngineCore` mid-evaluation
 * and failed at boot rather than at the call site (#712).
 *
 * It lives beside app-provider rather than inside it because that file may shrink, not grow (#343):
 * the seam is a leaf, and the file that publishes the provider is the wrong home for the contract
 * its callers register.
 *
 * The recorder is invoked **synchronously**; a lazy `await import()` was tried first and broke
 * `records a session-scoped usage event before handing the app to the launch boundary`, because
 * deferring by a microtask puts the record after the launch it is supposed to precede.
 */
export type AppExecutionRecorder = (
  sessionId: string,
  item: TuffItem,
  /**
   * Foreground app captured before the launch was scheduled. Part of the contract rather than an
   * extra: the recorder writes it into `usage_logs.context.prevApp`, and a recorder free to
   * capture it itself would read whatever the launch already put in front.
   */
  previousApp: string | null
) => Promise<void>

let recordAppExecutionImpl: AppExecutionRecorder = async () => {}

/** What a launch calls. Replaced by the search engine once it is ready to receive the events. */
export function recordAppExecution(
  sessionId: string,
  item: TuffItem,
  previousApp: string | null
): Promise<void> {
  return recordAppExecutionImpl(sessionId, item, previousApp)
}

export function setAppExecutionRecorder(recorder: AppExecutionRecorder): void {
  recordAppExecutionImpl = recorder
}
