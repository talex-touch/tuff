#!/usr/bin/env node
/**
 * Fails when a maintenance-audit report names a Trellis task that does not exist.
 *
 * The reports are written by hand, one per day, and #1107 was filed because a bullet was being
 * carried forward instead of re-derived: the same sentence about `DB_SEARCH_SPLIT_ENABLED`
 * appeared in eight consecutive reports, still describing a default that had been inverted three
 * days earlier.
 *
 * The 2026-08-12 report gave a worse example. Its task-records bullet named
 * `07-26-install-launch-v2-4-13-beta-23` as an in-progress task missing metadata. That directory
 * does not exist -- not under `.trellis/tasks`, not under the archive, nowhere. Two of the other
 * three tasks it named were wrong in different ways (one archived and completed, one with all
 * three fields present and updated the day before), and its count of non-completed tasks was 85
 * against an actual 53.
 *
 * A report naming a task nobody can open is the cheapest possible signal that its author did not
 * query the tree, and it is a directory lookup to catch. That is all this does. The counts and the
 * prose are not checked -- a check that tried to parse "至少 X 项" out of two languages would fail
 * in ways nobody could act on, and the field-presence claim is already `docs:verify`'s
 * `DOC-TASK-META` rule, which reported 0 on the same day the bullet claimed otherwise.
 *
 * Reports dated on or before GATE_FROM are history and are left alone, which is #1107's fourth
 * acceptance criterion: corrections belong in new reports, not in rewritten ones.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_DIR = 'docs/engineering/reports'
const TASK_ROOT = '.trellis/tasks'

/**
 * Reports up to and including this date predate the gate.
 *
 * 2026-08-12 is the last report written before this check existed, and it is the one carrying the
 * nonexistent task reference. Correcting it would rewrite a dated snapshot, so it is grandfathered
 * here instead, where the exemption is visible and dated rather than silent.
 */
const GATE_FROM = '2026-08-12'

const REPORT_NAME = /^maintenance-audit-(\d{4}-\d{2}-\d{2})\.md$/

/**
 * A Trellis task slug as the reports write it: `MM-DD-some-name`, inside backticks.
 *
 * Backticks are required rather than optional. Without them this matches dates, version fragments
 * and issue titles in running prose, and a check that reports a date as a missing task is one
 * nobody will keep.
 */
const TASK_REFERENCE = /`(\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)`/g

/** Every task slug that exists, active or archived. */
export function collectTaskSlugs(readDir) {
  const slugs = new Set()
  const walk = (dir, depth) => {
    if (depth > 3)
      return
    for (const entry of readDir(dir)) {
      if (!entry.isDirectory)
        continue
      if (entry.name === 'archive' || /^\d{4}-\d{2}$/.test(entry.name)) {
        walk(path.posix.join(dir, entry.name), depth + 1)
        continue
      }
      slugs.add(entry.name)
    }
  }
  walk(TASK_ROOT, 0)
  return slugs
}

export function referencedTasks(markdown) {
  return [...new Set([...markdown.matchAll(TASK_REFERENCE)].map(match => match[1]))]
}

export function gatedReports(names, gateFrom) {
  return names
    .map(name => ({ name, date: REPORT_NAME.exec(name)?.[1] }))
    .filter(entry => entry.date && entry.date > gateFrom)
    .map(entry => entry.name)
}

export function findMissingTasks(reports, slugs, readReport) {
  const missing = []
  for (const report of reports) {
    for (const slug of referencedTasks(readReport(report))) {
      if (!slugs.has(slug))
        missing.push({ report, slug })
    }
  }
  return missing
}

function readDirEntries(dir) {
  const absolute = path.join(repoRoot, dir)
  if (!fs.existsSync(absolute))
    return []
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
}

function main() {
  const slugs = collectTaskSlugs(readDirEntries)
  if (slugs.size === 0) {
    console.error(`No task directories found under ${TASK_ROOT}. Refusing to report success.`)
    return 1
  }

  const names = readDirEntries(REPORT_DIR)
    .filter(entry => !entry.isDirectory)
    .map(entry => entry.name)
  const reports = gatedReports(names, GATE_FROM)
  const readReport = name => fs.readFileSync(path.join(repoRoot, REPORT_DIR, name), 'utf8')

  if (reports.length === 0) {
    console.log(
      `check-audit-report-claims: no maintenance-audit report dated after ${GATE_FROM}; `
      + `${slugs.size} task slugs known.`,
    )
    return 0
  }

  const missing = findMissingTasks(reports, slugs, readReport)
  if (missing.length > 0) {
    console.error('Maintenance-audit report names a Trellis task that does not exist:\n')
    for (const entry of missing) {
      console.error(`  ${REPORT_DIR}/${entry.report}  ->  ${entry.slug}`)
    }
    console.error(
      `\n${slugs.size} task slugs exist under ${TASK_ROOT} (including the archive). A report that`
      + ' names one of these is describing something nobody can open, which means the claim around'
      + ' it was carried rather than re-derived (#1107).',
    )
    return 1
  }

  const checked = reports.reduce((total, report) => total + referencedTasks(readReport(report)).length, 0)
  console.log(
    `check-audit-report-claims: ${checked} task reference(s) across ${reports.length} report(s) `
    + `all resolve; ${slugs.size} slugs known.`,
  )
  return 0
}

function selfTest() {
  const tree = {
    '.trellis/tasks': [
      { name: '08-01-live', isDirectory: true },
      { name: 'archive', isDirectory: true },
      { name: 'README.md', isDirectory: false },
    ],
    '.trellis/tasks/archive': [{ name: '2026-07', isDirectory: true }],
    '.trellis/tasks/archive/2026-07': [{ name: '07-28-done', isDirectory: true }],
  }
  const slugs = collectTaskSlugs(dir => tree[dir] ?? [])

  const cases = [
    { name: 'an active task is known', actual: slugs.has('08-01-live'), expected: true },
    { name: 'an archived task is known too', actual: slugs.has('07-28-done'), expected: true },
    { name: 'the archive folders are not slugs', actual: slugs.has('archive'), expected: false },
    { name: 'a file is not a slug', actual: slugs.has('README.md'), expected: false },
    {
      name: 'a backticked slug is a reference',
      actual: referencedTasks('see `08-01-live` today')[0],
      expected: '08-01-live',
    },
    {
      name: 'a bare date in prose is not a reference',
      actual: referencedTasks('on 08-01-live we shipped').length,
      expected: 0,
    },
    {
      name: 'the same slug twice counts once',
      actual: referencedTasks('`08-01-live` and `08-01-live`').length,
      expected: 1,
    },
    {
      name: 'reports on the gate date are history',
      actual: gatedReports(['maintenance-audit-2026-08-12.md'], '2026-08-12').length,
      expected: 0,
    },
    {
      name: 'reports after the gate date are checked',
      actual: gatedReports(['maintenance-audit-2026-08-13.md'], '2026-08-12')[0],
      expected: 'maintenance-audit-2026-08-13.md',
    },
    {
      name: 'a file that is not a report is ignored',
      actual: gatedReports(['release-integrity-2026-09-01.md'], '2026-08-12').length,
      expected: 0,
    },
    {
      name: 'a report naming a real task passes',
      actual: findMissingTasks(['r.md'], slugs, () => 'see `08-01-live`').length,
      expected: 0,
    },
    {
      name: 'a report naming a task that does not exist fails',
      actual: findMissingTasks(['r.md'], slugs, () => 'see `07-26-install-launch-v2-4-13-beta-23`')[0]
        ?.slug,
      expected: '07-26-install-launch-v2-4-13-beta-23',
    },
    {
      // The defect this exists for, in its original form: three named tasks, one of which is gone.
      name: 'one bad reference among good ones is still caught',
      actual: findMissingTasks(
        ['r.md'],
        slugs,
        () => '`08-01-live`, `07-28-done`, `07-26-install-launch-v2-4-13-beta-23`',
      ).length,
      expected: 1,
    },
  ]

  let failed = 0
  for (const testCase of cases) {
    const ok = Object.is(testCase.actual, testCase.expected)
    if (!ok) {
      failed += 1
      console.error(`  ✗ ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-audit-report-claims --self-test: ${cases.length} cases passed`
      : `check-audit-report-claims --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)
else process.exit(main())
