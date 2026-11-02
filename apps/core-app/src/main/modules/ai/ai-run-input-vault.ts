import { app } from 'electron'
import { structuredStrictStringify } from '@talex-touch/utils'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { getSecureStoreValueStrict, setSecureStoreValue } from '../../utils/secure-store'

/**
 * Where a run's input waits for a restart.
 *
 * A run's input is user data (a prompt, a document), so it never goes to SQLite or a log: the run
 * row keeps only its digest. To resume after the app restarts, the input is written to the secure
 * store - encrypted under the machine's own root key - keyed by run id. The caller checks what comes
 * back against the digest the run row recorded; an input that cannot be read is reported as absent,
 * and the run is then interrupted exactly as it was before this vault existed.
 */
const KEY_PREFIX = 'ai-run-input.'
const PURPOSE = 'ai-run-input'

/** The secure store refuses a value over this (`SECURE_STORE_BATCH_MAX_VALUE_BYTES`). */
const MAX_INPUT_BYTES = 1024 * 1024

function keyFor(runId: string): string {
  return `${KEY_PREFIX}${runId}`
}

function rootPath(): string {
  return resolveRuntimeRootPath(app)
}

/**
 * Stores `input` for `runId`. Returns false - and stores nothing - when the input is too large for
 * the store or the store is unavailable: the run still executes, it just cannot be resumed.
 */
export async function saveRunInput(runId: string, input: unknown): Promise<boolean> {
  const serialized = structuredStrictStringify(input)
  if (Buffer.byteLength(serialized, 'utf-8') > MAX_INPUT_BYTES) return false
  return await setSecureStoreValue(rootPath(), keyFor(runId), serialized, PURPOSE)
}

/** The input stored for `runId`, or null when there is none or it cannot be read. Never throws. */
export async function loadRunInput(runId: string): Promise<{ input: unknown } | null> {
  try {
    const stored = await getSecureStoreValueStrict(rootPath(), keyFor(runId), PURPOSE)
    return stored === null ? null : { input: JSON.parse(stored) }
  } catch {
    return null
  }
}

/**
 * Forgets the input of `runId`. A value that is already gone is not an error. Deletes the one key:
 * the store's prefix delete would also take any run whose id merely starts with this one.
 */
export async function discardRunInput(runId: string): Promise<void> {
  await setSecureStoreValue(rootPath(), keyFor(runId), null, PURPOSE)
}
