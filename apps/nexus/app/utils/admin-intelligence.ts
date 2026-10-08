import type { AdminListFetchParams, AdminListOptions, AdminListPage } from '~/composables/useAdminList'
import type { AdminFormat } from '~/composables/useAdminFormat'
import type { AdminStatItem } from '~/utils/admin-kit'
import { ADMIN_FORMAT_EMPTY } from '~/composables/useAdminFormat'

/**
 * The AI services pages, AI overview (`/admin/intelligence-overview`) and AI
 * call audits (`/admin/intelligence-audits`): the requests they send, what each
 * response becomes on screen, and the provider type vocabulary they share. Pure,
 * so the pages stay layout and these rules are tested directly.
 */

/** vue-i18n's `t(key, fallback)`. Not exported: `utils/` exports are auto-imports, and `admin-users.ts` owns the name. */
type Translate = (key: string, fallback: string) => string

/** vue-i18n's `t`, called both ways: `t(key, fallback)` and `t(key, named)`. */
export type IntelligenceTranslate = Translate & ((key: string, named: Record<string, unknown>) => string)

/** `requestJson` on the page; a fake in tests. */
export type IntelligenceRequest = (path: string, options?: { query: Record<string, string | number> }) => Promise<unknown>

type NumberFormat = Pick<AdminFormat, 'number'>

// ─── Provider types ────────────────────────────────────────────────────────

/**
 * Every provider type an audit row can carry, labelled: the six
 * `IntelligenceProviderType`s, and the provider registry vendors that had no
 * name here (`dashscope`, `tencent-cloud`, `exchange-rate`), which rendered as
 * blank cells or raw keys. Built inside a computed by the pages, so a locale
 * switch re-translates them.
 */
export function buildIntelligenceProviderTypeLabels(t: Translate): Record<string, string> {
  return {
    'openai': t('dashboard.sections.intelligence.types.openai', 'OpenAI'),
    'anthropic': t('dashboard.sections.intelligence.types.anthropic', 'Anthropic'),
    'deepseek': t('dashboard.sections.intelligence.types.deepseek', 'DeepSeek'),
    'siliconflow': t('dashboard.sections.intelligence.types.siliconflow', 'SiliconFlow'),
    'local': t('dashboard.sections.intelligence.types.local', 'Local (Ollama)'),
    'custom': t('dashboard.sections.intelligence.types.custom', 'Custom'),
    'dashscope': t('dashboard.sections.intelligence.types.dashscope', 'DashScope / Model Studio'),
    'tencent-cloud': t('dashboard.sections.intelligence.types.tencentCloud', 'Tencent Cloud'),
    'exchange-rate': t('dashboard.sections.intelligence.types.exchangeRate', 'Exchange rate'),
  }
}

/** A type's name; an unknown type reads as itself, and a missing one as `—`, never as blank. */
export function intelligenceProviderTypeLabel(type: string | null | undefined, labels: Record<string, string>): string {
  const value = type?.trim() ?? ''
  if (!value)
    return ADMIN_FORMAT_EMPTY
  return Object.hasOwn(labels, value) ? labels[value]! : value
}

/** `1,850 ms`: exact milliseconds with grouping. `duration()` would round 1850 to "2 s". */
export function formatIntelligenceLatency(
  milliseconds: number | null | undefined,
  format: NumberFormat,
  t: IntelligenceTranslate,
): string {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds))
    return ADMIN_FORMAT_EMPTY
  return t('dashboard.sections.intelligence.latencyMs', { value: format.number(milliseconds) })
}

// ─── Overview ──────────────────────────────────────────────────────────────

export interface IntelligenceRankItem {
  label: string
  count: number
}

export interface IntelligenceOverviewSummary {
  /** The number of audit rows sampled, so always equal to `sampleSize` (at most 200). */
  totalRequests: number
  /** A whole percentage, 0–100. */
  successRate: number
  /** Milliseconds; 0 when no sampled row recorded a latency. */
  avgLatency: number
  totalTokens: number
  sampleSize: number
}

export interface IntelligenceOverview {
  summary: IntelligenceOverviewSummary
  models: IntelligenceRankItem[]
  providers: IntelligenceRankItem[]
  ips: IntelligenceRankItem[]
  countries: IntelligenceRankItem[]
}

function toNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function rankItems(value: unknown): IntelligenceRankItem[] {
  if (!Array.isArray(value))
    return []
  return value.filter(isRecord).map(item => ({ label: String(item.label ?? ''), count: toNumber(item.count) }))
}

/**
 * `GET /api/dashboard/intelligence/overview`. One request feeds the four
 * metrics, the sample hint and the four ranked lists. A body without a summary
 * is a failure: four zero cards would read as a quiet week.
 */
export async function fetchIntelligenceOverview(request: IntelligenceRequest): Promise<IntelligenceOverview> {
  const response = await request('/api/dashboard/intelligence/overview')
  if (!isRecord(response) || !isRecord(response.summary))
    throw new Error('The overview response has no summary.')
  const summary = response.summary
  return {
    summary: {
      totalRequests: toNumber(summary.totalRequests),
      successRate: toNumber(summary.successRate),
      avgLatency: toNumber(summary.avgLatency),
      totalTokens: toNumber(summary.totalTokens),
      sampleSize: toNumber(summary.sampleSize),
    },
    models: rankItems(response.models),
    providers: rankItems(response.providers),
    ips: rankItems(response.ips),
    countries: rankItems(response.countries),
  }
}

/**
 * The four metric cards, in order. The success rate arrives as a whole
 * percentage and `percent()` takes a fraction. With no sampled rows the average
 * latency is not 0 ms but unknown.
 */
export function buildOverviewStatItems(
  summary: IntelligenceOverviewSummary,
  format: Pick<AdminFormat, 'number' | 'percent'>,
  t: IntelligenceTranslate,
): AdminStatItem[] {
  return [
    {
      key: 'totalRequests',
      label: t('dashboard.sections.intelligence.overview.cards.totalRequests', 'Sampled Requests'),
      value: format.number(summary.totalRequests),
    },
    {
      key: 'successRate',
      label: t('dashboard.sections.intelligence.overview.cards.successRate', 'Success Rate'),
      value: format.percent(summary.successRate / 100),
    },
    {
      key: 'totalTokens',
      label: t('dashboard.sections.intelligence.overview.cards.totalTokens', 'Token Usage'),
      value: format.number(summary.totalTokens),
    },
    {
      key: 'avgLatency',
      label: t('dashboard.sections.intelligence.overview.cards.avgLatency', 'Avg Latency'),
      value: summary.sampleSize > 0 ? formatIntelligenceLatency(summary.avgLatency, format, t) : ADMIN_FORMAT_EMPTY,
    },
  ]
}

export type OverviewFailure = 'first-load' | 'refresh' | null

/**
 * Which failure the overview shows, from its `useAdminResource` state:
 * - `first-load`: nothing on screen and the last request failed. An error state
 *   with a retry stands in for the metrics and the lists, rather than four lists
 *   saying "no data". Its retry is a first load again, so it draws placeholders.
 * - `refresh`: a refresh failed. What was on screen stays, under a notice with a
 *   retry, and the notice stays while that retry runs.
 */
export function resolveOverviewFailure(input: { hasData: boolean, loading: boolean, error: string | null }): OverviewFailure {
  if (!input.error)
    return null
  if (input.hasData)
    return 'refresh'
  return input.loading ? null : 'first-load'
}

/** The metrics block's one line of explanation. Until the first answer it names no number. */
export function overviewSampleHint(
  summary: IntelligenceOverviewSummary | null,
  format: NumberFormat,
  t: IntelligenceTranslate,
): string {
  if (!summary)
    return t('dashboard.sections.intelligence.overview.sampleHintPending', 'Based on the latest audit entries')
  return t('dashboard.sections.intelligence.overview.sampleHint', { count: format.number(summary.sampleSize) })
}

/** One row of a ranked list, ready to print. */
export interface IntelligenceRankRow {
  key: string
  label: string
  count: string
}

export function buildRankRows(
  items: IntelligenceRankItem[],
  format: NumberFormat,
  labelOf: (label: string) => string = label => label,
): IntelligenceRankRow[] {
  return items.map((item, index) => ({
    key: `${index}:${item.label}`,
    label: labelOf(item.label) || ADMIN_FORMAT_EMPTY,
    count: format.number(item.count),
  }))
}

export type OverviewListKey = 'models' | 'providers' | 'ips' | 'countries'

export interface OverviewTopList {
  key: OverviewListKey
  title: string
  /** How many rows the API returns at most: the first load draws that many placeholders. */
  limit: number
  rows: IntelligenceRankRow[]
}

/**
 * The four ranked lists. The providers list is keyed by provider name, or by
 * provider type when the row had no name, so a type reads under its label.
 */
export function buildOverviewTopLists(
  overview: IntelligenceOverview | null,
  format: NumberFormat,
  t: Translate,
): OverviewTopList[] {
  const typeLabels = buildIntelligenceProviderTypeLabels(t)
  return [
    {
      key: 'models',
      title: t('dashboard.sections.intelligence.overview.topModels', 'Top Models'),
      limit: 8,
      rows: buildRankRows(overview?.models ?? [], format),
    },
    {
      key: 'providers',
      title: t('dashboard.sections.intelligence.overview.topProviders', 'Top Providers'),
      limit: 6,
      rows: buildRankRows(overview?.providers ?? [], format, label => (Object.hasOwn(typeLabels, label) ? typeLabels[label]! : label)),
    },
    {
      key: 'ips',
      title: t('dashboard.sections.intelligence.overview.topIps', 'Top IPs'),
      limit: 8,
      rows: buildRankRows(overview?.ips ?? [], format),
    },
    {
      key: 'countries',
      title: t('dashboard.sections.intelligence.overview.topCountries', 'Top Countries'),
      limit: 8,
      rows: buildRankRows(overview?.countries ?? [], format),
    },
  ]
}

// ─── User usage lookup ─────────────────────────────────────────────────────

export interface IntelligenceUsageResult {
  /** Every call the user ever made. */
  totalRequests: number
  /** Tokens, success rate and models cover the user's latest ≤ 200 calls. */
  totalTokens: number
  successRate: number
  lastSeenAt: string | null
  models: IntelligenceRankItem[]
}

/** One answered lookup, tagged with the user it was asked for. */
export interface IntelligenceUsageAnswer {
  userId: string
  result: IntelligenceUsageResult
}

/** The user id a query sends: trimmed, or `null` when nothing is left, which keeps "Query" disabled. */
export function normalizeUsageLookupInput(value: string): string | null {
  const userId = value.trim()
  return userId || null
}

/**
 * `GET /api/dashboard/intelligence/usage?userId=`. Every failure is thrown without
 * server text, so the lookup always shows its own localized copy: `{ ok: false }`
 * comes back as a 200 whose `error` is the server's English ("Missing userId"),
 * and a transport error's `statusMessage` is English too, which the kit's
 * resolver would otherwise put on screen.
 */
export async function fetchIntelligenceUsage(request: IntelligenceRequest, userId: string): Promise<IntelligenceUsageAnswer> {
  let response: unknown
  try {
    response = await request('/api/dashboard/intelligence/usage', { query: { userId } })
  }
  catch {
    throw new Error('The usage lookup failed.')
  }
  if (!isRecord(response) || response.ok !== true || !isRecord(response.result))
    throw new Error('The usage lookup was refused.')
  const result = response.result
  return {
    userId,
    result: {
      totalRequests: toNumber(result.totalRequests),
      totalTokens: toNumber(result.totalTokens),
      successRate: toNumber(result.successRate),
      lastSeenAt: typeof result.lastSeenAt === 'string' && result.lastSeenAt ? result.lastSeenAt : null,
      models: rankItems(result.models),
    },
  }
}

/** The four cards of an answered lookup; the last request's full time is the card's tooltip. */
export function buildUsageStatItems(
  result: IntelligenceUsageResult,
  format: Pick<AdminFormat, 'number' | 'percent' | 'tableDateTime' | 'dateTimeTitle'>,
  t: Translate,
): AdminStatItem[] {
  return [
    {
      key: 'requests',
      label: t('dashboard.sections.intelligence.overview.userUsage.requests', 'Requests'),
      value: format.number(result.totalRequests),
    },
    {
      key: 'tokens',
      label: t('dashboard.sections.intelligence.overview.userUsage.tokens', 'Token Usage'),
      value: format.number(result.totalTokens),
    },
    {
      key: 'successRate',
      label: t('dashboard.sections.intelligence.overview.userUsage.successRate', 'Success Rate'),
      value: format.percent(result.successRate / 100),
    },
    {
      key: 'lastSeen',
      label: t('dashboard.sections.intelligence.overview.userUsage.lastSeen', 'Last Seen'),
      value: format.tableDateTime(result.lastSeenAt),
      title: result.lastSeenAt ? format.dateTimeTitle(result.lastSeenAt) : undefined,
    },
  ]
}

export type UsageLookupView =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error', message: string }
  | { state: 'empty', userId: string }
  | { state: 'result', lookup: IntelligenceUsageAnswer }

export interface UsageLookupInput {
  /** The trimmed user id of the latest submitted query, `null` before the first one. */
  submittedUserId: string | null
  data: IntelligenceUsageAnswer | null
  /** A lookup is in flight. */
  pending: boolean
  error: string | null
}

/**
 * What the lookup shows. Data only counts while it belongs to the user last
 * asked for: asking for someone else draws placeholders instead of leaving the
 * previous user's cards up, and a failed lookup shows the failure rather than
 * cards that answer a different question. A user with no calls on record is its
 * own state, not four zero cards.
 */
export function resolveUsageLookupView(input: UsageLookupInput): UsageLookupView {
  if (!input.submittedUserId)
    return { state: 'idle' }
  const current = input.data && input.data.userId === input.submittedUserId ? input.data : null
  if (input.pending && !current)
    return { state: 'loading' }
  if (!input.pending && input.error)
    return { state: 'error', message: input.error }
  if (!current)
    return { state: 'idle' }
  if (current.result.totalRequests <= 0)
    return { state: 'empty', userId: current.userId }
  return { state: 'result', lookup: current }
}

// ─── Call audits ───────────────────────────────────────────────────────────

/** One row of `GET /api/dashboard/intelligence/audits` (`IntelligenceAuditRecord` on the server). */
export interface IntelligenceAuditEntry {
  id: string
  userId: string
  providerId: string
  providerType: string
  providerName: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: boolean
  errorMessage: string | null
  traceId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface IntelligenceAuditFilters extends Record<string, string> {
  userId: string
  providerId: string
}

export const INTELLIGENCE_AUDIT_FILTER_DEFAULTS: IntelligenceAuditFilters = {
  userId: '',
  providerId: '',
}

export const INTELLIGENCE_AUDIT_PAGE_SIZES = [20, 50, 100]

/** The API query: `{ page, limit }`, plus each filter that is set, trimmed. */
export function buildIntelligenceAuditQuery(params: AdminListFetchParams<IntelligenceAuditFilters>): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit }
  const userId = params.filters.userId.trim()
  if (userId)
    query.userId = userId
  const providerId = params.filters.providerId.trim()
  if (providerId)
    query.providerId = providerId
  return query
}

interface AuditListResponse {
  audits?: unknown
  total?: unknown
}

/**
 * `useAdminList` options for the call audits. The page passes `requestJson`;
 * tests pass a fake, so the request, the error text and the paging under test
 * are the ones the page ships. Both filters are typed ids, so both wait for the
 * reader to stop typing.
 */
export function createIntelligenceAuditListOptions(
  request: IntelligenceRequest,
  t: Translate,
): AdminListOptions<IntelligenceAuditEntry, IntelligenceAuditFilters> {
  return {
    async fetch(params): Promise<AdminListPage<IntelligenceAuditEntry>> {
      const response = await request('/api/dashboard/intelligence/audits', { query: buildIntelligenceAuditQuery(params) }) as AuditListResponse | null
      return {
        rows: Array.isArray(response?.audits) ? response.audits as IntelligenceAuditEntry[] : [],
        total: toNumber(response?.total),
      }
    },
    defaults: INTELLIGENCE_AUDIT_FILTER_DEFAULTS,
    defaultLimit: 20,
    pageSizes: INTELLIGENCE_AUDIT_PAGE_SIZES,
    debounceKeys: ['userId', 'providerId'],
    errorFallback: () => t('dashboard.sections.intelligence.audit.loadFailed', 'Failed to load audit logs.'),
  }
}

/** The provider column: the provider's name, or its type's label when the row has none. */
export function auditProviderName(entry: Pick<IntelligenceAuditEntry, 'providerName' | 'providerType'>, typeLabels: Record<string, string>): string {
  return entry.providerName?.trim() || intelligenceProviderTypeLabel(entry.providerType, typeLabels)
}

export function auditResultLabel(entry: Pick<IntelligenceAuditEntry, 'success'>, t: Translate): string {
  return entry.success
    ? t('dashboard.sections.intelligence.audit.status.success', 'Success')
    : t('dashboard.sections.intelligence.audit.status.failed', 'Failed')
}

/** `HTTP 200`, or `null` when the call recorded no status. */
export function auditHttpStatus(entry: Pick<IntelligenceAuditEntry, 'status'>, t: IntelligenceTranslate): string | null {
  return typeof entry.status === 'number'
    ? t('dashboard.sections.intelligence.audit.httpStatus', { status: entry.status })
    : null
}

/**
 * The result column's badge: `成功 · 200`, `Fail · 500`. English says `OK` and
 * `Fail` rather than `Success` and `Failed`, so the word and the code fit the
 * 120px column without reaching into the next one.
 * A call that recorded no status shows the word alone.
 */
export function auditResultBadgeText(entry: Pick<IntelligenceAuditEntry, 'success' | 'status'>, t: Translate): string {
  if (typeof entry.status !== 'number')
    return auditResultLabel(entry, t)
  const word = entry.success
    ? t('dashboard.sections.intelligence.audit.status.successShort', 'OK')
    : t('dashboard.sections.intelligence.audit.status.failedShort', 'Fail')
  return `${word} · ${entry.status}`
}

/** `成功 · HTTP 200`: the result in words, for the badge's tooltip and accessible name. */
export function auditResultTitle(entry: Pick<IntelligenceAuditEntry, 'success' | 'status'>, t: IntelligenceTranslate): string {
  return [auditResultLabel(entry, t), auditHttpStatus(entry, t)].filter(Boolean).join(' · ')
}

/** One metadata field of the drawer: its label, and its value as lines of text. */
export interface AuditMetadataEntry {
  key: string
  label: string
  lines: string[]
}

/**
 * The metadata as label–value pairs, never as a JSON string. Fields the console
 * has names for read under them; the rest keep their own key. A nested object
 * prints one `key: value` line per field and a list one line per item, so
 * `endpoints` reads as a list of URLs. The response snippet is left out: the
 * drawer prints it in a block of its own (`auditResponseSnippet`).
 */
export function buildAuditMetadataEntries(
  metadata: Record<string, unknown> | null | undefined,
  format: NumberFormat,
  t: Translate,
): AuditMetadataEntry[] {
  if (!isRecord(metadata))
    return []

  const labels: Record<string, string> = {
    baseUrl: t('dashboard.sections.intelligence.audit.fields.baseUrl', 'Base URL'),
    requestId: t('dashboard.sections.intelligence.audit.fields.requestId', 'Request ID'),
    contentType: t('dashboard.sections.intelligence.audit.fields.contentType', 'Content-Type'),
    endpoints: t('dashboard.sections.intelligence.audit.fields.candidates', 'Candidate Endpoints'),
    tokens: t('dashboard.sections.intelligence.audit.fields.tokens', 'Tokens'),
    ip: t('dashboard.sections.intelligence.audit.fields.ip', 'IP'),
    country: t('dashboard.sections.intelligence.audit.fields.country', 'Country'),
  }

  function scalar(value: unknown): string {
    if (value === null || value === undefined || value === '')
      return ADMIN_FORMAT_EMPTY
    if (typeof value === 'boolean') {
      return value
        ? t('dashboard.sections.intelligence.audit.detail.yes', 'Yes')
        : t('dashboard.sections.intelligence.audit.detail.no', 'No')
    }
    if (typeof value === 'number')
      return format.number(value)
    return String(value)
  }

  function inline(value: unknown): string {
    if (Array.isArray(value))
      return value.length ? value.map(inline).join(', ') : ADMIN_FORMAT_EMPTY
    if (isRecord(value)) {
      const fields = Object.entries(value)
      return fields.length ? fields.map(([key, field]) => `${key}: ${inline(field)}`).join(' · ') : ADMIN_FORMAT_EMPTY
    }
    return scalar(value)
  }

  function lines(value: unknown): string[] {
    if (Array.isArray(value))
      return value.length ? value.map(inline) : [ADMIN_FORMAT_EMPTY]
    if (isRecord(value)) {
      const fields = Object.entries(value)
      return fields.length ? fields.map(([key, field]) => `${key}: ${inline(field)}`) : [ADMIN_FORMAT_EMPTY]
    }
    return [scalar(value)]
  }

  return Object.entries(metadata)
    .filter(([key, value]) => !(key === 'responseSnippet' && typeof value === 'string'))
    .map(([key, value]) => ({
      key,
      label: Object.hasOwn(labels, key) ? labels[key]! : key,
      lines: lines(value),
    }))
}

/** The upstream response the call recorded, if any, for the drawer's monospace block. */
export function auditResponseSnippet(metadata: Record<string, unknown> | null | undefined): string | null {
  const snippet = isRecord(metadata) ? metadata.responseSnippet : null
  return typeof snippet === 'string' && snippet.trim() ? snippet : null
}
