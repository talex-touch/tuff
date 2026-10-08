import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { AdminListFetchParams, AdminListOptions, AdminListPage } from '~/composables/useAdminList'
import type { AdminRequest, AdminSelectOption, NumberFieldValue, PluralTranslate, Translate } from '~/utils/admin-users'
import { readWholeNumber } from '~/utils/admin-users'

/**
 * Activation codes (`/admin/subscriptions`): the list request, the labels and
 * tones its cells use, when the actions column exists, and the generator form's
 * rules. Pure, so the page stays a layout and these rules are tested directly.
 */

/** A row of `GET /api/admin/codes`: the table's own columns, snake_case as stored. */
export interface AdminActivationCode {
  id: string
  code: string
  plan: string
  duration_days: number
  max_uses: number
  uses: number
  created_at: string
  expires_at: string | null
  status: string
}

export interface AdminCodeFilters extends Record<string, string> {
  q: string
  plan: string
  status: string
}

/** `all` is the select's "All …" entry; it never reaches the API or the URL. */
export const ADMIN_CODE_FILTER_DEFAULTS: AdminCodeFilters = {
  q: '',
  plan: 'all',
  status: 'all',
}

/** The API caps a page at 100 rows. */
export const ADMIN_CODE_PAGE_SIZES = [20, 50, 100]

/** Plans a code can carry, in the generator's order (`POST /api/admin/codes/generate`). */
export const ACTIVATION_CODE_PLANS = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE', 'TEAM'] as const

/** What `GET /api/admin/codes` filters by; any other value would be ignored there, so it is not sent. */
export const ACTIVATION_CODE_STATUSES = ['active', 'exhausted', 'expired', 'revoked'] as const

/** `GET /api/admin/codes` query. With no filters it is exactly `{ page, limit }`. */
export function buildCodeQuery(params: AdminListFetchParams<AdminCodeFilters>): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit }
  const q = params.filters.q.trim()
  if (q)
    query.q = q
  if ((ACTIVATION_CODE_PLANS as readonly string[]).includes(params.filters.plan))
    query.plan = params.filters.plan
  if ((ACTIVATION_CODE_STATUSES as readonly string[]).includes(params.filters.status))
    query.status = params.filters.status
  return query
}

interface CodeListResponse {
  codes?: AdminActivationCode[]
  pagination?: { total?: number }
}

/**
 * `useAdminList` options for the activation codes. The page passes
 * `requestJson`; tests pass a fake, so the request and error text under test are
 * the ones the page ships.
 */
export function createCodeListOptions(
  request: AdminRequest,
  t: Translate,
): AdminListOptions<AdminActivationCode, AdminCodeFilters> {
  return {
    async fetch(params): Promise<AdminListPage<AdminActivationCode>> {
      const response = await request('/api/admin/codes', { query: buildCodeQuery(params) }) as CodeListResponse | null
      return {
        rows: Array.isArray(response?.codes) ? response.codes : [],
        total: Number(response?.pagination?.total) || 0,
      }
    },
    defaults: ADMIN_CODE_FILTER_DEFAULTS,
    defaultLimit: 20,
    pageSizes: ADMIN_CODE_PAGE_SIZES,
    debounceKeys: ['q'],
    errorFallback: () => t('dashboard.sections.codes.errors.loadFailed', 'Failed to load activation codes.'),
  }
}

export function buildCodeStatusLabels(t: Translate): Record<string, string> {
  return {
    active: t('dashboard.sections.codes.status.active', 'Active'),
    exhausted: t('dashboard.sections.codes.status.exhausted', 'Exhausted'),
    expired: t('dashboard.sections.codes.status.expired', 'Expired'),
    revoked: t('dashboard.sections.codes.status.revoked', 'Revoked'),
  }
}

/** "All statuses" first, then the four statuses the API filters by. */
export function buildCodeStatusOptions(t: Translate): AdminSelectOption[] {
  const labels = buildCodeStatusLabels(t)
  return [
    { value: 'all', label: t('dashboard.sections.codes.filters.allStatuses', 'All statuses') },
    ...ACTIVATION_CODE_STATUSES.map(value => ({ value, label: labels[value]! })),
  ]
}

/**
 * "1 day" / "30 days" / "30 天". The count is printed in the reader's locale
 * ("1,000 days") while the plural form is chosen from the number itself —
 * `codes.durationValue` (`'{count} day | {count} days'`) is the first plural
 * message in Nexus.
 */
export function codeDurationLabel(days: number, t: PluralTranslate, formatNumber: (value: number) => string): string {
  return t('dashboard.sections.codes.durationValue', { count: formatNumber(days) }, days)
}

/** Plan names are product identifiers and read the same in every locale. */
export function buildCodePlanOptions(t: Translate): AdminSelectOption[] {
  return [
    { value: 'all', label: t('dashboard.sections.codes.filters.allPlans', 'All plans') },
    ...ACTIVATION_CODE_PLANS.map(value => ({ value, label: value })),
  ]
}

export function codeStatusTone(status: string): StatusTone {
  if (status === 'active')
    return 'success'
  if (status === 'expired')
    return 'danger'
  if (status === 'revoked')
    return 'warning'
  return 'muted'
}

/** The API only moves a code to `revoked`, and only a code that can still be redeemed is worth revoking. */
export function isRevocableCode(code: Pick<AdminActivationCode, 'status'>): boolean {
  return code.status === 'active'
}

export interface CodeActionsColumnInput {
  rows: ReadonlyArray<Pick<AdminActivationCode, 'status'>>
  /** No rows yet: the first request has not answered. */
  loading: boolean
  /** The status filter the list was requested with. */
  status: string
}

/**
 * Whether the table has an actions column. Revoking is the only action, so a page
 * with nothing to revoke has no column at all instead of an empty one. Before the
 * first rows arrive the skeleton keeps the column whenever the status filter can
 * still return a revocable code, so the table does not change shape on arrival in
 * the usual case.
 */
export function showCodeActionsColumn({ rows, loading, status }: CodeActionsColumnInput): boolean {
  if (loading && rows.length === 0)
    return status === 'all' || status === 'active'
  return rows.some(isRevocableCode)
}

// ─── Generator ─────────────────────────────────────────────────────────────

export type CodeGenerationField = 'durationDays' | 'maxUses' | 'expiresInDays' | 'count'

export interface CodeGenerationForm {
  plan: string
  durationDays: NumberFieldValue
  maxUses: NumberFieldValue
  expiresInDays: NumberFieldValue
  count: NumberFieldValue
}

export const CODE_GENERATION_DEFAULTS: Readonly<{ plan: string } & Record<CodeGenerationField, number>> = {
  plan: 'PLUS',
  durationDays: 30,
  maxUses: 1,
  expiresInDays: 90,
  count: 1,
}

/** The ranges `POST /api/admin/codes/generate` accepts. */
export const CODE_GENERATION_LIMITS: Readonly<Record<CodeGenerationField, { min: number, max: number }>> = {
  durationDays: { min: 1, max: 365 },
  maxUses: { min: 1, max: 1000 },
  expiresInDays: { min: 1, max: 365 },
  count: { min: 1, max: 100 },
}

const GENERATION_FIELDS = Object.keys(CODE_GENERATION_LIMITS) as CodeGenerationField[]

export interface CodeGenerationBody {
  plan: string
  durationDays: number
  maxUses: number
  expiresInDays: number
  count: number
}

export type CodeGenerationCheck =
  | { ok: true, body: CodeGenerationBody }
  | { ok: false, plan: boolean, fields: CodeGenerationField[] }

/**
 * The generator's body, or the fields that are out of range. Every number is a
 * whole number within the API's range: the API clamps `count` silently and takes
 * a fractional duration, so the form checks both rather than generating something
 * other than what was typed.
 */
export function validateCodeGeneration(form: CodeGenerationForm): CodeGenerationCheck {
  const planValid = (ACTIVATION_CODE_PLANS as readonly string[]).includes(form.plan)
  const values = {} as Record<CodeGenerationField, number>
  const invalid = GENERATION_FIELDS.filter((field) => {
    const value = readWholeNumber(form[field])
    const { min, max } = CODE_GENERATION_LIMITS[field]
    if (value === null || value < min || value > max)
      return true
    values[field] = value
    return false
  })
  if (!planValid || invalid.length)
    return { ok: false, plan: !planValid, fields: invalid }
  return { ok: true, body: { plan: form.plan, ...values } }
}
