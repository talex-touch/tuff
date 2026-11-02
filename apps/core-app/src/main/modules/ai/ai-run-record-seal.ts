import type { PiRuntimeRunRecord } from './pi-agent-runtime-protocol'
import { createHash } from 'node:crypto'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { unwrapSecureStoreValue, wrapSecureStoreValue } from '../../utils/secure-store'

/**
 * Seals the records of a run's message log before they reach SQLite.
 *
 * A record holds what the user asked and what tools returned, so the table only ever sees an
 * envelope: AES-GCM under the machine's own root key, the same protection the secure store gives a
 * token. The envelope is authenticated against the run and the position it was written at, so a
 * record copied to another run, or moved to another position in its own log, does not open - a log
 * that was reordered or spliced reads as no log, and the run starts over instead of resuming from it.
 */
const PURPOSE = 'ai-run-record'

function keyFor(runId: string, seq: number): string {
  // The secure-store key is limited to 80 characters; the run id is hashed so its length never matters.
  const run = createHash('sha256').update(runId).digest('hex').slice(0, 32)
  return `ai-run-record.${run}.${seq}`
}

function rootPath(): string {
  return resolveRuntimeRootPath(app)
}

/** The envelope for `record` as the `seq`-th record of `runId`, or null when it could not be sealed. */
export async function sealRunRecord(
  runId: string,
  seq: number,
  record: PiRuntimeRunRecord
): Promise<string | null> {
  const wrapped = await wrapSecureStoreValue(
    rootPath(),
    keyFor(runId, seq),
    JSON.stringify(record),
    PURPOSE
  )
  return wrapped?.value ?? null
}

/**
 * The records of `runId` opened from `rows`, in order; null when the log cannot be trusted: it does
 * not run 1..n without a gap, or any envelope does not open for the run and position it claims.
 * Never throws.
 */
export async function openRunRecords(
  runId: string,
  rows: ReadonlyArray<{ seq: number; envelope: string }>
): Promise<PiRuntimeRunRecord[] | null> {
  const records: PiRuntimeRunRecord[] = []
  for (const [index, row] of rows.entries()) {
    if (row.seq !== index + 1) return null
    const plain = await unwrapSecureStoreValue(
      rootPath(),
      keyFor(runId, row.seq),
      row.envelope,
      PURPOSE
    )
    if (plain === null) return null
    try {
      const parsed = JSON.parse(plain) as PiRuntimeRunRecord | null
      if (!parsed || typeof parsed !== 'object' || !('message' in parsed)) return null
      records.push(parsed)
    } catch {
      return null
    }
  }
  return records
}
