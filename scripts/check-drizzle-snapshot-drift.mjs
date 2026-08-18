#!/usr/bin/env node
/**
 * Stops the drizzle snapshot chain drifting further from the journal (#1303).
 *
 * `drizzle-kit` diffs against the newest snapshot. The newest here is `0014`, written
 * 2025-12-10, while the journal runs to `0037` — so `db:generate`'s first output re-emits
 * every change from the 23 migrations in between, and cannot be committed.
 *
 * Repairing that is a migration-history decision (rebuild each intermediate state, or flatten
 * to a new baseline) and belongs to the maintainer. What does not need a decision is that the
 * gap should not get *bigger* while it waits: every hand-written migration added today widens
 * it silently, and the only symptom is that the generator stays unusable.
 *
 * So this pins the known gap and fails when it grows. It is a ratchet, not a fix: the number
 * below is a debt, and lowering it is the repair.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const META = path.join(REPO_ROOT, 'apps/core-app/resources/db/migrations/meta')

/**
 * Journal indexes with no snapshot, as of 2026-08-11.
 *
 * `0011` and `0012` are not a later deletion — `git log --diff-filter=A` finds no commit that
 * ever added them, and `--diff-filter=D` finds no snapshot deletion at all. The chain was
 * never complete, so there is no lost history to recover before deciding what to do.
 *
 * Raised 24 → 25 on 2026-08-13, deliberately, which is the escape hatch this check offers rather
 * than a way around it. Both `master` and `app-shell-v2` had added a migration numbered `0037`;
 * merging them meant keeping both, so `0037_conversation_messages_composite_pk` was renumbered to
 * `0038`. `app-shell-v2` never carried a snapshot for it — its `meta/` stops at `0014` — so the
 * renumber did not lose one, it moved a gap that already existed.
 *
 * The right repair is `db:generate` against the merged schema, which rebuilds the chain rather
 * than shifting the pin again. That is a separate change: doing it inside a 38-file merge would
 * mix a schema-tooling run with conflict resolutions nobody could review apart.
 *
 * Raised 25 → 27 on 2026-08-18 for `0039_conversation_sync_tombstones` and
 * `0040_conversation_sync_state_migration`. Both are hand-written, upgrade-safe migrations in
 * the intentionally snapshotless 0015+ range; this records the two known additions explicitly
 * without pretending the broken snapshot chain has been repaired.
 */
export const KNOWN_MISSING_SNAPSHOTS = 27

export function snapshotGap(metaDir = META) {
  const journal = JSON.parse(readFileSync(path.join(metaDir, '_journal.json'), 'utf8'))
  const snapshots = new Set(
    readdirSync(metaDir)
      .filter(name => name.endsWith('_snapshot.json'))
      .map(name => name.slice(0, 4)),
  )

  const missing = journal.entries
    .map(entry => String(entry.idx).padStart(4, '0'))
    .filter(index => !snapshots.has(index))

  return { journalEntries: journal.entries.length, snapshots: snapshots.size, missing }
}

function main() {
  const { journalEntries, snapshots, missing } = snapshotGap()

  if (missing.length > KNOWN_MISSING_SNAPSHOTS) {
    console.error(
      `[check-drizzle-snapshot-drift] ${missing.length} journal entries have no snapshot, up from ${KNOWN_MISSING_SNAPSHOTS}.\n`
      + `  journal: ${journalEntries}  snapshots: ${snapshots}\n`
      + `  newly unbacked: ${missing.slice(KNOWN_MISSING_SNAPSHOTS).join(', ')}\n\n`
      + 'A migration was added by hand without advancing the snapshot chain, which pushes\n'
      + 'drizzle-kit\'s diff baseline further from reality (#1303). Either write the snapshot\n'
      + 'alongside the migration, or raise the pinned number deliberately and say why.',
    )
    process.exit(1)
  }

  if (missing.length < KNOWN_MISSING_SNAPSHOTS) {
    console.error(
      `[check-drizzle-snapshot-drift] only ${missing.length} entries lack a snapshot, down from ${KNOWN_MISSING_SNAPSHOTS}.\n`
      + 'The debt shrank — lower KNOWN_MISSING_SNAPSHOTS so the ratchet holds the new floor.',
    )
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main()
