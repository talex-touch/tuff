#!/usr/bin/env node
/**
 * Stops the drizzle snapshot baseline from drifting further behind the migrations.
 *
 * `drizzle-kit generate` diffs `schema.ts` against the highest `meta/NNNN_snapshot.json`. That
 * snapshot stopped at 0014 while the journal reached 0037, so the generator's first output
 * re-proposes every table migrations 0015+ already created -- 45 `CREATE TABLE`, none with
 * `IF NOT EXISTS`, which would fail on any existing installation. A developer following
 * CLAUDE.md gets that file with nothing indicating the baseline is stale (#1303).
 *
 * Rebuilding the baseline is a decision between replaying 0015+ and rebaselining at the current
 * schema, and it changes files that run against users' databases. This check does not make that
 * decision. It ratchets: the gap recorded below is what exists today, and adding a migration
 * without a snapshot makes it bigger, which fails.
 *
 * The reverse also fails. If someone rebaselines and the gap shrinks, the recorded number is
 * wrong and has to be updated -- otherwise it silently becomes a ceiling nobody is measuring
 * against, which is how a tolerance turns into a permanent exemption.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metaDir = path.join(repoRoot, 'apps/core-app/resources/db/migrations/meta')

/**
 * The gap on 2026-08-11: journal at 0037, snapshots at 0014.
 *
 * This is a record of a known defect, not a budget. #1303 owns closing it, and closing it means
 * this constant goes to 0 and stays there.
 */
const EXPECTED_GAP = 23

export function highestJournalIndex(journal) {
  const entries = Array.isArray(journal?.entries) ? journal.entries : []
  if (entries.length === 0)
    return null
  return entries.reduce((max, entry) => {
    const tag = typeof entry?.tag === 'string' ? entry.tag : ''
    const match = tag.match(/^(\d+)/)
    return match ? Math.max(max, Number(match[1])) : max
  }, -1)
}

export function highestSnapshotIndex(fileNames) {
  const indexes = (Array.isArray(fileNames) ? fileNames : [])
    .map(name => name.match(/^(\d+)_snapshot\.json$/))
    .filter(Boolean)
    .map(match => Number(match[1]))
  return indexes.length === 0 ? null : Math.max(...indexes)
}

/**
 * A missing journal or an empty snapshot set is a failure, not a clean run.
 *
 * Both look identical to "no drift" if they are allowed to return 0, and both happen for real --
 * a moved directory, a partial checkout, a renamed meta folder. Same rule as validate-plugins.mjs.
 */
export function evaluate(journalIndex, snapshotIndex, expectedGap) {
  if (journalIndex === null)
    return { ok: false, reason: 'no journal entries found — the check read nothing' }
  if (snapshotIndex === null)
    return { ok: false, reason: 'no meta/NNNN_snapshot.json found — the check read nothing' }

  const gap = journalIndex - snapshotIndex
  if (gap > expectedGap) {
    return {
      ok: false,
      gap,
      reason: `snapshot baseline fell further behind: journal ${journalIndex}, snapshot ${snapshotIndex}, `
        + `gap ${gap} > recorded ${expectedGap}. A migration was added without a snapshot; `
        + `drizzle-kit generate now diffs against an even older picture (#1303)`,
    }
  }
  if (gap < expectedGap) {
    return {
      ok: false,
      gap,
      reason: `the gap shrank to ${gap} (journal ${journalIndex}, snapshot ${snapshotIndex}). `
        + `Lower EXPECTED_GAP in this script to ${gap} so it keeps measuring something`,
    }
  }
  return { ok: true, gap }
}

function selfTest() {
  const journal = { entries: [{ tag: '0000_a' }, { tag: '0037_z' }, { tag: '0012_m' }] }
  const cases = [
    { name: 'highest journal index ignores ordering', actual: highestJournalIndex(journal), expected: 37 },
    { name: 'an empty journal reads as null, not 0', actual: highestJournalIndex({ entries: [] }), expected: null },
    { name: 'a missing journal reads as null', actual: highestJournalIndex(undefined), expected: null },
    {
      name: 'highest snapshot index ignores non-snapshot files',
      actual: highestSnapshotIndex(['0014_snapshot.json', '_journal.json', '0002_snapshot.json']),
      expected: 14,
    },
    { name: 'an empty snapshot set reads as null, not 0', actual: highestSnapshotIndex([]), expected: null },
    { name: 'the recorded gap passes', actual: evaluate(37, 14, 23).ok, expected: true },
    { name: 'a widened gap fails', actual: evaluate(38, 14, 23).ok, expected: false },
    { name: 'a narrowed gap fails, so the record cannot go stale', actual: evaluate(37, 15, 23).ok, expected: false },
    { name: 'no journal fails instead of reporting no drift', actual: evaluate(null, 14, 23).ok, expected: false },
    { name: 'no snapshots fails instead of reporting no drift', actual: evaluate(37, null, 23).ok, expected: false },
    { name: 'a closed gap passes only when recorded as closed', actual: evaluate(37, 37, 0).ok, expected: true },
  ]

  let failures = 0
  for (const testCase of cases) {
    const ok = testCase.actual === testCase.expected
    if (!ok)
      failures += 1
    console.log(`${ok ? '\x1B[32m  ok\x1B[0m' : '\x1B[31mFAIL\x1B[0m'}  ${testCase.name}`)
  }
  console.log(
    failures === 0
      ? `\n\x1B[32mSelf-test passed: ${cases.length} cases.\x1B[0m\n`
      : `\n\x1B[31mSelf-test failed: ${failures}/${cases.length} cases.\x1B[0m\n`,
  )
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

let journal
try {
  journal = JSON.parse(fs.readFileSync(path.join(metaDir, '_journal.json'), 'utf8'))
}
catch (error) {
  console.error(`\x1B[31mCould not read the drizzle journal: ${error.message}\x1B[0m\n`)
  process.exit(1)
}

let fileNames
try {
  fileNames = fs.readdirSync(metaDir)
}
catch (error) {
  console.error(`\x1B[31mCould not read ${path.relative(repoRoot, metaDir)}: ${error.message}\x1B[0m\n`)
  process.exit(1)
}

const journalIndex = highestJournalIndex(journal)
const snapshotIndex = highestSnapshotIndex(fileNames)
const verdict = evaluate(journalIndex, snapshotIndex, EXPECTED_GAP)

if (!verdict.ok) {
  console.error(`\n\x1B[31m  ✗\x1B[0m ${verdict.reason}\n`)
  process.exit(1)
}

console.log(
  `\ndrizzle snapshot baseline: journal ${journalIndex}, snapshot ${snapshotIndex}, `
  + `gap ${verdict.gap} (recorded, tracked on #1303).\n`,
)
