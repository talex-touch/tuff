/**
 * What the app's own renderer may learn about a memory replace that failed.
 *
 * The memory channels answer through `safeApiHandler`, which hides every failure behind one public
 * sentence. A replace fails for one reason the memory page must tell apart: the memory changed
 * after the editor read it (`replaceMemory`'s compare-and-swap). The page then reloads, keeps the
 * memory selected and moves the draft onto the reloaded copy; behind the public sentence it could
 * only say "保存记忆失败", and every retry failed against the same stale copy.
 *
 * Exactly that failure is named, the way a failed capability call answers (`toApiFailure`): the app
 * gets `[MEMORY_REPLACE_CONFLICT] reason`, a plugin the code alone — though a plugin never reaches
 * this channel's work, the handler is host-only. Everything else, including the other memory codes
 * the page has no branch for, keeps the public sentence (`shared/intelligence/memory-errors.ts`).
 */

import type { ApiErrorProjection } from '../../utils/safe-handler'
import { MEMORY_REPLACE_CONFLICT } from '../../../shared/intelligence/memory-errors'

export const MEMORY_REPLACE_CONFLICT_REASON =
  'The memory changed after it was read. Reload it and evaluate the edit again.'

/**
 * `projectError` for the memory replace channel. Matched against the exact message
 * `replaceMemory` throws (`intelligence-context-hygiene.ts`); the channel test pins the two together.
 */
export function projectMemoryReplaceError(
  error: unknown,
  options: { host: boolean }
): ApiErrorProjection | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (message !== MEMORY_REPLACE_CONFLICT) return undefined
  if (!options.host) return { error: MEMORY_REPLACE_CONFLICT }
  return {
    error: `[${MEMORY_REPLACE_CONFLICT}] ${MEMORY_REPLACE_CONFLICT_REASON}`,
    code: MEMORY_REPLACE_CONFLICT,
    retryable: true
  }
}
