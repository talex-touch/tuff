export type TdsLintPhase = 'static' | 'dom'

export type TdsLintSeverity = 'error' | 'warning' | 'info'

export type TdsLintCategory = 'sandbox' | 'tokens' | 'layout' | 'contrast' | 'icons' | 'anti-slop'

export type TdsStaticRuleId =
  | 'remote-asset-url'
  | 'undefined-tds-token'
  | 'viewport-unit-canvas'
  | 'thick-border-or-glow'

export type TdsDomRuleId =
  | 'icon-missing'
  | 'text-clipped'
  | 'unintended-wrap'
  | 'edge-misaligned'
  | 'contrast-fail'
  | 'tell-gradient-text'
  | 'tell-small-text'
  | 'tell-emoji-icon'
  | 'tell-resting-card-shadow'

export type TdsLintRuleId = TdsStaticRuleId | TdsDomRuleId

export interface TdsLintIssue {
  /** Stable rule identifier (e.g. `remote-asset-url`, `contrast-fail`). */
  ruleId: TdsLintRuleId
  /** Which phase produced the issue: `static` (source) or `dom` (rendered DOM/computed styles). */
  phase: TdsLintPhase
  /** Severity tier. */
  severity: TdsLintSeverity
  /** Functional grouping; `anti-slop` rules can be disabled with `antiSlop: false`. */
  category: TdsLintCategory
  /** Concise human-readable description of the defect. */
  message: string
  /** Actionable TDS-grounded fix instruction. */
  fixHint: string
  /** 1-based source line number (static phase). */
  line?: number
  /** 1-based source column number (static phase). */
  column?: number
  /** Matched snippet or computed diagnostic detail. */
  snippet?: string
  /** Compact DOM selector path (DOM probe phase). */
  selector?: string
}

export interface TdsLintCounts {
  total: number
  errors: number
  warnings: number
  infos: number
}

export interface TdsLintReport {
  issues: TdsLintIssue[]
  counts: TdsLintCounts
}

export interface TdsStaticLintOptions {
  /** Include opinionated anti-AI-slop rules (default: `true`). Pass `false` to opt out. */
  antiSlop?: boolean
  /**
   * Treat the document as a fixed-frame canvas preview where `100vh` / `h-screen` should use
   * `100%` / `h-full` (default: `true`).
   */
  fixedFrame?: boolean
  /** Source kind hint; auto-detected when omitted. */
  sourceKind?: 'html' | 'svg' | 'vue' | 'css'
  /** Additional `--shell-*` / `--tds-*` token names to allow without flagging. */
  extraAllowedTokens?: readonly string[]
  /** Maximum raw hex colors allowed outside variable definitions before flagging (default: `4`). */
  maxRawHexColors?: number
}

export interface TdsDomProbeOptions {
  /** Include opinionated anti-AI-slop DOM rules (default: `true`). Pass `false` to opt out. */
  antiSlop?: boolean
  /** WCAG 2.1 normal text contrast floor (default: `4.5`). */
  normalContrastMin?: number
  /** WCAG 2.1 large text (`>=18px` or `>=14px` bold) contrast floor (default: `3.0`). */
  largeContrastMin?: number
  /** Minimum pixel delta treated as top-edge sibling misalignment (default: `0.5`). */
  misalignMinPx?: number
  /** Maximum pixel delta treated as top-edge sibling misalignment (default: `4`). */
  misalignMaxPx?: number
  /** Minimum readable font size in px for `tell-small-text` (default: `11`). */
  minFontSizePx?: number
  /** Fallback opaque backdrop RGB when ancestor backgrounds are transparent (default: `[255, 255, 255]`). */
  defaultBackdropRgb?: readonly [number, number, number]
}

export interface TdsTokenReferences {
  shell: Array<{ name: string; line: number; column: number }>
  tx: Array<{ name: string; line: number; column: number }>
  tds: Array<{ name: string; line: number; column: number }>
}
