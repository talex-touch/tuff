import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { AdminListFetchParams, AdminListOptions, AdminListPage } from '~/composables/useAdminList'

/**
 * User management (`/admin/users`): the list request, the labels and tones its
 * cells use, the rules behind each row and drawer action, and the shapes the
 * credit and subscription drawers read. Pure, so the page stays a layout and
 * these rules are tested directly.
 */

export interface AdminUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: string
  status: string
  emailState: string
  locale: string | null
  disabledAt: string | null
  deletionRequestedAt: string | null
  deletionScheduledAt: string | null
  createdAt: string
}

export interface AdminUserFilters extends Record<string, string> {
  q: string
  status: string
  role: string
}

/** `all` is the select's "All …" entry; it never reaches the API or the URL. */
export const ADMIN_USER_FILTER_DEFAULTS: AdminUserFilters = {
  q: '',
  status: 'all',
  role: 'all',
}

/** The API caps a page at 100 rows. */
export const ADMIN_USER_PAGE_SIZES = [20, 50, 100]

/** What `GET /api/admin/users` filters by; any other value would be ignored there, so it is not sent. */
export const ADMIN_USER_STATUSES = ['active', 'disabled', 'merged', 'deletion_pending'] as const
export const ADMIN_USER_ROLES = ['admin', 'user'] as const

/** Plans an administrator can grant from the subscription drawer (`/api/admin/subscriptions/grant`). */
export const GRANTABLE_SUBSCRIPTION_PLANS = ['PRO', 'PLUS', 'TEAM', 'ENTERPRISE'] as const

/** Upper bound of the grant duration field; the API takes any positive number. */
export const SUBSCRIPTION_GRANT_MAX_DAYS = 3650

/** The credit adjustment API refuses more than this in one call. */
export const CREDIT_ADJUSTMENT_MAX = 1_000_000_000

export type Translate = (key: string, fallback: string) => string

/** vue-i18n's `t(key, named, plural)`: the plural form is picked from `plural`, the text from `named`. */
export type PluralTranslate = (key: string, named: Record<string, unknown>, plural: number) => string

/** vue-i18n's `t(key, named)`. */
export type NamedTranslate = (key: string, named: Record<string, unknown>) => string

export type AdminRequest = (path: string, options?: Record<string, unknown>) => Promise<unknown>

export interface AdminSelectOption {
  value: string
  label: string
}

/** `GET /api/admin/users` query. With no filters it is exactly `{ page, limit }`. */
export function buildUserQuery(params: AdminListFetchParams<AdminUserFilters>): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit }
  const q = params.filters.q.trim()
  if (q)
    query.q = q
  if ((ADMIN_USER_STATUSES as readonly string[]).includes(params.filters.status))
    query.status = params.filters.status
  if ((ADMIN_USER_ROLES as readonly string[]).includes(params.filters.role))
    query.role = params.filters.role
  return query
}

interface UserListResponse {
  users?: AdminUser[]
  pagination?: { total?: number }
}

/**
 * `useAdminList` options for the user list. The page passes `requestJson`; tests
 * pass a fake, so the request and error text under test are the ones the page
 * ships.
 */
export function createUserListOptions(
  request: AdminRequest,
  t: Translate,
): AdminListOptions<AdminUser, AdminUserFilters> {
  return {
    async fetch(params): Promise<AdminListPage<AdminUser>> {
      const response = await request('/api/admin/users', { query: buildUserQuery(params) }) as UserListResponse | null
      return {
        rows: Array.isArray(response?.users) ? response.users : [],
        total: Number(response?.pagination?.total) || 0,
      }
    },
    defaults: ADMIN_USER_FILTER_DEFAULTS,
    defaultLimit: 20,
    pageSizes: ADMIN_USER_PAGE_SIZES,
    debounceKeys: ['q'],
    errorFallback: () => t('dashboard.sections.users.errors.loadFailed', 'Failed to load users.'),
  }
}

/** Status labels, keyed by the stored value (`deletion_pending`, not the message key). */
export function buildUserStatusLabels(t: Translate): Record<string, string> {
  return {
    active: t('dashboard.sections.users.status.active', 'Active'),
    disabled: t('dashboard.sections.users.status.disabled', 'Disabled'),
    merged: t('dashboard.sections.users.status.merged', 'Merged'),
    deletion_pending: t('dashboard.sections.users.status.deletionPending', 'Pending deletion'),
  }
}

export function buildUserRoleLabels(t: Translate): Record<string, string> {
  return {
    admin: t('dashboard.sections.users.filters.roleAdmin', 'Admin'),
    user: t('dashboard.sections.users.filters.roleUser', 'User'),
  }
}

export function buildUserEmailStateLabels(t: Translate): Record<string, string> {
  return {
    verified: t('dashboard.sections.users.emailState.verified', 'Verified'),
    unverified: t('dashboard.sections.users.emailState.unverified', 'Unverified'),
    missing: t('dashboard.sections.users.emailState.missing', 'Missing'),
  }
}

export function buildUserLocaleLabels(t: Translate): Record<string, string> {
  return {
    zh: t('dashboard.sections.users.editor.localeZh', 'Chinese'),
    en: t('dashboard.sections.users.editor.localeEn', 'English'),
  }
}

/** "All statuses" first, then the four statuses the API filters by. */
export function buildUserStatusOptions(t: Translate): AdminSelectOption[] {
  const labels = buildUserStatusLabels(t)
  return [
    { value: 'all', label: t('dashboard.sections.users.filters.statusAll', 'All statuses') },
    ...ADMIN_USER_STATUSES.map(value => ({ value, label: labels[value]! })),
  ]
}

export function buildUserRoleOptions(t: Translate): AdminSelectOption[] {
  const labels = buildUserRoleLabels(t)
  return [
    { value: 'all', label: t('dashboard.sections.users.filters.roleAll', 'All roles') },
    ...ADMIN_USER_ROLES.map(value => ({ value, label: labels[value]! })),
  ]
}

export function userStatusTone(status: string): StatusTone {
  if (status === 'active')
    return 'success'
  if (status === 'disabled')
    return 'danger'
  if (status === 'deletion_pending')
    return 'warning'
  return 'muted'
}

export function userRoleTone(role: string): StatusTone {
  return role === 'admin' ? 'info' : 'muted'
}

/** A merged account or one waiting for deletion takes no profile, role, status or credit change. */
export function isUserLifecycleLocked(user: Pick<AdminUser, 'status'>): boolean {
  return user.status === 'merged' || user.status === 'deletion_pending'
}

export type UserAccessLock = 'merged' | 'deletionPending' | 'self'

/**
 * Why role and status cannot be changed for this account, or `null` when they
 * can. An administrator never edits their own access: demoting or disabling
 * oneself from this screen would lock the console behind them.
 */
export function userAccessLock(user: Pick<AdminUser, 'id' | 'status'>, currentUserId: string | null | undefined): UserAccessLock | null {
  if (user.status === 'merged')
    return 'merged'
  if (user.status === 'deletion_pending')
    return 'deletionPending'
  if (currentUserId && user.id === currentUserId)
    return 'self'
  return null
}

/** Only an active account other than the operator's own can enter the deletion lifecycle (the API's rule). */
export function canRequestUserDeletion(user: Pick<AdminUser, 'id' | 'status'>, currentUserId: string | null | undefined): boolean {
  return user.status === 'active' && Boolean(currentUserId) && user.id !== currentUserId
}

// ─── Subscription drawer ───────────────────────────────────────────────────

export interface AdminUserSubscription {
  plan: string
  activatedAt: string | null
  expiresAt: string | null
  isActive: boolean
}

export function normalizeUserSubscription(value: unknown): AdminUserSubscription | null {
  if (!value || typeof value !== 'object')
    return null
  const source = value as Partial<AdminUserSubscription>
  return {
    plan: typeof source.plan === 'string' && source.plan ? source.plan : 'FREE',
    activatedAt: typeof source.activatedAt === 'string' ? source.activatedAt : null,
    expiresAt: typeof source.expiresAt === 'string' ? source.expiresAt : null,
    isActive: source.isActive !== false,
  }
}

/** Form fields hold what the inputs emit: a number, or `''` while a number field is empty. */
export type NumberFieldValue = number | string | null | undefined

/** A whole number typed into a number field, or `null` for anything else (empty, fractional, text). */
export function readWholeNumber(value: NumberFieldValue): number | null {
  if (value === null || value === undefined)
    return null
  if (typeof value === 'string' && !value.trim())
    return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

export interface SubscriptionGrantInput {
  plan: string
  durationDays: NumberFieldValue
}

export type SubscriptionGrantCheck =
  | { ok: true, body: { plan: string, durationDays: number, expiresInDays: number } }
  | { ok: false, field: 'plan' | 'durationDays' }

/** The grant body the API takes; the duration is a whole number of days within the field's range. */
export function validateSubscriptionGrant(input: SubscriptionGrantInput): SubscriptionGrantCheck {
  if (!(GRANTABLE_SUBSCRIPTION_PLANS as readonly string[]).includes(input.plan))
    return { ok: false, field: 'plan' }
  const days = readWholeNumber(input.durationDays)
  if (days === null || days < 1 || days > SUBSCRIPTION_GRANT_MAX_DAYS)
    return { ok: false, field: 'durationDays' }
  return { ok: true, body: { plan: input.plan, durationDays: days, expiresInDays: days } }
}

// ─── Credits drawer ────────────────────────────────────────────────────────

export interface CreditBalance {
  quota: number
  used: number
}

export interface CreditLedgerEntry {
  id: string
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, unknown> | null
}

/**
 * What the drawer reads of the API's deduction limits (`limits` on GET / PATCH
 * credits, and the `data` of a `CREDITS_DEDUCT_LIMIT` refusal). The quota cannot
 * go below the plan's monthly allowance, nor below what was used this month;
 * `maxDeduct` is how much one deduction can take before reaching that floor.
 */
export interface CreditAdjustLimits {
  maxDeduct: number
}

/** One page of a user's credits as the drawer shows it. */
export interface AdminUserCredits {
  month: string
  /** The user's own balance this month; `null` when the API returned none. */
  balance: CreditBalance | null
  /** How much a deduction can take now; `null` when the API did not say. */
  limits: CreditAdjustLimits | null
  entries: CreditLedgerEntry[]
  page: number
  limit: number
  total: number
}

interface CreditsResponse {
  summary?: { month?: unknown, user?: { quota?: unknown, used?: unknown } | null }
  limits?: unknown
  ledger?: {
    entries?: unknown
    pagination?: { page?: unknown, limit?: unknown, total?: unknown }
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/** The deduction limit the API sent, or `null` when it is missing or not a whole number of credits. */
export function normalizeCreditAdjustLimits(value: unknown): CreditAdjustLimits | null {
  const maxDeduct = (value as { maxDeduct?: unknown } | null | undefined)?.maxDeduct
  return typeof maxDeduct === 'number' && Number.isInteger(maxDeduct) && maxDeduct >= 0 ? { maxDeduct } : null
}

/**
 * The limit a `CREDITS_DEDUCT_LIMIT` refusal (`PATCH …/credits`, 400) carries in
 * the H3 error's `data`, or `null` for any other failure. The refusal is worded
 * by the drawer (`creditDeductRefusalMessage`), not by the server's English
 * `statusMessage`.
 */
export function readCreditDeductRefusal(error: unknown): CreditAdjustLimits | null {
  const data = (error as { data?: { data?: { errorCode?: unknown } | null } | null } | null | undefined)?.data?.data
  return data?.errorCode === 'CREDITS_DEDUCT_LIMIT' ? normalizeCreditAdjustLimits(data) : null
}

/** `GET` and `PATCH /api/admin/users/:id/credits` answer with the same shape. */
export function normalizeUserCreditsResponse(response: unknown, fallbackLimit = 10): AdminUserCredits {
  const source = (response ?? {}) as CreditsResponse
  const balance = source.summary?.user
  const pagination = source.ledger?.pagination
  const page = Math.max(1, Math.floor(finiteNumber(pagination?.page, 1)))
  const limit = Math.max(1, Math.floor(finiteNumber(pagination?.limit, fallbackLimit)))
  return {
    month: typeof source.summary?.month === 'string' ? source.summary.month : '',
    balance: balance ? { quota: finiteNumber(balance.quota), used: finiteNumber(balance.used) } : null,
    limits: normalizeCreditAdjustLimits(source.limits),
    entries: Array.isArray(source.ledger?.entries) ? source.ledger.entries as CreditLedgerEntry[] : [],
    page,
    limit,
    total: Math.max(0, Math.floor(finiteNumber(pagination?.total))),
  }
}

export function creditRemaining(balance: CreditBalance | null): number {
  return balance ? Math.max(0, balance.quota - balance.used) : 0
}

/** Share of the quota used, `0`–`1`. */
export function creditUsageRatio(balance: CreditBalance | null): number {
  if (!balance || balance.quota <= 0)
    return 0
  return Math.min(1, Math.max(0, balance.used / balance.quota))
}

/** Tokens a usage entry billed for, when the ledger recorded them. */
export function ledgerEntryTokens(entry: Pick<CreditLedgerEntry, 'metadata'>): number | null {
  const tokens = Number(entry.metadata?.tokens)
  return entry.metadata?.tokens !== undefined && entry.metadata?.tokens !== null && Number.isFinite(tokens) && tokens > 0
    ? tokens
    : null
}

/**
 * The ledger's reason cell: the reason, and the tokens a usage entry billed for
 * ("chat · 1 token", "chat · 1,234 tokens"). The count is printed in the reader's
 * locale; the plural form is chosen from the number itself.
 */
export function creditLedgerReason(
  entry: Pick<CreditLedgerEntry, 'reason' | 'metadata'>,
  t: PluralTranslate,
  formatNumber: (value: number) => string,
): string {
  const reason = entry.reason || '—'
  const tokens = ledgerEntryTokens(entry)
  return tokens === null
    ? reason
    : `${reason} · ${t('dashboard.sections.users.credits.tokens', { count: formatNumber(tokens) }, tokens)}`
}

export type CreditDirection = 'add' | 'subtract'

export interface CreditAdjustmentInput {
  direction: CreditDirection
  amount: NumberFieldValue
  reason: string
}

export type CreditAdjustmentCheck =
  | { ok: true, body: { amount: number, direction: CreditDirection, reason?: string } }
  | { ok: false }

/**
 * The adjustment body the API takes: a whole, positive amount up to the API's
 * single-adjustment limit, and the reason only when one was written (the API
 * then records `admin-credit` / `admin-debit`).
 */
export function validateCreditAdjustment(input: CreditAdjustmentInput): CreditAdjustmentCheck {
  const amount = readWholeNumber(input.amount)
  if (amount === null || amount < 1 || amount > CREDIT_ADJUSTMENT_MAX)
    return { ok: false }
  if (input.direction !== 'add' && input.direction !== 'subtract')
    return { ok: false }
  const reason = input.reason.trim()
  return { ok: true, body: reason ? { amount, direction: input.direction, reason } : { amount, direction: input.direction } }
}

export interface CreditAmountHint {
  /** Under the amount field. */
  text: string
  /** The amount cannot be deducted: the hint turns red and Apply stays disabled. */
  invalid: boolean
}

/**
 * The amount field's hint while subtracting: the most one deduction can take,
 * or that nothing can once the quota is at its floor. The API refuses a larger
 * deduction whole, so the form does not send one. `null` while adding, and
 * until the API has said what the limit is.
 */
export function creditDeductHint(
  input: Pick<CreditAdjustmentInput, 'direction' | 'amount'>,
  limits: CreditAdjustLimits | null,
  t: NamedTranslate,
  formatNumber: (value: number) => string,
): CreditAmountHint | null {
  if (input.direction !== 'subtract' || !limits)
    return null
  if (limits.maxDeduct < 1)
    return { text: t('dashboard.sections.users.credits.deductHintAtFloor', {}), invalid: true }
  // An empty or fractional amount is `validateCreditAdjustment`'s to report.
  const amount = readWholeNumber(input.amount)
  return {
    text: t('dashboard.sections.users.credits.deductHint', { max: formatNumber(limits.maxDeduct) }),
    invalid: amount !== null && amount > limits.maxDeduct,
  }
}

/** The warning for a deduction the API refused at the floor, with the limit it now allows. */
export function creditDeductRefusalMessage(
  maxDeduct: number,
  t: NamedTranslate,
  formatNumber: (value: number) => string,
): string {
  return maxDeduct < 1
    ? t('dashboard.sections.users.credits.deductRefusedAtFloor', {})
    : t('dashboard.sections.users.credits.deductRefused', { max: formatNumber(maxDeduct) })
}
