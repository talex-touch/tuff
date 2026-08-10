import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `db:generate` must not run against a stale snapshot baseline (#1303).
 *
 * drizzle-kit diffs `schema.ts` against the highest `meta/NNNN_snapshot.json`. That stopped at 0014
 * on 2025-12-10 while migrations reached 0037 — the 23 in between were hand-written, which is what
 * happens when the generator cannot run. So `generate` re-proposes every table those migrations
 * already created: 45 CREATE TABLE statements, none carrying IF NOT EXISTS, which fails on any
 * existing installation.
 *
 * CLAUDE.md documents the command. Nothing in its output said any of this, so the failure mode was
 * a developer committing its first output in good faith.
 *
 * This pins the preflight that makes the state loud, not the drift itself: rebuilding the baseline
 * changes files that run against users' databases, and that decision is on #1303. Both assertions
 * below stop applying on their own once the baseline catches up, so this does not have to be
 * remembered and removed.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const CORE_APP = path.join(REPO_ROOT, 'apps/core-app')
const MIGRATIONS = path.join(CORE_APP, 'resources/db/migrations')

const manifest = JSON.parse(readFileSync(path.join(CORE_APP, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ idx: number, tag: string }>
}

const highestJournalIndex = journal.entries.reduce((highest, entry) => Math.max(highest, entry.idx), -1)

const highestSnapshotIndex = readdirSync(path.join(MIGRATIONS, 'meta'))
  .filter(name => name.endsWith('_snapshot.json'))
  .map(name => Number.parseInt(name.slice(0, 4), 10))
  .filter(index => Number.isInteger(index))
  .reduce((highest, index) => Math.max(highest, index), -1)

describe('drizzle migration bookkeeping', () => {
  it('reads the journal and snapshots it means to compare', () => {
    // Positive control: an unreadable directory or a wrong root yields -1 for both, which would
    // satisfy "the snapshot is not behind" without having compared anything.
    expect(journal.entries.length).toBeGreaterThan(30)
    expect(highestJournalIndex).toBeGreaterThan(-1)
    expect(highestSnapshotIndex).toBeGreaterThan(-1)
  })
})

describe('db:generate', () => {
  it('runs the baseline preflight before the generator', () => {
    expect(manifest.scripts['db:generate']).toBe(
      'node scripts/db/assert-snapshot-baseline.mjs && drizzle-kit generate',
    )
  })

  it('refuses to run while the baseline is behind, and says why', () => {
    if (highestSnapshotIndex >= highestJournalIndex) {
      // The baseline was rebuilt. The preflight is now a no-op by its own logic, and this
      // assertion is what proves it rather than the test quietly passing on a broken check.
      expect(run().status).toBe(0)
      return
    }

    const { status, stderr } = run()

    expect(status).toBe(1)
    expect(stderr).toContain('#1303')
    // The two numbers a reader needs to act, not just a refusal.
    expect(stderr).toContain(`meta/${String(highestSnapshotIndex).padStart(4, '0')}_snapshot.json`)
    expect(stderr).toContain(String(highestJournalIndex).padStart(4, '0'))
  })
})

function run(): { status: number, stderr: string } {
  try {
    execFileSync('node', ['scripts/db/assert-snapshot-baseline.mjs'], {
      cwd: CORE_APP,
      encoding: 'utf8',
    })
    return { status: 0, stderr: '' }
  }
  catch (error) {
    const failure = error as { status?: number, stderr?: string }
    return { status: failure.status ?? -1, stderr: failure.stderr ?? '' }
  }
}
