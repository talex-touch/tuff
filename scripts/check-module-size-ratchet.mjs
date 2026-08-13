#!/usr/bin/env node
/**
 * Stops the four files #339 and #343 name from growing while they are being split.
 *
 * What this measures is not what either issue is about, and both say so first: #339 writes "the
 * concern is not line count by itself" and #343 writes "the goal is not arbitrary line-count
 * reduction". Both are right -- the problem is that one file owns lifecycle, permission policy,
 * dispatch, state, transport and diagnostics at once, and no count can see that.
 *
 * It is here because line count is the only thing that would have caught what actually happened.
 * `plugin.ts` was ~3,060 lines when #339 was filed. Three extraction PRs landed -- #1678, #1680,
 * #1681 -- and each reported real progress: 4,069 to 3,947 to 3,872 to 3,844. Every one of those
 * numbers is true and every one is measured against the previous PR, from a baseline that had
 * already grown a thousand lines since the issue was written. Extraction removed 225 lines over the
 * same period that accretion added 1,009, and nothing said so. #343's two files did the same:
 * +377 and +694 against figures that issue quoted correctly.
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
 * Code lines in `text` -- comments and blank lines excluded.
 *
 * The first version counted raw lines, which made this a check against *writing things down*.
 * Measured on the four files it guards, comments and blanks are 10-15% of each; on the growth that
 * put them here it is worse -- of `app-provider.ts`'s +377 since #343 was filed, **+131 is
 * comments**, 35% of the increase. A ceiling on raw lines would have failed the next person who
 * explained a decision in a file whose whole problem is that its decisions are unexplained.
 *
 * Not `wc -l` either, which counts newline characters and reports `'a\nb'` as 1.
 *
 * A character scan rather than a per-line one. The line version got four shapes wrong, all found
 * by CodeRabbit: a one-line block comment with code after it lost that code, a block opened after
 * code mid-line was not seen, a generator method `*gen()` read as a comment continuation, and so
 * did a wrapped expression beginning with `*`. (Those shapes cannot be written literally in this
 * comment -- the first one closes it. The self-test carries them as strings.) Measured on all four guarded files the two agree exactly -- 3249, 2594, 3950,
 * 3703 -- so none of those shapes is present today, and no ceiling moved for this. They would have
 * bitten the first time one appeared, which is reason enough.
 *
 * Quotes are tracked so a `/*` inside a string is not read as a comment.
 */
export function countLines(text) {
  const lines = []
  let current = ''
  let index = 0
  let inBlockComment = false
  let quote = null

  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '\n') {
      lines.push(current)
      current = ''
      index += 1
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 2
      }
      else { index += 1 }
      continue
    }
    if (quote) {
      current += char
      if (char === '\\') {
        current += next ?? ''
        index += 2
        continue
      }
      if (char === quote)
        quote = null
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 2
      continue
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }
    if (char === '"' || char === '\'' || char === '`')
      quote = char

    current += char
    index += 1
  }
  lines.push(current)

  return lines.filter(line => line.trim() !== '').length
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
        `${entry.file} is ${lines} code lines, ceiling ${entry.ceiling} (${entry.issue}). `
        + 'This file may shrink, not grow. Put the new code in one of the modules beside it.',
      )
    }
    else if (lines < entry.ceiling - CEILING_SLACK) {
      problems.push(
        `${entry.file} is ${lines} code lines against a ceiling of ${entry.ceiling} — lower the ceiling `
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
    /*
     * Added when the counter switched from raw lines to code lines. The four files this guards are
     * 10-15% comment, and 35% of app-provider.ts's growth since #343 was filed is comment -- so a
     * raw count made this a check against explaining a decision.
     */
    { name: 'a line comment is not code', actual: countLines('a\n// why\nb'), expected: 2 },
    { name: 'a block comment is not code, however long', actual: countLines('a\n/*\n * why\n */\nb'), expected: 2 },
    { name: 'a one-line block comment is not code', actual: countLines('a\n/* why */\nb'), expected: 2 },
    { name: 'a blank line is not code', actual: countLines('a\n\n\nb'), expected: 2 },
    { name: 'code after a block comment closes is counted again', actual: countLines('/*\n */\nb'), expected: 1 },
    { name: 'a trailing comment on a code line does not remove the line', actual: countLines('a // why'), expected: 1 },
    { name: 'a file that is entirely comment is zero code', actual: countLines('// a\n// b\n'), expected: 0 },
    /* The four shapes the per-line version got wrong. None occurs in the guarded files today. */
    { name: 'code after a closing block comment on the same line still counts', actual: countLines('/* why */ b'), expected: 1 },
    { name: 'a block comment opened after code still ends the comment correctly', actual: countLines('a /*\nmore */\nb'), expected: 2 },
    { name: 'a generator method is code, not a comment continuation', actual: countLines('  *gen() {\n  }'), expected: 2 },
    { name: 'a wrapped expression beginning with * is code', actual: countLines('const x = 1\n  * 2'), expected: 2 },
    { name: 'a block comment inside a string is not a comment', actual: countLines('const s = "/*"\nconst t = 1'), expected: 2 },
    { name: 'an escaped quote does not end the string', actual: countLines('const s = "a\\"/*"\nconst t = 1'), expected: 2 },
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
