#!/usr/bin/env node
/**
 * Fails when a PR body says it does *not* resolve an issue using a phrase that resolves it anyway.
 *
 * GitHub's closing-keyword parser is a regex over `keyword #N`. It has no idea what the words before
 * the keyword mean, so `It does not fix #213` marks #213 for closing exactly as `Fixes #213` does.
 *
 * This is not hypothetical. On 2026-08-13 it happened twice within an hour, in this repository, to
 * two separate user-facing issues:
 *
 *   PR #1736 -> "It does not fix #213."          -> #213 closed as COMPLETED after nine months open
 *   PR #1737 -> "This does not close #308."      -> #308 closed as COMPLETED
 *
 * Both sentences were written specifically to stop a reader mistaking instrumentation for a fix.
 * Both produced the mistake they were guarding against, and both went unnoticed until the count of
 * closed issues was compared against the PRs that carried a deliberate closing keyword. The second
 * one happened after the first was already understood and written down, which is the argument for a
 * check rather than a note: knowing about this trap does not stop you falling into it, because the
 * sentence reads correctly to a human right up until it is merged.
 *
 * Scope is deliberately narrow. A plain `Fixes #N` is left alone -- that is the feature. Only the
 * negated form is reported, because only the negated form means the opposite of what it does.
 */
import fs from 'node:fs'
import process from 'node:process'

/** GitHub's own list, all inflections. */
const KEYWORD = 'close[sd]?|fix(?:e[sd])?|resolve[sd]?'

/**
 * A negation close enough to the keyword to invert it.
 *
 * The window is the interesting part. `does not fix #1` and `will never close #2` both need to
 * match, and `fixes the parser. Does not touch #3` must not -- so the negation has to be within a
 * couple of words and, critically, not across a sentence boundary. `[^.!?\n]` enforces that: a full
 * stop between the negation and the keyword means they belong to different claims.
 */
const NEGATED_CLOSER = new RegExp(
  // `n't` carries no leading \b: it lives inside "doesn't", where the boundary never holds. The
  // first version had one and the contraction — the most natural way to write this mistake — was
  // the one form the check could not see.
  // `{1,24}` and not `{0,24}`: a zero-width gap followed by `\b` is a contradiction, since the
  // negation already ends on a word boundary. eslint's regexp/no-contradiction-with-assertion
  // catches it, and it is right — there is always at least a space between "not" and "fix".
  String.raw`(?:\b(?:not|never|without|neither|nor|no)\b|n't)[^.!?\n]{1,24}?\b(?:${KEYWORD})\s+#(\d+)`,
  'gi',
)

/** Any closing keyword, negated or not -- used to report what the body does claim. */
const ANY_CLOSER = new RegExp(String.raw`\b(?:${KEYWORD})\s+#(\d+)`, 'gi')

/**
 * Fenced code and inline code are quoted text, not claims.
 *
 * GitHub does not parse closing keywords inside code spans, so reporting them would be a false
 * positive -- and a check that fires on a quoted example is one people disable.
 */
export function stripCode(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
}

export function findNegatedClosers(markdown) {
  const text = stripCode(markdown)
  const found = []
  for (const match of text.matchAll(NEGATED_CLOSER)) {
    found.push({
      issue: Number(match[1]),
      phrase: match[0].replace(/\s+/g, ' ').trim(),
    })
  }
  return found
}

export function findAllClosers(markdown) {
  return [...new Set(
    [...stripCode(markdown).matchAll(ANY_CLOSER)].map(match => Number(match[1])),
  )]
}

function main(argv) {
  const source = argv[0]
  const body = source === '-' || !source
    ? fs.readFileSync(0, 'utf8')
    : fs.existsSync(source)
      ? fs.readFileSync(source, 'utf8')
      : source

  const negated = findNegatedClosers(body)
  if (negated.length === 0) {
    const all = findAllClosers(body)
    console.log(
      all.length > 0
        ? `check-closing-keywords: ${all.length} closing keyword(s) — #${all.join(', #')} — none negated.`
        : 'check-closing-keywords: no closing keywords in this body.',
    )
    return 0
  }

  console.error('A closing keyword is negated. GitHub will close the issue anyway:\n')
  for (const entry of negated)
    console.error(`  #${entry.issue}  <-  "${entry.phrase}"`)
  console.error(
    '\nGitHub matches `keyword #N` and ignores the words before it, so this sentence marks the'
    + ' issue for closing while telling the reader the opposite. It has already happened twice here'
    + ' — #213 via "does not fix", #308 via "does not close" — both to issues that were not fixed.'
    + '\n\nWrite `#N is still open`, `see #N`, or `Refs #N` instead.',
  )
  return 1
}

function selfTest() {
  const negated = body => findNegatedClosers(body)

  const cases = [
    // The two real ones, verbatim.
    { name: 'the #213 sentence is caught', actual: negated('It does not fix #213.')[0]?.issue, expected: 213 },
    { name: 'the #308 sentence is caught', actual: negated('This does not close #308.')[0]?.issue, expected: 308 },
    { name: 'a deliberate closer is left alone', actual: negated('Fixes #42').length, expected: 0 },
    { name: 'a deliberate closer at the end is left alone', actual: negated('Some prose.\n\nCloses #42').length, expected: 0 },
    { name: 'n\'t is a negation', actual: negated('doesn\'t close #7')[0]?.issue, expected: 7 },
    { name: 'never is a negation', actual: negated('will never resolve #8')[0]?.issue, expected: 8 },
    // `fixing` is not on GitHub's list — only fix/fixes/fixed — so `without fixing #9` never closed
    // anything, and the first version of this case asserted a trap that does not exist.
    { name: 'without is a negation', actual: negated('shipped without fixes #9')[0]?.issue, expected: 9 },
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
    // Quoted text is not a claim; GitHub does not parse it either.
    { name: 'a fenced block is ignored', actual: negated('```\ndoes not fix #16\n```').length, expected: 0 },
    { name: 'an inline code span is ignored', actual: negated('write `does not fix #17` instead').length, expected: 0 },
    { name: 'prose after a fenced block is still read', actual: negated('```\ncode\n```\ndoes not fix #18')[0]?.issue, expected: 18 },
    { name: 'the offending phrase is reported', actual: negated('It does not fix #19.')[0]?.phrase, expected: 'not fix #19' },
    { name: 'two offenders are both reported', actual: negated('does not fix #20 and does not close #21').length, expected: 2 },
    { name: 'an empty body is fine', actual: negated('').length, expected: 0 },
    { name: 'a null body does not throw', actual: negated(null).length, expected: 0 },
    { name: 'an issue mention with no keyword is fine', actual: negated('this does not affect #22').length, expected: 0 },
    { name: 'findAllClosers sees deliberate ones', actual: findAllClosers('Fixes #30 and closes #31').join(','), expected: '30,31' },
    { name: 'findAllClosers dedupes', actual: findAllClosers('Fixes #30, closes #30').length, expected: 1 },
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

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)
else process.exit(main(process.argv.slice(2)))
