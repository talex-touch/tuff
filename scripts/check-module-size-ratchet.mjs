#!/usr/bin/env node
/**
 * Stops the two coordination hotspots in #339 from growing while they are being split.
 *
 * What this measures is not what #339 is about. That issue says so in its own words -- "the
 * concern is not line count by itself" -- and it is right: the problem is that each file combines
 * lifecycle, permission policy, execution dispatch, state, transport and diagnostics, and no line
 * count can see that.
 *
 * It is here because line count is the only thing that would have caught what actually happened.
 * `plugin.ts` was ~3,060 lines when #339 was filed. Three extraction PRs landed -- #1678, #1680,
 * #1681 -- and each reported real progress: 4,069 to 3,947 to 3,872 to 3,844. Every one of those
 * numbers is true and every one is measured against the previous PR, from a baseline that had
 * already grown a thousand lines since the issue was written. Extraction removed 225 lines over the
 * same period that accretion added 1,009, and nothing said so.
 *
 * So: a ceiling that may fall and may not rise.
 *
 * "May not rise" is enforced against the PR base revision, not against the working tree. Checking
 * only the current values would let one commit raise a ceiling and add code under it -- a ratchet
 * that unscrews, which CodeRabbit found in the first version of this file. The ceilings live in
 * `.github/module-size-ratchet.json` so reading the base copy is a `git show` and a `JSON.parse`
 * rather than a regex over source.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RATCHET_FILE = '.github/module-size-ratchet.json'

/**
 * The slack a ceiling may carry before it counts as stale.
 *
 * Zero would fail the build on every deletion until the ceiling moved in the same commit, which
 * makes removing code annoying enough that people stop. 50 lets the smallest extraction so far
 * (27 lines, #1681) land without a ceiling edit and forces one after a real reduction -- the other
 * two were 122 and 75.
 */
export const CEILING_SLACK = 50

/**
 * Lines in `text`, counting a final line with no newline after it.
 *
 * Deliberately not `wc -l`, which counts newline characters and reports `'a\nb'` as 1. A file whose
 * last line lacks a newline would be measured one short, and its ceiling would then be one tighter
 * than the number anyone reading the file arrives at.
 */
export function countLines(text) {
  if (text === '')
    return 0
  const lines = text.split('\n')
  return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

/** Every ceiling in `entries` higher than the same file's ceiling in `baseEntries`. */
export function findRaisedCeilings(entries, baseEntries) {
  const base = new Map(baseEntries.map(entry => [entry.file, entry.ceiling]))
  const raised = []
  for (const entry of entries) {
    const previous = base.get(entry.file)
    // Absent from the base means the entry is new, which is how a file joins the ratchet.
    if (previous !== undefined && entry.ceiling > previous)
      raised.push({ file: entry.file, from: previous, to: entry.ceiling })
  }
  return raised
}

export function evaluate(entries, read) {
  const problems = []
  for (const entry of entries) {
    const text = read(entry.file)
    if (text === null) {
      problems.push(`${entry.file} does not exist — remove it from the ratchet or fix the path`)
      continue
    }
    const lines = countLines(text)
    if (lines > entry.ceiling) {
      problems.push(
        `${entry.file} is ${lines} lines, ceiling ${entry.ceiling} (${entry.issue}). `
        + 'This file may shrink, not grow. Put the new code in one of the modules beside it.',
      )
    }
    else if (lines < entry.ceiling - CEILING_SLACK) {
      problems.push(
        `${entry.file} is ${lines} lines against a ceiling of ${entry.ceiling} — lower the ceiling `
        + `to ${lines} in ${RATCHET_FILE}. A ratchet nobody tightens is a comment.`,
      )
    }
  }
  return problems
}

function readOrNull(file) {
  const absolute = path.join(repoRoot, file)
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null
}

/**
 * The ratchet file as it stands in the revision this branch is based on, or null when there is
 * none to compare against -- a shallow clone, or a checkout with no origin.
 */
export function readBaseRatchet(runGit) {
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/master'
  try {
    const mergeBase = runGit(['merge-base', 'HEAD', baseRef]).trim()
    return JSON.parse(runGit(['show', `${mergeBase}:${RATCHET_FILE}`]))
  }
  catch {
    return null
  }
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function main() {
  const ratchet = JSON.parse(readOrNull(RATCHET_FILE) ?? 'null')
  const entries = Array.isArray(ratchet?.files) ? ratchet.files : []
  if (entries.length === 0) {
    console.error(`${RATCHET_FILE} lists no files, so this check cannot fail. That is not a pass.`)
    return 1
  }

  const problems = evaluate(entries, readOrNull)
  const base = readBaseRatchet(git)
  if (base === null) {
    // Said out loud rather than passed over: on CI the base is always there, so this line appearing
    // in a CI log means the raise check silently did not run.
    console.log(`  (no base revision of ${RATCHET_FILE} reachable — ceiling raises not checked)`)
  }
  else {
    for (const raised of findRaisedCeilings(entries, base.files ?? [])) {
      problems.push(
        `${raised.file} ceiling raised ${raised.from} → ${raised.to}. A ceiling may fall, not rise `
        + '(#339). If the file genuinely has to grow, that is a decision for the issue, not a diff.',
      )
    }
  }

  if (problems.length > 0) {
    console.error('\nModule size ratchet:\n')
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    console.error('')
    return 1
  }
  for (const entry of entries)
    console.log(`  ${entry.file}: ${countLines(readOrNull(entry.file) ?? '')} / ${entry.ceiling}`)

  console.log(`\n[32m${entries.length} file(s) within their ceiling.[0m\n`)
  return 0
}

function selfTest() {
  const entries = [{ file: 'a.ts', ceiling: 100, issue: '#339', note: 'n' }]
  const at = read => evaluate(entries, read)
  const real = JSON.parse(readOrNull(RATCHET_FILE) ?? 'null')

  const cases = [
    { name: 'a file at its ceiling passes', actual: at(() => 'x\n'.repeat(100)).length, expected: 0 },
    { name: 'one line over fails', actual: at(() => 'x\n'.repeat(101)).length, expected: 1 },
    {
      name: 'a little under passes, so deleting code does not need a ceiling edit',
      actual: at(() => 'x\n'.repeat(100 - CEILING_SLACK)).length,
      expected: 0,
    },
    {
      name: 'well under fails, so a ceiling cannot drift into meaninglessness',
      actual: at(() => 'x\n'.repeat(100 - CEILING_SLACK - 1)).length,
      expected: 1,
    },
    {
      name: 'a missing file fails rather than counting as zero lines',
      actual: at(() => null)[0]?.includes('does not exist'),
      expected: true,
    },
    /*
     * The hole in the first version of this file: with no base comparison, a PR raises the ceiling
     * by 51 and adds a line, and every check above still passes.
     */
    {
      name: 'raising a ceiling is caught',
      actual: findRaisedCeilings([{ file: 'a.ts', ceiling: 151 }], [{ file: 'a.ts', ceiling: 100 }])[0]?.to,
      expected: 151,
    },
    {
      name: 'lowering a ceiling is not caught',
      actual: findRaisedCeilings([{ file: 'a.ts', ceiling: 90 }], [{ file: 'a.ts', ceiling: 100 }]).length,
      expected: 0,
    },
    {
      name: 'an unchanged ceiling is not caught',
      actual: findRaisedCeilings(entries, [{ file: 'a.ts', ceiling: 100 }]).length,
      expected: 0,
    },
    {
      name: 'a file new to the ratchet is not a raise',
      actual: findRaisedCeilings([{ file: 'b.ts', ceiling: 999 }], [{ file: 'a.ts', ceiling: 100 }]).length,
      expected: 0,
    },
    {
      name: 'an unreachable base reads as unknown, not as no raises',
      actual: readBaseRatchet(() => {
        throw new Error('no such ref')
      }),
      expected: null,
    },
    { name: 'a file with no trailing newline still counts its last line', actual: countLines('a\nb'), expected: 2 },
    { name: 'a trailing newline is not an extra line', actual: countLines('a\nb\n'), expected: 2 },
    { name: 'an empty file is zero lines', actual: countLines(''), expected: 0 },
    {
      name: 'the real entries point at files that exist',
      actual: (real?.files ?? []).filter(entry => readOrNull(entry.file) === null).length,
      expected: 0,
    },
    { name: 'the real ratchet is not empty', actual: (real?.files ?? []).length > 0, expected: true },
  ]

  let failed = 0
  for (const testCase of cases) {
    if (!Object.is(testCase.actual, testCase.expected)) {
      failed += 1
      console.error(`  ✗ ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-module-size-ratchet --self-test: ${cases.length} cases passed`
      : `check-module-size-ratchet --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)
else process.exit(main())
