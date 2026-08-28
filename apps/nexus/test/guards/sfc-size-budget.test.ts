import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatViolations, loadSources } from './helpers/repo'
import { parseSfc } from './helpers/sfc'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 7 — a very large SFC does not also carry an inline `<style>` block.
 *
 * `governance.vue` was 4023 lines with a 27-line `<style scoped>` at the end.
 * In dev, the separate sub-request Vite makes for that style block resolved
 * against a misaligned descriptor slice: PostCSS reported `Unknown word
 * TxButton` on a file whose CSS on disk was perfectly valid, the page lost its
 * styling, and every admin page started collecting 404s for the style request.
 * Moving the block into `governance.css` fixed it without changing a rule.
 *
 * The size rule and the style rule are not the same claim. The style rule is
 * the causal one — it is the combination that broke. The ceiling is ordinary
 * hygiene.
 */

const RULE_STYLE = 'sfc-inline-style-in-huge-file'
const RULE_SIZE = 'sfc-line-ceiling'

/**
 * Above this many lines, an SFC must keep its styles in a sibling file.
 *
 * Derived from the repo, not chosen: every SFC that currently carries an inline
 * `<style>` is at most 2745 lines (`app/pages/docs/[...slug].vue`), while the
 * file that broke was 4023. 3000 sits in the empty band between the working
 * population and the one known failure, so the rule cannot be satisfied today
 * by accident and would have caught governance.vue on the day it grew.
 */
const INLINE_STYLE_LINE_LIMIT = 3000

/**
 * Hard ceiling on a single SFC.
 *
 * `governance.vue` is the only file within 1300 lines of it; the next largest
 * page is 2745. Set above the 4023 that broke rather than at it, because that
 * file is still being actively edited and a ceiling that fails on unrelated
 * work gets deleted rather than respected.
 */
const LINE_CEILING = 4500

/** Files large enough to be worth watching in the run log. */
const REPORTING_FLOOR = 1500

export function countLines(content: string): number {
  return content.split('\n').length
}

export function scanSfcSize(files: SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const lines = countLines(file.content)
    if (lines <= INLINE_STYLE_LINE_LIMIT && lines <= LINE_CEILING)
      continue

    const { styles } = parseSfc(file.content, file.path)

    if (lines > INLINE_STYLE_LINE_LIMIT && styles.length > 0) {
      violations.push({
        file: file.path,
        line: styles[0]!.startLine,
        rule: RULE_STYLE,
        message: `${lines}-line SFC with an inline <style> block. Above ~${INLINE_STYLE_LINE_LIMIT} lines the dev `
          + `server's separate style sub-request can resolve against a misaligned descriptor slice, which reports `
          + `a PostCSS error for CSS that is valid on disk and drops the page's styling. `
          + `Fix: move the block to a sibling .css file and \`import './${file.path.split('/').pop()!.replace(/\.vue$/, '')}.css'\` `
          + `from <script setup>, the way governance.vue does.`,
      })
    }

    if (lines > LINE_CEILING) {
      violations.push({
        file: file.path,
        line: 0,
        rule: RULE_SIZE,
        message: `${lines}-line SFC exceeds the ${LINE_CEILING}-line ceiling. `
          + `Fix: split the page into components under app/components/, the way the admin console does elsewhere.`,
      })
    }
  }

  return violations
}

function loadSfcs(): SourceFile[] {
  return [...loadSources('app/pages', ['.vue']), ...loadSources('app/components', ['.vue'])]
}

const historicalStyleBlock = readFileSync(
  fileURLToPath(new URL('./fixtures/governance-style-block.buggy.txt', import.meta.url)),
  'utf8',
)

/**
 * Rebuilds the shape of `governance.vue` at blob `9d7c8aae`: 4023 lines total,
 * `<style scoped>` opening at line 3997.
 *
 * The two facts this rule reads are the line count and the presence of a style
 * block, and both are reproduced exactly, with the real style block that was
 * removed. Storing the whole 118 KB file would add nothing the rule can see.
 */
function historicalGovernanceSfc(): SourceFile {
  const styleLines = historicalStyleBlock.replace(/\n$/, '').split('\n')
  const body = [
    '<script setup lang="ts">',
    'const rows = ref([])',
    '</script>',
    '',
    '<template>',
    ...Array.from({ length: 4023 - styleLines.length - 7 }, (_, index) => `  <div class="row-${index}" />`),
    '</template>',
    '',
    ...styleLines,
  ]
  return { path: 'app/pages/dashboard/admin/governance.vue', content: body.join('\n') }
}

describe('guard: huge SFCs keep their styles in a sibling file', () => {
  it('rebuilds the historical governance.vue faithfully', () => {
    // Positive control for the control: if the reconstruction were not actually
    // 4023 lines with a style block, the assertion below would prove nothing.
    const historical = historicalGovernanceSfc()
    expect(countLines(historical.content)).toBe(4023)
    const { styles } = parseSfc(historical.content, historical.path)
    expect(styles).toHaveLength(1)
    expect(styles[0]!.scoped).toBe(true)
    expect(styles[0]!.startLine).toBe(3997)
  })

  it('flags the SFC that broke the dev style pipeline', () => {
    const violations = scanSfcSize([historicalGovernanceSfc()])
    expect(violations).toHaveLength(1)
    expect(violations[0]!.rule).toBe(RULE_STYLE)
    expect(violations[0]!.line).toBe(3997)
  })

  it('clears the file once the styles move out', () => {
    // Negative control: same size, styles externalised — which is the shipped fix.
    const fixed: SourceFile = {
      path: 'app/pages/dashboard/admin/governance.vue',
      content: historicalGovernanceSfc().content.replace(/<style scoped>[\s\S]*<\/style>/, ''),
    }
    expect(formatViolations(scanSfcSize([fixed]))).toBe('')
  })

  it('flags an SFC over the line ceiling', () => {
    const oversized: SourceFile = {
      path: 'app/pages/dashboard/admin/monster.vue',
      content: ['<template>', ...Array.from({ length: LINE_CEILING }, () => '  <div />'), '</template>'].join('\n'),
    }
    const violations = scanSfcSize([oversized])
    expect(violations.map(violation => violation.rule)).toContain(RULE_SIZE)
  })

  it('leaves ordinary files alone', () => {
    const ordinary: SourceFile = {
      path: 'app/pages/example.vue',
      content: ['<template>', ...Array.from({ length: 900 }, () => '  <div />'), '</template>', '<style scoped>.a{}</style>'].join('\n'),
    }
    expect(formatViolations(scanSfcSize([ordinary]))).toBe('')
  })

  it('reports the current size distribution', () => {
    const sorted = loadSfcs()
      .map(file => ({ path: file.path, lines: countLines(file.content), styles: parseSfc(file.content, file.path).styles.length }))
      .sort((left, right) => right.lines - left.lines)
    const watchlist = sorted.filter(entry => entry.lines >= REPORTING_FLOOR)
    console.info(
      `[sfc guard] ${sorted.length} SFCs, largest ${sorted[0]?.lines} lines (${sorted[0]?.path}). `
      + `${watchlist.length} over ${REPORTING_FLOOR} lines:\n`
      + watchlist
        .map(entry => `  ${String(entry.lines).padStart(5)}  ${entry.path}${entry.styles > 0 ? '  [inline style]' : ''}`)
        .join('\n'),
    )
    expect(sorted.length).toBeGreaterThan(100)
  })

  it('reports no oversized SFC carrying inline styles', () => {
    expect(formatViolations(scanSfcSize(loadSfcs()))).toBe('')
  })
})
