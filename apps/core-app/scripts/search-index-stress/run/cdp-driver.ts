import type { SearchAnswer, SearchDriver, SearchOptions, SearchRow } from './driver-types'
import { DriverError, throwIfAborted } from './errors'
import type { PageSession } from './page-bridge'
import { runOperation } from './page-bridge'
import type { BridgeSlice } from './page-scripts'
import type { RowItem } from './ui-merge'
import { RenderedRows } from './ui-merge'

export interface CdpDriverOptions {
  /** How long one wait in the page may last; bounds how late an abort or a reload is noticed. */
  sliceMs?: number
}

export function toSearchRow(item: RowItem): SearchRow {
  let path: string | undefined
  if (item.kind === 'app') path = item.appPath ?? item.filePath ?? undefined
  else if (item.kind === 'file')
    path = item.filePath ?? (item.id.startsWith('/') ? item.id : undefined)
  else path = item.filePath ?? item.appPath ?? undefined
  return {
    id: item.id,
    kind: item.kind,
    name: item.title,
    ...(path ? { path } : {}),
    sourceId: item.sourceId,
    score: item.score
  }
}

/** Maps a failed operation to the error the checks understand; main-side failures are never verdicts. */
export function operationError(final: BridgeSlice, what: string): DriverError | null {
  const error = final.error
  if (!error) return null
  const detail = `${what}: ${error.message}${error.code ? ` (${error.code})` : ''}`
  if (error.kind === 'protocol') return new DriverError('protocol', detail)
  if (error.kind === 'timeout') return new DriverError('timeout', detail)
  return new DriverError('main-error', detail)
}

let operationSequence = 0

/** Next page-wide unique id for an operation started by this process. */
export function nextOperationId(prefix: string): string {
  operationSequence += 1
  return `${prefix}${operationSequence}`
}

/** Searches through the page's own `core-box:search:session` stream and merges the batches as the CoreBox list does. */
export function createCdpSearchDriver(
  session: PageSession,
  options: CdpDriverOptions = {}
): SearchDriver {
  const sliceMs = options.sliceMs ?? 1_000
  return {
    async search(query: string, { timeoutMs, signal }: SearchOptions): Promise<SearchAnswer> {
      throwIfAborted(signal)
      const { events, final } = await runOperation(
        session,
        'searchStart',
        [nextOperationId('s'), query, timeoutMs],
        { sliceMs, signal }
      )
      throwIfAborted(signal)
      const failure = operationError(final, `search "${query.slice(0, 40)}"`)
      if (failure) throw failure

      const rows = new RenderedRows()
      let batches = 0
      for (const event of events) {
        if (event.k === 'snapshot') {
          rows.applySnapshot(event.items ?? [])
          batches += 1
        } else if (event.k === 'update') {
          rows.applyUpdate(event.items ?? [])
          batches += 1
        }
      }
      const endSignalSeen =
        final.endSignal === true && final.cancelled !== true && final.timedOut !== true
      return {
        rows: rows.visible.map(toSearchRow),
        answerMs: endSignalSeen ? (final.answerMs ?? 0) : timeoutMs,
        endSignalSeen,
        batches
      }
    }
  }
}
