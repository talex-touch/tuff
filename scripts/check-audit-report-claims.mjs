#!/usr/bin/env node
/**
 * Fails when a maintenance-audit report names a historical task that does not exist.
 *
 * The reports are written by hand, one per day, and #1107 was filed because a bullet was being
 * carried forward instead of re-derived: the same sentence about `DB_SEARCH_SPLIT_ENABLED`
 * appeared in eight consecutive reports, still describing a default that had been inverted three
 * days earlier.
 *
 * The 2026-08-12 report gave a worse example. Its task-records bullet named
 * `07-26-install-launch-v2-4-13-beta-23` as an in-progress task missing metadata. No such task was
 * in the committed record -- not active, not archived, nowhere. Two of the other three tasks it
 * named were wrong in different ways (one archived and completed, one with all three fields
 * present and updated the day before), and its count of non-completed tasks was 85 against an
 * actual 53.
 *
 * A report naming a task nobody can open is the cheapest possible signal that its author did not
 * query the record, and it is a lookup to catch. That is all this does. The counts and the prose
 * are not checked -- a check that tried to parse "至少 X 项" out of two languages would fail in ways
 * nobody could act on. (The field-presence half of that bullet was answered by the task-metadata
 * rule docs:verify ran at the time, which reported 0 on the same day.)
 *
 * The task tree those reports describe is retired. Its identities -- every active task, now
 * frozen, and every archived one -- are kept in the retired task registry, read here through the
 * same reader docs:verify validates it with. A missing, malformed or empty registry fails the
 * check rather than passing it: an identity source that lists nothing would let every citation
 * through, which is the silence this check exists to break.
 *
 * Reports dated on or before GATE_FROM are history and are left alone, which is #1107's fourth
 * acceptance criterion: corrections belong in new reports, not in rewritten ones.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseRetiredTaskIndex, RETIRED_TASK_INDEX_PATH } from './lib/retired-task-index.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_DIR = 'docs/engineering/reports'

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
 * A historical task slug as the reports write it: `MM-DD-some-name`, inside backticks.
 *
 * Backticks are required rather than optional. Without them this matches dates, version fragments
 * and issue titles in running prose, and a check that reports a date as a missing task is one
 * nobody will keep.
 */
const TASK_REFERENCE = /`(\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)`/g

/**
 * Every task slug the retired task registry vouches for -- frozen and historical alike -- or the
 * reasons it vouches for nothing.
 *
 * `readText` takes a repository-relative path and returns the file's text or throws. Fails closed:
 * `slugs` is empty whenever `problems` is not, so an unreadable, malformed or empty registry can
 * never be mistaken for one that merely does not list a cited task.
 */
export function registryTaskSlugs(readText) {
  let text
  try {
    text = readText(RETIRED_TASK_INDEX_PATH)
  }
  catch (error) {
    return {
      slugs: new Set(),
      problems: [`${RETIRED_TASK_INDEX_PATH} could not be read (${error instanceof Error ? error.message : String(error)})`],
    }
  }
  const { tasks, issues } = parseRetiredTaskIndex(text)
  if (issues.length > 0)
    return { slugs: new Set(), problems: issues.map(issue => `${RETIRED_TASK_INDEX_PATH}: ${issue.message}`) }
  return { slugs: new Set(tasks.map(task => task.slug)), problems: [] }
}

export function referencedTasks(markdown) {
  return [...new Set([...markdown.matchAll(TASK_REFERENCE)].map(match => match[1]))]
}

/** Where the runtime boolean flags are declared, as `parseEnvBoolean('NAME', true)`. */
const FLAG_SOURCE = 'apps/core-app/src/main/db/runtime-flags.ts'
const FLAG_DECLARATION = /parseEnvBoolean\(\s*'([A-Z][A-Z0-9_]*)'\s*,\s*(true|false)\s*\)/g

/**
 * Phrases asserting a default, in either language, mapped to what they assert.
 *
 * The vocabulary is deliberately the same as `packages/utils/__tests__/split-flag-docs.test.ts`,
 * which owns `docs/` (engineering specs included) and *excludes* `docs/engineering/reports/` on
 * the grounds that a dated report records what was true on its date and rewriting it falsifies the
 * record.
 * That exclusion is right, and it is also the hole #1107 is about: the reports written *after* the
 * flip carried the stale claim forward. This closes it from the other side -- only reports dated
 * after GATE_FROM are read, so history stays untouched and the next report has to be re-derived.
 */
const DEFAULT_CLAIMS = [
  { pattern: /默认\s*\*{0,2}(?:关闭|off)/i, asserts: false },
  { pattern: /defaults?\s+\*{0,2}off/i, asserts: false },
  { pattern: /default[- ]off/i, asserts: false },
  // `\b` only on the ASCII `on`, which needs it so `only` does not match. Putting it after a CJK
  // alternation instead silently disables that branch -- `启` is not a `\w` character, so there is
  // no boundary between it and the end of a line, and `默认开启` never matched. The "correct claim
  // passes" cases went green on a pattern that could not fire; the inverted case is what caught it.
  { pattern: /默认\s*\*{0,2}(?:开启|启用)/, asserts: true },
  { pattern: /默认\s*\*{0,2}on\b/i, asserts: true },
  { pattern: /defaults?\s+\*{0,2}on\b/i, asserts: true },
  { pattern: /default[- ]on\b/i, asserts: true },
]

export function parseFlagDefaults(source) {
  const defaults = new Map()
  for (const match of source.matchAll(FLAG_DECLARATION))
    defaults.set(match[1], match[2] === 'true')
  return defaults
}

/**
 * A report line naming a flag and asserting a default that the source contradicts.
 *
 * Line granularity, because these reports are one finding per bullet and the bullet that started
 * #1107 carried both on the same line. A wider window would pair a flag in one bullet with a
 * default claim in the next.
 *
 * The declared name is `TUFF_X`; reports also write the exported constant `X`. Both are matched, so
 * `DB_SEARCH_SPLIT_ENABLED / TUFF_DB_SEARCH_SPLIT_ENABLED 默认关闭` is caught either way.
 */
export function findFlagClaims(reports, flagDefaults, readReport) {
  const wrong = []
  for (const report of reports) {
    const lines = readReport(report).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      for (const [flag, actual] of flagDefaults) {
        const short = flag.startsWith('TUFF_') ? flag.slice(5) : flag
        if (!line.includes(flag) && !line.includes(short))
          continue
        const hits = DEFAULT_CLAIMS.filter(claim => claim.pattern.test(line))
        if (hits.length === 0)
          continue
        // A line may quote the stale wording while stating the truth beside it -- the live catch
        // that forced this rule was a finding: "TODO.md 明确…默认开启…PRD 仍称默认关闭". Flagging it
        // would rewrite a correct report. One matching claim proves the author re-derived; only a
        // line whose every claim contradicts the source is a carried falsehood.
        if (hits.some(claim => claim.asserts === actual))
          continue
        for (const claim of hits)
          wrong.push({ report, line: index + 1, flag, claimed: claim.asserts, actual })
      }
    }
  }
  return wrong
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
  const { slugs, problems } = registryTaskSlugs(relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
  if (problems.length > 0) {
    console.error('The retired task registry cannot vouch for any task identity. Refusing to report success:\n')
    for (const problem of problems)
      console.error(`  ${problem}`)
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
    console.error('Maintenance-audit report names a task the retired task registry does not list:\n')
    for (const entry of missing) {
      console.error(`  ${REPORT_DIR}/${entry.report}  ->  ${entry.slug}`)
    }
    console.error(
      `\n${slugs.size} task slugs are listed in ${RETIRED_TASK_INDEX_PATH}, active tasks frozen and`
      + ' archived ones historical. A report that names anything else is describing something nobody'
      + ' can open, which means the claim around it was carried rather than re-derived (#1107).',
    )
    return 1
  }

  const flagSource = path.join(repoRoot, FLAG_SOURCE)
  if (!fs.existsSync(flagSource)) {
    console.error(`${FLAG_SOURCE} is missing; flag defaults cannot be re-derived.`)
    return 1
  }
  const flagDefaults = parseFlagDefaults(fs.readFileSync(flagSource, 'utf8'))
  if (flagDefaults.size === 0) {
    console.error(
      `No parseEnvBoolean declarations found in ${FLAG_SOURCE}. An empty flag map asserts nothing,`
      + ' so this is an error rather than a pass.',
    )
    return 1
  }

  const wrongFlags = findFlagClaims(reports, flagDefaults, readReport)
  if (wrongFlags.length > 0) {
    console.error('Maintenance-audit report states a flag default the source contradicts:\n')
    for (const entry of wrongFlags) {
      console.error(
        `  ${REPORT_DIR}/${entry.report}:${entry.line}  ->  ${entry.flag} `
        + `claimed default ${entry.claimed ? 'on' : 'off'}, actually ${entry.actual ? 'on' : 'off'}`,
      )
    }
    console.error(
      `\nRe-derived from ${FLAG_SOURCE}. #1107 exists because one such sentence appeared in eight`
      + ' consecutive reports, three days after the default was inverted -- carried forward rather'
      + ' than re-checked. Reports dated on or before the gate are history and are not read.',
    )
    return 1
  }

  const checked = reports.reduce((total, report) => total + referencedTasks(readReport(report)).length, 0)
  console.log(
    `check-audit-report-claims: ${checked} task reference(s) across ${reports.length} report(s) `
    + `all resolve; ${slugs.size} slugs known; ${flagDefaults.size} flag default(s) re-derived.`,
  )
  return 0
}

function selfTest() {
  // Registry half. A reader that only answers for the registry path, the way the repository does.
  const entry = (slug, sourcePath, disposition) => ({
    slug,
    id: slug.slice(6),
    title: `Task ${slug}`,
    status: disposition === 'frozen' ? 'in_progress' : 'completed',
    disposition,
    sourcePath,
  })
  const live = entry('08-01-live', '.trellis/tasks/08-01-live/task.json', 'frozen')
  const done = entry('07-28-done', '.trellis/tasks/archive/2026-07/07-28-done/task.json', 'historical')
  const registry = tasks => JSON.stringify({ schemaVersion: 1, baselineCommit: 'cfda0a6cd1a13b5606c82d7d9d68112177d3fc9d', tasks })
  const reader = text => (relative) => {
    if (relative !== RETIRED_TASK_INDEX_PATH)
      throw new Error(`ENOENT: no such file, open '${relative}'`)
    return text
  }
  const known = registryTaskSlugs(reader(registry([live, done])))
  const slugs = known.slugs
  // "0/true" is the only acceptable answer from a source that cannot be trusted: nothing vouched
  // for, and a reason to refuse success.
  const vouches = (readText) => {
    const result = registryTaskSlugs(readText)
    return `${result.slugs.size}/${result.problems.length > 0}`
  }

  const cases = [
    { name: 'a frozen task from the registry is known', actual: slugs.has('08-01-live'), expected: true },
    { name: 'a historical task from the registry is known too', actual: slugs.has('07-28-done'), expected: true },
    { name: 'a well-formed registry raises no problem', actual: known.problems.length, expected: 0 },
    {
      name: 'a missing registry vouches for nothing and is a problem',
      actual: vouches(() => {
        throw new Error('ENOENT')
      }),
      expected: '0/true',
    },
    { name: 'a registry that is not JSON vouches for nothing', actual: vouches(reader('{ "tasks": [')), expected: '0/true' },
    { name: 'an empty registry vouches for nothing', actual: vouches(reader(registry([]))), expected: '0/true' },
    {
      // Fail closed, not fail partial: the broken half is exactly what was supposed to vouch.
      name: 'one malformed entry voids the whole registry, valid entries included',
      actual: vouches(reader(registry([live, { ...done, title: '' }]))),
      expected: '0/true',
    },
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

  // Flag-default half. The real declaration shape, plus a decoy that is not one.
  const flagSource = [
    'export const DB_AUX_ENABLED = parseEnvBoolean(\'TUFF_DB_AUX_ENABLED\', true)',
    'export const DB_SEARCH_SPLIT_ENABLED = parseEnvBoolean(\'TUFF_DB_SEARCH_SPLIT_ENABLED\', true)',
    'export const LEGACY = parseEnvBoolean(\'TUFF_LEGACY\', false)',
    'function parseEnvBoolean(name: string, defaultValue: boolean): boolean {',
  ].join('\n')
  const flags = parseFlagDefaults(flagSource)
  const claim = text => findFlagClaims(['r.md'], flags, () => text)

  cases.push(
    { name: 'a default-on flag is parsed', actual: flags.get('TUFF_DB_SEARCH_SPLIT_ENABLED'), expected: true },
    { name: 'a default-off flag is parsed', actual: flags.get('TUFF_LEGACY'), expected: false },
    { name: 'the helper signature is not a declaration', actual: flags.has('name'), expected: false },
    // The sentence from #1107, verbatim in shape: eight reports carried it after the flip.
    { name: 'the bullet that started #1107 is caught', actual: claim('- `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭，但环境变量仍可启用').length, expected: 1 },
    { name: 'the exported short name alone is enough', actual: claim('`DB_SEARCH_SPLIT_ENABLED` 默认关闭').length, expected: 1 },
    { name: 'the English spelling is caught', actual: claim('`TUFF_DB_SEARCH_SPLIT_ENABLED` defaults off today').length, expected: 1 },
    { name: 'a hyphenated default-off is caught', actual: claim('TUFF_DB_SEARCH_SPLIT_ENABLED is a default-off safety gate').length, expected: 1 },
    { name: 'bold markup between the words is caught', actual: claim('TUFF_DB_SEARCH_SPLIT_ENABLED 默认**关闭**').length, expected: 1 },
    { name: 'the correct claim passes', actual: claim('`TUFF_DB_SEARCH_SPLIT_ENABLED` 默认开启').length, expected: 0 },
    { name: 'the correct English claim passes', actual: claim('TUFF_DB_SEARCH_SPLIT_ENABLED defaults on').length, expected: 0 },
    { name: 'a genuinely default-off flag described as off passes', actual: claim('`TUFF_LEGACY` 默认关闭').length, expected: 0 },
    { name: 'that same flag described as on is caught', actual: claim('`TUFF_LEGACY` 默认开启').length, expected: 1 },
    { name: 'a flag with no default claim is left alone', actual: claim('`TUFF_DB_SEARCH_SPLIT_ENABLED` still needs writer ownership').length, expected: 0 },
    { name: 'a default claim with no flag is left alone', actual: claim('the search split 默认关闭').length, expected: 0 },
    // Line granularity: a flag in one bullet must not pair with a claim in the next.
    { name: 'a claim on a different line does not pair', actual: claim('- `TUFF_LEGACY` needs work\n- something else 默认开启').length, expected: 0 },
    // The quoting-a-finding shape, from the first live catch: correct assertion + quoted stale
    // wording on one line must pass, while a line carrying only the stale wording still fails.
    { name: 'quoting the stale claim beside the truth passes', actual: claim('`TUFF_DB_SEARCH_SPLIT_ENABLED` 默认开启;某记录仍写默认关闭').length, expected: 0 },
    { name: 'the stale claim alone still fails', actual: claim('某记录说 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭').length, expected: 1 },
    { name: 'the line number is reported', actual: claim('x\n`TUFF_LEGACY` 默认开启')[0]?.line, expected: 2 },
    { name: 'what was claimed and what is true are both reported', actual: `${claim('`TUFF_LEGACY` 默认开启')[0]?.claimed}/${claim('`TUFF_LEGACY` 默认开启')[0]?.actual}`, expected: 'true/false' },
    { name: 'an empty source yields an empty map', actual: parseFlagDefaults('nothing here').size, expected: 0 },
  )

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
