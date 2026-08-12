import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'

import { KNOWN_MISSING_SNAPSHOTS, snapshotGap } from './check-drizzle-snapshot-drift.mjs'

/**
 * The ratchet that keeps the snapshot gap from widening while #1303 waits on a decision.
 *
 * The failure it guards is entirely silent: a hand-written migration lands, the journal grows,
 * no snapshot is written, and nothing complains — the only symptom is that `db:generate`
 * remains unusable, which nobody discovers until they next try to use it.
 */

function withMeta(entries, snapshots, run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'drizzle-meta-'))
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(
      path.join(root, '_journal.json'),
      JSON.stringify({ entries: entries.map(idx => ({ idx })) }),
    )
    for (const index of snapshots)
      writeFileSync(path.join(root, `${String(index).padStart(4, '0')}_snapshot.json`), '{}')
    return run(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('drizzle snapshot drift', () => {
  it('counts journal entries that have no snapshot', () => {
    withMeta([0, 1, 2, 3], [0, 1, 3], (meta) => {
      const gap = snapshotGap(meta)

      assert.equal(gap.journalEntries, 4)
      assert.equal(gap.snapshots, 3)
      assert.deepEqual(gap.missing, ['0002'])
    })
  })

  it('reports a gap in the middle, not just a truncated tail', () => {
    // 0011 and 0012 are missing while 0013 and 0014 exist. A check that only compared the
    // highest snapshot against the highest journal entry would score this chain as sound up
    // to 0014 and never notice.
    withMeta([0, 1, 2, 3, 4], [0, 3, 4], (meta) => {
      assert.deepEqual(snapshotGap(meta).missing, ['0001', '0002'])
    })
  })

  it('is satisfied only by an exact match', () => {
    withMeta([0, 1, 2], [0, 1, 2], (meta) => {
      assert.deepEqual(snapshotGap(meta).missing, [])
    })
  })

  it('measures the real migrations directory, and it still matches the pinned debt', () => {
    // Positive control and the ratchet in one: if this drifts either way the script fails, and
    // the direction tells you which — a widened gap is a new hand-written migration, a
    // narrowed one is repair work that should lower the pin.
    const gap = snapshotGap()

    assert.ok(gap.journalEntries > 30, `journal looks wrong: ${gap.journalEntries}`)
    assert.equal(gap.missing.length, KNOWN_MISSING_SNAPSHOTS)
    // The two the chain never had, rather than a truncated tail — see the script's comment.
    assert.ok(gap.missing.includes('0011'))
    assert.ok(gap.missing.includes('0012'))
  })
})
