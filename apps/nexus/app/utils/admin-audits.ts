import type { AdminListFetchParams, AdminListOptions, AdminListPage } from '~/composables/useAdminList'

/**
 * Admin action audit log (`/admin/audits`): the action vocabulary, the request
 * the list sends, and the one-line summary each row shows. Pure, so the page
 * stays a layout and these rules are tested directly.
 */

export interface AdminAuditEntry {
  id: string
  adminUserId: string
  adminName: string | null
  adminEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AdminAuditFilters extends Record<string, string> {
  q: string
  action: string
  targetType: string
  adminUserId: string
}

/** `action: 'all'` is the select's "All actions" entry; it never reaches the API or the URL. */
export const ADMIN_AUDIT_FILTER_DEFAULTS: AdminAuditFilters = {
  q: '',
  action: 'all',
  targetType: '',
  adminUserId: '',
}

/** The API caps a page at 100 rows. */
export const ADMIN_AUDIT_PAGE_SIZES = [20, 50, 100]

type Translate = (key: string, fallback: string) => string

/**
 * Every action the server writes, labelled. The filter dropdown is derived from
 * this table, so an action is either findable and readable or visibly raw — the
 * two cannot drift apart. Built inside a computed by the page, so a locale
 * switch re-translates both the column and the dropdown.
 */
export function buildAuditActionLabels(t: Translate): Record<string, string> {
  return {
    'user.role.update': t('dashboard.sections.audits.actions.userRole', 'User role updated'),
    'user.status.update': t('dashboard.sections.audits.actions.userStatus', 'User status updated'),
    'user.deletion.request': t('dashboard.sections.audits.actions.userDeletionRequest', 'User deletion requested'),
    'subscription.grant': t('dashboard.sections.audits.actions.subscriptionGrant', 'Subscription granted'),
    'activation_code.revoke': t('dashboard.sections.audits.actions.codeRevoke', 'Activation code revoked'),
    'audit.export': t('dashboard.sections.audits.actions.auditExport', 'Audit exported'),
    'user.role.bootstrap': t('dashboard.sections.audits.actions.userRoleBootstrap', 'Administrator bootstrapped'),
    'user.profile.update': t('dashboard.sections.audits.actions.userProfileUpdate', 'User profile updated'),
    'user.credits.adjust': t('dashboard.sections.audits.actions.userCreditsAdjust', 'User credits adjusted'),
    'activation_code.generate': t('dashboard.sections.audits.actions.codeGenerate', 'Activation codes generated'),
    'doc_comment.delete': t('dashboard.sections.audits.actions.docCommentDelete', 'Doc comment deleted'),
    'store_review.status.update': t('dashboard.sections.audits.actions.storeReviewStatus', 'Store review status updated'),
    'plugin_scan_waiver.create': t('dashboard.sections.audits.actions.scanWaiverCreate', 'Plugin scan waiver created'),
    'plugin_scan_waiver.revoke': t('dashboard.sections.audits.actions.scanWaiverRevoke', 'Plugin scan waiver revoked'),
    'maintenance.telemetry_retention.run': t('dashboard.sections.audits.actions.telemetryRetentionRun', 'Telemetry retention run'),
    'intelligence.prompt.upsert': t('dashboard.sections.audits.actions.promptUpsert', 'Agent prompt saved'),
    'intelligence.prompt.delete': t('dashboard.sections.audits.actions.promptDelete', 'Agent prompt deleted'),
    'intelligence.prompt-binding.upsert': t('dashboard.sections.audits.actions.promptBindingUpsert', 'Agent prompt binding saved'),
    'intelligence.prompt-binding.delete': t('dashboard.sections.audits.actions.promptBindingDelete', 'Agent prompt binding deleted'),
    // Written by the agent tool-approval endpoint; rows already in the log
    // rendered as their raw ids and could not be filtered for.
    'intelligence.tool.approve': t('dashboard.sections.audits.actions.toolApprove', 'Agent tool call approved'),
    'intelligence.tool.reject': t('dashboard.sections.audits.actions.toolReject', 'Agent tool call rejected'),
    'release.evidence.run.create': t('dashboard.sections.audits.actions.evidenceRunCreate', 'Release evidence run created'),
    'release.evidence.item.upsert': t('dashboard.sections.audits.actions.evidenceItemUpsert', 'Release evidence item saved'),
    'release.evidence.doc-guard.record': t('dashboard.sections.audits.actions.evidenceDocGuard', 'Release doc guard recorded'),
    'credits.pricing.update': t('dashboard.sections.audits.actions.creditsPricingUpdate', 'Credit price updated'),
  }
}

export interface AuditActionOption {
  value: string
  label: string
}

/** "All actions" first, then the label table in its own order. */
export function buildAuditActionOptions(t: Translate, labels: Record<string, string>): AuditActionOption[] {
  return [
    { value: 'all', label: t('dashboard.sections.audits.filters.actionAll', 'All actions') },
    ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  ]
}

/** The filters as the API reads them: blank and "all" are left out rather than sent empty. */
function auditFilterParams(filters: AdminAuditFilters): Record<string, string> {
  const params: Record<string, string> = {}
  const q = filters.q.trim()
  if (q)
    params.q = q
  if (filters.action && filters.action !== 'all')
    params.action = filters.action
  if (filters.targetType.trim())
    params.targetType = filters.targetType.trim()
  if (filters.adminUserId.trim())
    params.adminUserId = filters.adminUserId.trim()
  return params
}

/** `GET /api/admin/audits` query. With no filters it is exactly `{ page, limit }`. */
export function buildAuditQuery(params: AdminListFetchParams<AdminAuditFilters>): Record<string, string | number> {
  return {
    page: params.page,
    limit: params.limit,
    ...auditFilterParams(params.filters),
  }
}

/** The CSV export takes the filters the table is showing, never its page. */
export function buildAuditExportUrl(filters: AdminAuditFilters): string {
  const search = new URLSearchParams(auditFilterParams(filters)).toString()
  return search ? `/api/admin/audits/export?${search}` : '/api/admin/audits/export'
}

interface AuditListResponse {
  audits?: AdminAuditEntry[]
  pagination?: { total?: number }
}

export type AuditRequest = (path: string, options: { query: Record<string, string | number> }) => Promise<unknown>

/**
 * `useAdminList` options for the audit log. The page passes `requestJson`; tests
 * pass a fake, so the request, the error text and the paging behaviour under
 * test are the ones the page ships.
 */
export function createAuditListOptions(
  request: AuditRequest,
  t: Translate,
): AdminListOptions<AdminAuditEntry, AdminAuditFilters> {
  return {
    async fetch(params): Promise<AdminListPage<AdminAuditEntry>> {
      const response = await request('/api/admin/audits', { query: buildAuditQuery(params) }) as AuditListResponse | null
      return {
        rows: Array.isArray(response?.audits) ? response.audits : [],
        total: Number(response?.pagination?.total) || 0,
      }
    },
    defaults: ADMIN_AUDIT_FILTER_DEFAULTS,
    defaultLimit: 20,
    pageSizes: ADMIN_AUDIT_PAGE_SIZES,
    debounceKeys: ['q'],
    errorFallback: () => t('dashboard.sections.audits.errors.loadFailed', 'Failed to load audit logs.'),
  }
}

export interface AuditSummaryChip {
  key: string
  value: string
}

export interface AuditSummary {
  /** Set for the actions with a dedicated summary. */
  text: string | null
  /** Otherwise: the first scalar metadata fields. */
  chips: AuditSummaryChip[]
}

const SUMMARY_CHIP_LIMIT = 3
const SUMMARY_VALUE_LIMIT = 48

function readPath(source: unknown, ...path: string[]): unknown {
  let current = source
  for (const key of path) {
    if (!current || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

const MISSING = '—'

function present(value: unknown): string | null {
  if (value === null || value === undefined || value === '')
    return null
  return String(value)
}

/**
 * `left <sep> right` with `—` standing in for one missing side. When both sides
 * are missing there is nothing worth printing (`— → —` reads as noise), so it
 * returns null and the caller falls back to the generic field summary.
 */
function pair(left: string | null, separator: string, right: string | null): string | null {
  if (left === null && right === null)
    return null
  return `${left ?? MISSING}${separator}${right ?? MISSING}`
}

function truncate(value: string): string {
  return value.length > SUMMARY_VALUE_LIMIT ? `${value.slice(0, SUMMARY_VALUE_LIMIT - 1)}…` : value
}

/**
 * The summary column. Five actions keep the dedicated wording they had; every
 * other action shows up to three scalar metadata fields as `key: value` instead
 * of the whole metadata object as JSON, which was what made the column
 * unreadable. The full metadata is one click away in the detail drawer.
 */
export function summarizeAudit(
  entry: Pick<AdminAuditEntry, 'action' | 'metadata'>,
  options: { labels: Record<string, string>, formatDate: (value: string) => string },
): AuditSummary {
  const meta = entry.metadata
  let dedicated: string | null = null
  switch (entry.action) {
    case 'user.role.update':
      dedicated = pair(present(readPath(meta, 'before', 'role')), ' → ', present(readPath(meta, 'after', 'role')))
      break
    case 'user.status.update':
      dedicated = pair(present(readPath(meta, 'before', 'status')), ' → ', present(readPath(meta, 'after', 'status')))
      break
    case 'subscription.grant': {
      const expiresAt = readPath(meta, 'expiresAt')
      dedicated = pair(
        present(readPath(meta, 'plan')),
        ' · ',
        typeof expiresAt === 'string' && expiresAt ? options.formatDate(expiresAt) : null,
      )
      break
    }
    case 'activation_code.revoke':
    case 'audit.export':
      return { text: options.labels[entry.action] ?? entry.action, chips: [] }
  }
  if (dedicated)
    return { text: dedicated, chips: [] }

  const chips: AuditSummaryChip[] = []
  if (meta && typeof meta === 'object') {
    for (const [key, value] of Object.entries(meta)) {
      if (chips.length >= SUMMARY_CHIP_LIMIT)
        break
      if (typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean')
        chips.push({ key, value: truncate(String(value)) })
    }
  }
  return { text: null, chips }
}

/** The summary as one line; `—` when there is nothing to say. */
export function auditSummaryText(summary: AuditSummary): string {
  if (summary.text)
    return summary.text
  if (!summary.chips.length)
    return '—'
  return summary.chips.map(chip => `${chip.key}: ${chip.value}`).join(' · ')
}

/** The metadata as the drawer prints it: indented JSON, or `null` when there is none. */
export function formatAuditMetadata(metadata: AdminAuditEntry['metadata']): string | null {
  if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length)
    return null
  return JSON.stringify(metadata, null, 2)
}
