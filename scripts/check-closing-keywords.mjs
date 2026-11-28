#!/usr/bin/env node
/**
 * Fails when a PR body, PR title, or constituent commit message contains an accidental GitHub
 * closing keyword that would close an issue on merge without the author intending it.
 *
 * GitHub's closing-keyword parser matches `keyword #N` regardless of surrounding prose or negation:
 *
 *   PR #1736 -> PR body: "It does not fix #213."        -> #213 closed as COMPLETED
 *   PR #1737 -> PR body: "This does not close #308."    -> #308 closed as COMPLETED
 *   PR #1772 -> commit body (6448f5f9c):
 *               `the body said "This does not close #1748", and GitHub matches ...`
 *               -> squash-merge concatenated commit bodies and closed #1748 (#1792)
 *
 * Rules by surface:
 * - PR body (Markdown): GitHub ignores fenced code blocks and inline backtick spans, and authors
 *   legitimately write deliberate `Fixes #N` statements in prose or trailers. Fail on negated
 *   closers (`does not fix #N`, `never closes #N`, `doesn't resolve #N`) and quoted closers
 *   (`"close #N"`, `'fixes #N'`, `“resolves #N”`) outside code spans.
 * - PR title & constituent commit messages (plain text): GitHub parses the composed squash-merge
 *   commit message (PR title + concatenated commit bodies) as plain text — backticks and fences
 *   do NOT protect against closing keywords there. Only unambiguous standalone closing-trailer
 *   lines (`Fixes #123`, `Closes: #123, #124`, `Closes #1. Closes #2.`) are allowed; any negated,
 *   quoted, backticked, or prose-embedded `close|fix|resolve #N` fails with the offending line
 *   quoted in the output.
 */
import { execFileSync } from 'node:child_process'
import fs, { realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** GitHub's own closing-keyword list, all inflections. */
const KEYWORD = 'close[sd]?|fix(?:e[sd])?|resolve[sd]?'

/**
 * A negation close enough to the keyword to invert it without crossing a sentence boundary.
 *
 * `n't` carries no leading `\b` because it lives inside contractions like `doesn't`.
 * `{1,24}?` (not `{0,24}?`) keeps the gap non-empty before `\b` (eslint regexp rule).
 */
const NEGATED_CLOSER = new RegExp(
  String.raw`(?:\b(?:not|never|without|neither|nor|no)\b|n't)[^.!?\n]{1,24}?\b(?:${KEYWORD}):?\s+#(\d+)`,
  'gi',
)

/** Any closing keyword, negated or not. */
const ANY_CLOSER = new RegExp(String.raw`\b(?:${KEYWORD}):?\s+#(\d+)`, 'gi')

/**
 * Unambiguous standalone GitHub closing-trailer line in a commit message:
 *   Fixes #42
 *   Closes: #1792
 *   Closes #487 #491 #503 #502
 *   Closes #889. Closes #734.
 *   Fixes #1, #2, and #3
 *
 * Deliberately rejects bullets (`- close #1`), quotes (`"close #1"`), backticks, and prose.
 */
const STANDALONE_CLOSER_TRAILER = new RegExp(
  String.raw`^[ \t]*(?:${KEYWORD}):?\s+#\d+(?:(?:[ \t]*[,;.](?:[ \t]+and)?\s*|\s+and\s+|\s+)(?:(?:${KEYWORD}):?\s+)?#\d+)*\.?[ \t]*$`,
  'i',
)

/** Quotation spans on a single line for Markdown PR bodies (backticks already stripped). */
const BODY_QUOTED_SPAN = /"[^"\n]+"|“[^”\n]+”|‘[^’\n]+’|\B'[^'\n]+'\B/g

/** Quotation and backtick spans on a single line for plain-text commit messages. */
const COMMIT_QUOTED_SPAN = /"[^"\n]+"|“[^”\n]+”|‘[^’\n]+’|`[^`\n]+`|\B'[^'\n]+'\B/g

/**
 * Fenced code and inline code are quoted text in Markdown PR bodies, where GitHub ignores them.
 * Replaces stripped characters with spaces while preserving newlines so line numbers stay exact.
 */
export function stripCode(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, block => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, span => ' '.repeat(span.length))
}

export function findNegatedClosers(markdown) {
  const rawLines = String(markdown ?? '').split(/\r?\n/)
  const strippedLines = stripCode(markdown).split(/\r?\n/)
  const found = []
  strippedLines.forEach((line, index) => {
    for (const match of line.matchAll(NEGATED_CLOSER)) {
      found.push({
        issue: Number(match[1]),
        phrase: match[0].replace(/\s+/g, ' ').trim(),
        line: (rawLines[index] ?? line).trim(),
        lineNumber: index + 1,
        reason: 'negated',
      })
    }
  })
  return found
}

export function findQuotedClosers(markdown) {
  const rawLines = String(markdown ?? '').split(/\r?\n/)
  const strippedLines = stripCode(markdown).split(/\r?\n/)
  const found = []
  strippedLines.forEach((line, index) => {
    for (const quoteMatch of line.matchAll(BODY_QUOTED_SPAN)) {
      const span = quoteMatch[0]
      for (const closerMatch of span.matchAll(ANY_CLOSER)) {
        found.push({
          issue: Number(closerMatch[1]),
          phrase: span.replace(/\s+/g, ' ').trim(),
          line: (rawLines[index] ?? line).trim(),
          lineNumber: index + 1,
          reason: 'quoted',
        })
      }
    }
  })
  return found
}

export function findAccidentalBodyClosers(markdown, source = 'PR body') {
  const negated = findNegatedClosers(markdown)
  const quoted = findQuotedClosers(markdown)
  const seen = new Set()
  const found = []

  for (const entry of [...negated, ...quoted]) {
    const key = `${entry.lineNumber}:${entry.issue}`
    if (seen.has(key))
      continue
    seen.add(key)
    found.push({ source, ...entry })
  }
  return found
}

export function isStandaloneCloserTrailer(line) {
  return STANDALONE_CLOSER_TRAILER.test(String(line ?? ''))
}

/**
 * Inspects a plain-text commit message or PR title.
 *
 * Unlike Markdown PR bodies, GitHub parses closing keywords in commit messages even inside
 * backticks or code blocks. Any closing keyword outside an unambiguous standalone trailer line
 * (whether negated, quoted, backticked, or bare in prose) is reported with its exact line.
 */
export function findAccidentalCommitClosers(message, source = 'commit') {
  const lines = String(message ?? '').split(/\r?\n/)
  const found = []
  let inFence = false

  lines.forEach((rawLine, index) => {
    if (/^[ \t]*```/.test(rawLine)) {
      inFence = !inFence
      return
    }

    const matches = [...rawLine.matchAll(ANY_CLOSER)]
    if (matches.length === 0)
      return
    if (!inFence && isStandaloneCloserTrailer(rawLine))
      return

    const negatedByIssue = new Map()
    for (const negMatch of rawLine.matchAll(NEGATED_CLOSER)) {
      const issue = Number(negMatch[1])
      if (!negatedByIssue.has(issue))
        negatedByIssue.set(issue, negMatch[0].replace(/\s+/g, ' ').trim())
    }

    const quotedRanges = [...rawLine.matchAll(COMMIT_QUOTED_SPAN)].map(match => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      text: match[0].replace(/\s+/g, ' ').trim(),
    }))

    const seenOnLine = new Set()
    for (const match of matches) {
      const issue = Number(match[1])
      if (seenOnLine.has(issue))
        continue
      seenOnLine.add(issue)

      const start = match.index ?? 0
      const end = start + match[0].length
      const enclosingQuote = quotedRanges.find(range => start >= range.start && end <= range.end)
      const negatedPhrase = negatedByIssue.get(issue)

      let reason = inFence ? 'quoted' : 'prose'
      let phrase = match[0].replace(/\s+/g, ' ').trim()
      if (negatedPhrase) {
        reason = 'negated'
        phrase = negatedPhrase
      }
      else if (enclosingQuote) {
        reason = 'quoted'
        phrase = enclosingQuote.text
      }

      found.push({
        source,
        issue,
        phrase,
        line: rawLine.trim(),
        lineNumber: index + 1,
        reason,
      })
    }
  })

  return found
}

export function findAllClosers(markdown, { plainText = false } = {}) {
  const text = plainText ? String(markdown ?? '') : stripCode(markdown)
  return [...new Set([...text.matchAll(ANY_CLOSER)].map(match => Number(match[1])))]
}

/**
 * Reads constituent commits from a git revision range (e.g. `base..head`).
 * Fails loudly if git cannot resolve the range so a shallow clone never passes vacuously.
 */
export function readCommitsFromRange(range, { cwd } = {}) {
  if (!range || !String(range).trim())
    throw new Error('Empty commit range passed to --commits')

  let raw
  try {
    raw = execFileSync('git', ['log', '--format=%H%x1f%B%x1e', range], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : error?.message
    throw new Error(
      `Failed to read commits for range "${range}" (${stderr || 'unknown git error'}). `
      + 'Ensure the workflow checks out with `fetch-depth: 0` so both base and head commits exist.',
    )
  }

  return raw
    .split('\x1E')
    .map(record => record.trim())
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf('\x1F')
      const sha = separator === -1 ? '' : record.slice(0, separator).trim()
      const message = separator === -1 ? record : record.slice(separator + 1)
      return {
        sha,
        shortSha: sha.slice(0, 9),
        message,
      }
    })
}

export function inspectPullRequest({ body, title, commits = [] } = {}) {
  const findings = []
  const deliberateSet = new Set()

  if (body !== undefined) {
    findings.push(...findAccidentalBodyClosers(body, 'PR body'))
    for (const issue of findAllClosers(body))
      deliberateSet.add(issue)
  }

  if (title !== undefined) {
    findings.push(...findAccidentalCommitClosers(title, 'PR title'))
    for (const issue of findAllClosers(title, { plainText: true }))
      deliberateSet.add(issue)
  }

  for (const commit of commits) {
    const label = commit.shortSha
      ? `commit ${commit.shortSha}`
      : commit.sha
        ? `commit ${commit.sha.slice(0, 9)}`
        : 'commit'
    findings.push(...findAccidentalCommitClosers(commit.message, label))
    for (const issue of findAllClosers(commit.message, { plainText: true }))
      deliberateSet.add(issue)
  }

  const findingIssues = new Set(findings.map(entry => entry.issue))
  const deliberateClosers = [...deliberateSet].filter(issue => !findingIssues.has(issue))

  return {
    findings,
    deliberateClosers,
    inspected: {
      hasBody: body !== undefined,
      hasTitle: title !== undefined,
      commitCount: commits.length,
    },
  }
}

function readFileOrLiteral(value) {
  if (value === '-')
    return fs.readFileSync(0, 'utf8')
  if (fs.existsSync(value) && fs.statSync(value).isFile())
    return fs.readFileSync(value, 'utf8')
  return value
}

export function parseArgs(argv) {
  const parsed = {
    selfTest: false,
    bodyArg: undefined,
    titleArg: undefined,
    titleFileArg: undefined,
    commitRange: undefined,
    commitFileArg: undefined,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--self-test') {
      parsed.selfTest = true
    }
    else if (arg === '--body') {
      if (i + 1 >= argv.length)
        throw new Error('--body requires a file path or text argument')
      parsed.bodyArg = argv[++i]
    }
    else if (arg === '--title') {
      if (i + 1 >= argv.length)
        throw new Error('--title requires a text argument')
      parsed.titleArg = argv[++i]
    }
    else if (arg === '--title-file') {
      if (i + 1 >= argv.length)
        throw new Error('--title-file requires a file path')
      parsed.titleFileArg = argv[++i]
    }
    else if (arg === '--commits') {
      if (i + 1 >= argv.length)
        throw new Error('--commits requires a git revision range (e.g. base..head)')
      parsed.commitRange = argv[++i]
    }
    else if (arg === '--commit-file') {
      if (i + 1 >= argv.length)
        throw new Error('--commit-file requires a file path')
      parsed.commitFileArg = argv[++i]
    }
    else if (!parsed.bodyArg) {
      parsed.bodyArg = arg
    }
    else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  return parsed
}

function formatSurfaceSummary(inspected) {
  const parts = []
  if (inspected.hasBody)
    parts.push('PR body')
  if (inspected.hasTitle)
    parts.push('PR title')
  if (inspected.commitCount > 0)
    parts.push(`${inspected.commitCount} commit(s)`)
  return parts.length > 0 ? parts.join(', ') : 'stdin'
}

function main(argv) {
  let options
  try {
    options = parseArgs(argv)
  }
  catch (error) {
    console.error(`check-closing-keywords: ${error.message}`)
    return 2
  }

  if (options.selfTest)
    return selfTest() > 0 ? 1 : 0

  const hasExplicitInput = options.bodyArg !== undefined
    || options.titleArg !== undefined
    || options.titleFileArg !== undefined
    || options.commitRange !== undefined
    || options.commitFileArg !== undefined

  const body = options.bodyArg !== undefined
    ? readFileOrLiteral(options.bodyArg)
    : !hasExplicitInput
        ? fs.readFileSync(0, 'utf8')
        : undefined

  let title
  if (options.titleFileArg !== undefined) {
    if (!fs.existsSync(options.titleFileArg)) {
      console.error(`check-closing-keywords: title file does not exist: ${options.titleFileArg}`)
      return 2
    }
    title = fs.readFileSync(options.titleFileArg, 'utf8')
  }
  else if (options.titleArg !== undefined) {
    title = options.titleArg
  }

  const commits = []
  if (options.commitFileArg !== undefined) {
    if (!fs.existsSync(options.commitFileArg)) {
      console.error(`check-closing-keywords: commit file does not exist: ${options.commitFileArg}`)
      return 2
    }
    commits.push({
      sha: '',
      shortSha: '',
      message: fs.readFileSync(options.commitFileArg, 'utf8'),
    })
  }
  if (options.commitRange !== undefined) {
    try {
      commits.push(...readCommitsFromRange(options.commitRange))
    }
    catch (error) {
      console.error(`check-closing-keywords: ${error.message}`)
      return 2
    }
  }

  const result = inspectPullRequest({ body, title, commits })
  if (result.findings.length === 0) {
    const surfaces = formatSurfaceSummary(result.inspected)
    console.log(
      result.deliberateClosers.length > 0
        ? `check-closing-keywords: inspected ${surfaces} — ${result.deliberateClosers.length} deliberate closing keyword(s) (#${result.deliberateClosers.join(', #')}), none accidental.`
        : `check-closing-keywords: inspected ${surfaces} — no accidental closing keywords.`,
    )
    return 0
  }

  console.error('Accidental closing keyword detected. GitHub will close the issue on merge anyway:\n')
  for (const entry of result.findings) {
    console.error(`  [${entry.source}:${entry.lineNumber}] #${entry.issue} (${entry.reason}) <- "${entry.phrase}"`)
    console.error(`    line: ${entry.line}`)
  }
  console.error(
    '\nGitHub matches `keyword #N` across the PR body AND the composed squash-merge commit message'
    + ' (PR title + concatenated commit bodies, parsed as plain text where even backticks do not'
    + ' escape closing keywords). This has already closed unfixed issues here — #213, #308, and'
    + ' #1748 (via 6448f5f9c / #1772).'
    + '\n\nRewrite prose references to `#N is still open`, `see #N`, or `Refs #N`.'
    + ' Use a standalone trailer line (`Fixes #N` / `Closes #N`) only when intentionally closing #N.',
  )
  return 1
}

/** Verbatim excerpt from 6448f5f9c (squash merge of #1772) that accidentally closed #1748. */
export const REGRESSION_6448F5F9C_BODY = [
  'chore(core-app): give the split topology verifier a script alias',
  '',
  'The `Check for negated closing keywords` step failed this PR, correctly: the body',
  'said "This does not close #1748", and GitHub matches `close #N` while ignoring',
  'the words before it. Rewritten to "#1748 is still open", which the guard accepts.',
].join('\n')

/** Rewritten form of 6448f5f9c's body with no GitHub closing keyword + issue number pair. */
export const REWRITTEN_6448F5F9C_BODY = [
  'chore(core-app): give the split topology verifier a script alias',
  '',
  'The `Check for negated closing keywords` step failed this PR, correctly: the body',
  'used a negated closing keyword against #1748, and GitHub matches `close #N` while ignoring',
  'the words before it. Rewritten to "#1748 is still open", which the guard accepts.',
].join('\n')

function selfTest() {
  const negated = body => findNegatedClosers(body)
  const bodyFindings = body => findAccidentalBodyClosers(body)
  const commitFindings = message => findAccidentalCommitClosers(message, 'commit 6448f5f9c')

  const regressionHits = commitFindings(REGRESSION_6448F5F9C_BODY)
  const bareProseHits = commitFindings('GitHub matched the literal close #1748 inside that explanation.')
  const quotedBodyHits = bodyFindings('The commit body quoted "close #1748" while explaining the bug.')
  const backtickCommitHits = commitFindings('GitHub matches `close #1748` in plain-text commit bodies.')
  const fencedCommitHits = commitFindings('Example:\n```\nclose #1748\n```')

  const cases = [
    // The two original PR-body incidents, verbatim.
    { name: 'the #213 sentence is caught', actual: negated('It does not fix #213.')[0]?.issue, expected: 213 },
    { name: 'the #308 sentence is caught', actual: negated('This does not close #308.')[0]?.issue, expected: 308 },
    { name: 'a deliberate closer is left alone', actual: bodyFindings('Fixes #42').length, expected: 0 },
    { name: 'a deliberate closer at the end is left alone', actual: bodyFindings('Some prose.\n\nCloses #42').length, expected: 0 },
    { name: 'n\'t is a negation', actual: negated('doesn\'t close #7')[0]?.issue, expected: 7 },
    { name: 'never is a negation', actual: negated('will never resolve #8')[0]?.issue, expected: 8 },
    { name: 'without is a negation', actual: negated('shipped without fixes #9')[0]?.issue, expected: 9 },
    { name: 'colon syntax is covered in negations', actual: negated('does not close: #99')[0]?.issue, expected: 99 },
    { name: 'a gerund is not a closing keyword', actual: negated('does not fixing #23').length, expected: 0 },
    { name: 'findAllClosers ignores gerunds too', actual: findAllClosers('closing #32').length, expected: 0 },
    { name: 'every inflection is covered', actual: negated('not closed #1 not fixes #2 not resolved #3').length, expected: 3 },
    { name: 'matching is case-insensitive', actual: negated('Does NOT Fix #10')[0]?.issue, expected: 10 },
    { name: 'a few words between still counts', actual: negated('does not, on its own, fix #11')[0]?.issue, expected: 11 },
    // The window. A negation in a previous sentence is a different claim.
    { name: 'a full stop breaks the pairing', actual: negated('This is not ready. Fixes #12').length, expected: 0 },
    { name: 'a newline breaks the pairing', actual: negated('This is not ready\nFixes #13').length, expected: 0 },
    { name: 'a question mark breaks the pairing', actual: negated('Is this not ready? Fixes #14').length, expected: 0 },
    { name: 'a long gap does not pair', actual: negated(`not ${'x '.repeat(20)} fix #15`).length, expected: 0 },
    // Markdown code spans/fences are ignored by GitHub in PR bodies.
    { name: 'a fenced block is ignored in PR body', actual: bodyFindings('```\ndoes not fix #16\n```').length, expected: 0 },
    { name: 'an inline code span is ignored in PR body', actual: bodyFindings('write `does not fix #17` instead').length, expected: 0 },
    { name: 'prose after a fenced block is still read in PR body', actual: bodyFindings('```\ncode\n```\ndoes not fix #18')[0]?.issue, expected: 18 },
    { name: 'the offending phrase is reported', actual: negated('It does not fix #19.')[0]?.phrase, expected: 'not fix #19' },
    { name: 'two offenders are both reported', actual: negated('does not fix #20 and does not close #21').length, expected: 2 },
    { name: 'an empty body is fine', actual: bodyFindings('').length, expected: 0 },
    { name: 'a null body does not throw', actual: bodyFindings(null).length, expected: 0 },
    { name: 'an issue mention with no keyword is fine', actual: bodyFindings('this does not affect #22').length, expected: 0 },
    { name: 'findAllClosers sees deliberate ones', actual: findAllClosers('Fixes #30 and closes #31').join(','), expected: '30,31' },
    { name: 'findAllClosers dedupes', actual: findAllClosers('Fixes #30, closes #30').length, expected: 1 },
    // Quotation cases in PR bodies (#1792).
    { name: 'double-quoted closer in PR body is caught', actual: quotedBodyHits[0]?.issue, expected: 1748 },
    { name: 'double-quoted closer reports reason=quoted', actual: quotedBodyHits[0]?.reason, expected: 'quoted' },
    { name: 'single-quoted closer in PR body is caught', actual: bodyFindings('explaining \'fixes #1748\' in prose')[0]?.issue, expected: 1748 },
    { name: 'curly-quoted closer in PR body is caught', actual: bodyFindings('quoting “resolves #1748” here')[0]?.issue, expected: 1748 },
    { name: 'possessive apostrophe does not falsely trigger quote guard', actual: bodyFindings('This PR\'s change fixes #42').length, expected: 0 },
    // Commit-message plain-text & squash-merge cases (#1792, 6448f5f9c -> #1748).
    { name: '6448f5f9c verbatim body is caught on #1748', actual: regressionHits[0]?.issue, expected: 1748 },
    { name: '6448f5f9c quotes the exact offending line', actual: regressionHits[0]?.line.includes('said "This does not close #1748"'), expected: true },
    { name: 'rewritten 6448f5f9c body passes cleanly', actual: commitFindings(REWRITTEN_6448F5F9C_BODY).length, expected: 0 },
    { name: 'bare close #N in commit prose fails', actual: bareProseHits[0]?.issue, expected: 1748 },
    { name: 'bare close #N in commit prose reports reason=prose', actual: bareProseHits[0]?.reason, expected: 'prose' },
    { name: 'bare close #N quotes the offending line', actual: bareProseHits[0]?.line, expected: 'GitHub matched the literal close #1748 inside that explanation.' },
    { name: 'backticked closer in commit message is caught (plain text)', actual: backtickCommitHits[0]?.issue, expected: 1748 },
    { name: 'fenced closer in commit message is caught (plain text)', actual: fencedCommitHits[0]?.issue, expected: 1748 },
    { name: 'bulleted closer example in commit message is caught', actual: commitFindings('Examples:\n- close #1748')[0]?.issue, expected: 1748 },
    // Deliberate standalone commit trailers remain allowed.
    { name: 'standalone Fixes #N commit trailer passes', actual: commitFindings('feat(ci): harden guard\n\nFixes #1792').length, expected: 0 },
    { name: 'standalone multi-issue commit trailer passes', actual: commitFindings('feat: batch\n\nCloses #487 #491 #503 #502').length, expected: 0 },
    { name: 'standalone chained-sentence commit trailer passes', actual: commitFindings('chore: retire\n\nCloses #889. Closes #734.').length, expected: 0 },
    { name: 'standalone comma+and commit trailer passes', actual: commitFindings('fix: pair\n\nFixes #1, #2, and #3').length, expected: 0 },
    // PR title checks (line 1 of squash-merge commit).
    { name: 'accidental closer in PR title is caught', actual: inspectPullRequest({ body: 'Clean body.', title: 'fix(ci): stop accidental close #1748' }).findings[0]?.source, expected: 'PR title' },
    { name: 'conventional PR title referencing (#1792) passes', actual: inspectPullRequest({ body: 'Clean body.', title: 'fix(ci): guard commit bodies against closing keywords (#1792)' }).findings.length, expected: 0 },
  ]

  let failed = 0
  for (const testCase of cases) {
    if (!Object.is(testCase.actual, testCase.expected)) {
      failed += 1
      console.error(`  x ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-closing-keywords --self-test: ${cases.length} cases passed`
      : `check-closing-keywords --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

function invokedDirectly() {
  if (!process.argv[1])
    return false
  const self = fileURLToPath(import.meta.url)
  try {
    return realpathSync(process.argv[1]) === realpathSync(self)
  }
  catch {
    return path.resolve(process.argv[1]) === self
  }
}

if (invokedDirectly())
  process.exit(main(process.argv.slice(2)))
