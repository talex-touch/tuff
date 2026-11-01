import type { Distribution } from '../eval-types'

export function thousands(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const sign = value < 0 ? '-' : ''
  const [whole, fraction] = Math.abs(value).toString().split('.')
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`
}

/** `1 lag`, `2 lags`, `1,200 lags`. */
export const plural = (count: number, word: string): string =>
  `${thousands(count)} ${word}${count === 1 ? '' : 's'}`

/** `never` stands for a value that was not reached within its deadline (+Infinity). */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return 'n/a'
  if (ms === Infinity) return 'never'
  if (ms < 0) return `-${fmtMs(-ms)}`
  if (ms < 10) return `${(Math.round(ms * 10) / 10).toString()} ms`
  if (ms < 1_000) return `${Math.round(ms)} ms`
  if (ms < 100_000) return `${(Math.round(ms / 100) / 10).toString()} s`
  return fmtDuration(ms)
}

/** `p50 / p95 / p99` of a distribution, or `n/a` when it holds no sample. */
export function dist3(d: Distribution): string {
  return d.count === 0 ? 'n/a' : `${fmtMs(d.p50)} / ${fmtMs(d.p95)} / ${fmtMs(d.p99)}`
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a'
  const total = Math.round(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (hours > 0) return `${hours}h${pad(minutes)}m${pad(seconds)}s`
  return `${minutes}m${pad(seconds)}s`
}

export function fmtPct(share: number, digits = 1): string {
  if (!Number.isFinite(share)) return 'n/a'
  const text = (share * 100).toFixed(digits)
  if (share > 0 && Number(text) === 0) return `<${(10 ** -digits).toFixed(digits)}%`
  return `${text}%`
}

export function fmtMb(mb: number): string {
  if (!Number.isFinite(mb)) return 'n/a'
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`
}

export function fmtCpu(pct: number): string {
  return Number.isFinite(pct) ? `${Math.round(pct)}%` : 'n/a'
}

export function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** `+12m03s` since `origin`. */
export function offset(ms: number, origin: number): string {
  return `+${fmtDuration(Math.max(0, ms - origin))}`
}

/** Escapes what would break a Markdown table cell. */
export function cell(text: string | number | boolean | null | undefined): string {
  if (text === null || text === undefined) return ''
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

export function code(text: string): string {
  return `\`${text.replace(/`/g, "'").replace(/\r?\n/g, ' ')}\``
}

export interface Column {
  header: string
  align?: 'left' | 'right'
}

export function table(
  columns: readonly Column[],
  rows: ReadonlyArray<ReadonlyArray<string | number>>
): string {
  const head = `| ${columns.map((column) => column.header).join(' | ')} |`
  const rule = `| ${columns.map((column) => (column.align === 'right' ? '---:' : '---')).join(' | ')} |`
  const body = rows.map((row) => `| ${row.map((value) => cell(value)).join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}

/** Plain number for JSON: `null` where the value is not finite (Infinity would be written as null anyway, silently). */
export function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null
}
