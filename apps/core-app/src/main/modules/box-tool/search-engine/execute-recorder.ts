import type { TuffItem } from '@talex-touch/utils'
import type { UsageEntryPoint } from './usage-entry-point'
import { randomUUID } from 'node:crypto'

/**
 * One major action a provider has accepted, ready for the engine to count.
 *
 * Providers live under `addon/` and reach the engine only through leaf seams like this one: a
 * provider that imported `search-core` directly would close the module-scope cycle documented in
 * `app-execution-recorder.ts` (#712/#523). The engine registers the writer once; providers publish
 * accepted actions and never touch the statistics store themselves.
 *
 * Only a *major* action belongs here. Opening a copy-path dialog, revealing a file, previewing or
 * a cancellation is not a use of the item and must not arrive.
 */
export interface AcceptedExecuteRecord {
  /** The executed item. Its rendered id may be temporary; the engine resolves the catalogue key. */
  item: TuffItem
  /** Search session when the action came from a query; a direct trigger carries none. */
  sessionId?: string | null
  /** Surface that executed. Required: the engine cannot always derive it for a non-list surface. */
  entryPoint: UsageEntryPoint
  /**
   * Identifier of this user action. Minted once at the trigger and reused verbatim for retries and
   * duplicate notifications, so the action is counted exactly once (the database dedupes on it).
   */
  eventId: string
  /** Foreground app captured before a launch was scheduled, when the caller already read it. */
  previousApp?: string | null
}

export type ExecuteRecorder = (record: AcceptedExecuteRecord) => Promise<void>

let executeRecorderImpl: ExecuteRecorder = async () => {}

/**
 * The id an action is counted under.
 *
 * Entries mint one per user action and reuse it for every retry/notification of that action; a
 * call that arrives without one (an older caller, or a surface that does not track it) still needs
 * a unique id, so one is minted here rather than letting several no-id calls collapse into a single
 * count.
 */
export function resolveExecuteEventId(eventId?: string | null): string {
  return typeof eventId === 'string' && eventId.length > 0 ? eventId : randomUUID()
}

/** What an accepted provider action calls. Replaced by the search engine once it can receive it. */
export function recordAcceptedExecute(record: AcceptedExecuteRecord): Promise<void> {
  return executeRecorderImpl(record)
}

export function setExecuteRecorder(recorder: ExecuteRecorder): void {
  executeRecorderImpl = recorder
}
