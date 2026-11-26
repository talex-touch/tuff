import type { TdsLintCounts, TdsLintIssue, TdsLintReport, TdsStaticLintOptions } from './types'
import { runStaticTdsLint } from './static-rules'

export {
  buildTdsDomProbeScript,
  compositeRgbaOverRgb,
  contrastRatioRgb,
  parseCssColor,
  relativeLuminance,
  resolveEffectiveBackground,
  runDomTdsProbe,
  TDS_DOM_PROBE_SCRIPT,
  type RgbTuple,
  type RgbaTuple
} from './dom-probe'

export {
  extractTdsTokenReferences,
  runStaticTdsLint,
  TDS_CANONICAL_SHELL_TOKENS,
  TDS_CANONICAL_TDS_TOKENS
} from './static-rules'

export type {
  TdsDomProbeOptions,
  TdsDomRuleId,
  TdsLintCategory,
  TdsLintCounts,
  TdsLintIssue,
  TdsLintPhase,
  TdsLintReport,
  TdsLintRuleId,
  TdsLintSeverity,
  TdsStaticLintOptions,
  TdsStaticRuleId,
  TdsTokenReferences
} from './types'

/** Aggregates issue totals by severity (`errors`, `warnings`, `infos`, `total`). */
export function summarizeLintIssues(issues: readonly TdsLintIssue[]): TdsLintCounts {
  let errors = 0
  let warnings = 0
  let infos = 0
  for (const issue of issues) {
    if (issue.severity === 'error') errors += 1
    else if (issue.severity === 'warning') warnings += 1
    else infos += 1
  }
  return {
    total: issues.length,
    errors,
    warnings,
    infos
  }
}

/** Convenience wrapper running static TDS lint and returning both `issues` and `counts`. */
export function runTdsStaticReport(source: string, options?: TdsStaticLintOptions): TdsLintReport {
  const issues = runStaticTdsLint(source, options)
  return {
    issues,
    counts: summarizeLintIssues(issues)
  }
}

/**
 * Formats TDS lint findings into a concise, directly actionable fix prompt for the AI assistant.
 * Returns an empty string when `issues` is empty.
 */
export function formatLintIssuesForAi(issues: readonly TdsLintIssue[], displayPath = ''): string {
  if (issues.length === 0) return ''

  const counts = summarizeLintIssues(issues)
  const target = displayPath.trim() ? `\`${displayPath.trim()}\`` : 'the current preview'
  const summaryParts: string[] = []
  if (counts.errors > 0)
    summaryParts.push(`${counts.errors} error${counts.errors === 1 ? '' : 's'}`)
  if (counts.warnings > 0) {
    summaryParts.push(`${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`)
  }
  if (counts.infos > 0) summaryParts.push(`${counts.infos} info`)

  const lines = issues.map((issue, idx) => {
    const locParts: string[] = []
    if (issue.line !== undefined) {
      locParts.push(
        issue.column !== undefined ? `L${issue.line}:${issue.column}` : `L${issue.line}`
      )
    }
    if (issue.selector) {
      locParts.push(issue.selector)
    }
    const loc = locParts.length > 0 ? ` (${locParts.join(', ')})` : ''
    const snippet = issue.snippet ? ` — \`${issue.snippet}\`` : ''
    return `${idx + 1}. [${issue.severity.toUpperCase()}] \`${issue.ruleId}\`${loc}: ${issue.message}${snippet}\n   Fix: ${issue.fixHint}`
  })

  return [
    `Please fix the following TDS visual lint issues in ${target} (${summaryParts.join(', ')}):`,
    '',
    ...lines,
    '',
    'Keep the output offline-safe (no remote asset URLs), use canonical `--shell-*` / `--tx-*` tokens, preserve layout intent, and avoid generic AI styling.'
  ].join('\n')
}
