#!/usr/bin/env node
/**
 * Refuse to run `drizzle-kit generate` while its snapshot baseline is behind the journal (#1303).
 *
 * drizzle-kit diffs `schema.ts` against the highest `meta/NNNN_snapshot.json`. That file stopped at
 * 0014 (2025-12-10) while migrations reached 0037, because the 23 in between were written by hand
 * — which is what happens when the generator cannot run. So `generate` re-proposes everything
 * 0015-0037 already created: 45 CREATE TABLE statements, none of them with IF NOT EXISTS.
 *
 * A developer following CLAUDE.md would commit that and break every upgrading installation, and
 * nothing in the command's output says so. An installed, runnable command that must not be used is
 * worse than an absent one, so this makes the state loud instead of silent.
 *
 * It is not the fix. The baseline still has to be rebuilt — replayed for 0015-0037, or rebaselined
 * at the current schema — and that decision belongs to whoever owns the migration history. This
 * only stops the trap from being sprung in the meantime, and disappears on its own once the
 * highest snapshot catches up.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../resources/db/migrations'
)

/** Highest migration index drizzle has recorded as applied-in-order. */
function highestJournalIndex() {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'))
  return journal.entries.reduce((highest, entry) => Math.max(highest, entry.idx), -1)
}

/** Highest index the generator can diff against. */
function highestSnapshotIndex() {
  return readdirSync(path.join(MIGRATIONS_DIR, 'meta'))
    .filter((name) => name.endsWith('_snapshot.json'))
    .map((name) => Number.parseInt(name.slice(0, 4), 10))
    .filter((index) => Number.isInteger(index))
    .reduce((highest, index) => Math.max(highest, index), -1)
}

const journalIndex = highestJournalIndex()
const snapshotIndex = highestSnapshotIndex()

if (snapshotIndex >= journalIndex) {
  process.exit(0)
}

process.stderr.write(
  `\ndb:generate is blocked — the drizzle snapshot baseline is stale (#1303).\n\n` +
    `  highest snapshot   meta/${String(snapshotIndex).padStart(4, '0')}_snapshot.json\n` +
    `  highest migration  ${String(journalIndex).padStart(4, '0')} (from meta/_journal.json)\n\n` +
    `drizzle-kit diffs schema.ts against the snapshot, so it would re-propose every table the\n` +
    `${journalIndex - snapshotIndex} migrations in between already created — as CREATE TABLE without IF NOT EXISTS,\n` +
    `which fails on any existing installation.\n\n` +
    `Write the migration by hand until the baseline is rebuilt, and see #1303 for the two ways\n` +
    `to rebuild it. This check passes on its own once the highest snapshot reaches the journal.\n\n`
)
process.exit(1)
