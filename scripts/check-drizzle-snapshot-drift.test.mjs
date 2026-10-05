import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'

import { snapshotGap } from './check-drizzle-snapshot-drift.mjs'

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
})
