/**
 * The memory failures main names to the app's own renderer, and how the memory page reads them.
 *
 * The memory channels answer through `safeApiHandler`, which hides a failure behind one public
 * sentence unless the channel projects it. Exactly one memory failure is projected: a replace whose
 * memory changed after the editor read it — the compare-and-swap in `replaceMemory`. The page acts
 * on that one: it reloads the list, keeps the memory selected and moves the open draft onto the
 * reloaded copy. The other memory codes main throws (`MEMORY_REPLACE_EVALUATION_MISMATCH`,
 * `MEMORY_POLICY_REJECTED_SECRET`) have no branch on the page, which says "保存记忆失败" for any
 * other failure, so they stay behind the sentence.
 *
 * Main sends the app `[MEMORY_REPLACE_CONFLICT] reason` — the prefix form the capability channels
 * answer in — and a plugin the bare code (`main/modules/ai/memory-error-projection.ts`).
 */

export const MEMORY_REPLACE_CONFLICT = 'MEMORY_REPLACE_CONFLICT'

/** Whether a failed memory call is the replace conflict, in either shape main sends it. */
export function isMemoryReplaceConflict(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === MEMORY_REPLACE_CONFLICT
  )
    return true
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message === MEMORY_REPLACE_CONFLICT || message.startsWith(`[${MEMORY_REPLACE_CONFLICT}]`)
}
