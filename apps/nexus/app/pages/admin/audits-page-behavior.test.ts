import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref } from 'vue'
import type { EffectScope, Ref } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import {
  ADMIN_AUDIT_FILTER_DEFAULTS,
  auditSummaryText,
  buildAuditActionLabels,
  buildAuditActionOptions,
  buildAuditExportUrl,
  buildAuditQuery,
  createAuditListOptions,
  formatAuditMetadata,
  summarizeAudit,
} from '~/utils/admin-audits'
import type { AdminAuditEntry, AuditRequest } from '~/utils/admin-audits'

/**
 * Behaviour of `/admin/audits`, tested through the pieces the page is built
 * from: `createAuditListOptions` handed to `useAdminList` (exactly what the page
 * does with `requestJson`), and the label / summary helpers in
 * `utils/admin-audits.ts`. The page script itself is now layout only.
 *
 * Every assertion of the previous test, which compiled the page's own script,
 * is kept here:
 *
 * | before                                                          | now |
 * | --------------------------------------------------------------- | --- |
 * | failure shows 'Failed to load audit logs.', never `/api/admin/audits` | `list errors` › transport string |
 * | a server-supplied `data.message` wins                           | `list errors` › server message |
 * | rows are dropped on failure                                     | `list errors` › stale rows |
 * | the action column re-translates on a locale switch              | `action vocabulary` › locale switch |
 * | the dropdown is derived from the label table                    | `action vocabulary` › dropdown |
 * | paging stops at both ends (goPrev / goNext)                     | `paging` › both ends — TxPagination owns the buttons now, `useAdminList.setPage` refuses a page outside 1…last |
 * | a filter change goes back to page 1                             | `paging` › filter change |
 * | blank filters are not sent; the first query is exactly `{ page: 1, limit: 20 }` | `request` › defaults |
 */

type Query = Record<string, string | string[] | undefined>

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/audits', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

/** Mirrors vue-i18n: a loaded locale wins, the inline fallback is only for a missing key. */
function createT(locale: Ref<string>) {
  return (key: string, fallback: string) => (locale.value === 'zh' ? `zh:${key}` : fallback)
}

function auditPage(total = 61, count = 20) {
  return {
    audits: Array.from({ length: count }, (_, index) => ({ id: `a${index}`, action: 'user.role.update' })),
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  }
}

function mountAuditList(request: AuditRequest, query: Query = {}) {
  installRoute(query)
  scope = effectScope()
  const t = createT(ref('en'))
  return scope.run(() => useAdminList(createAuditListOptions(request, t)))!
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('admin audits: request', () => {
  it('sends exactly { page: 1, limit: 20 } when nothing is filtered', async () => {
    const request = vi.fn(async (_path: string, _options: { query: Record<string, string | number> }) => auditPage())
    mountAuditList(request)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe('/api/admin/audits')
    expect(request.mock.calls[0]![1].query).toEqual({ page: 1, limit: 20 })
  })

  it('passes the four filters the API reads, and only those that are set', () => {
    expect(buildAuditQuery({ page: 2, limit: 50, filters: { ...ADMIN_AUDIT_FILTER_DEFAULTS, q: '  ada  ' } }))
      .toEqual({ page: 2, limit: 50, q: 'ada' })
    expect(buildAuditQuery({
      page: 1,
      limit: 20,
      filters: { q: '', action: 'audit.export', targetType: 'user', adminUserId: 'usr_1' },
    })).toEqual({ page: 1, limit: 20, action: 'audit.export', targetType: 'user', adminUserId: 'usr_1' })
  })

  it('takes targetType and adminUserId from the URL', async () => {
    const request = vi.fn(async (_path: string, _options: { query: Record<string, string | number> }) => auditPage())
    const list = mountAuditList(request, { targetType: 'user', adminUserId: 'usr_1', page: '2' })
    await settle()

    expect(request.mock.calls[0]![1].query).toEqual({ page: 2, limit: 20, targetType: 'user', adminUserId: 'usr_1' })
    expect(list.hasActiveFilters.value).toBe(true)
  })

  it('exports with the applied filters and never the page', () => {
    expect(buildAuditExportUrl(ADMIN_AUDIT_FILTER_DEFAULTS)).toBe('/api/admin/audits/export')
    expect(buildAuditExportUrl({ q: 'ada', action: 'all', targetType: 'user', adminUserId: '' }))
      .toBe('/api/admin/audits/export?q=ada&targetType=user')
  })
})

describe('admin audits: list errors', () => {
  it('shows the localized fallback instead of the transport string', async () => {
    // ofetch rejects with '[GET] "/api/admin/audits?page=1": <no response> Failed
    // to fetch' on err.message. Surfacing that leaked the API path to admins and
    // meant the localized fallback was never reached.
    const request = vi.fn(async () => {
      throw new Error('[GET] "/api/admin/audits?page=1&limit=20": <no response> Failed to fetch')
    })
    const list = mountAuditList(request)
    await settle()

    expect(list.error.value).toBe('Failed to load audit logs.')
    expect(list.error.value).not.toMatch(/\/api\/admin\/audits/)
  })

  it('prefers a server message when the API explains itself', async () => {
    const request = vi.fn(async () => {
      throw Object.assign(new Error('ignored transport text'), { data: { message: 'Audit store unavailable.' } })
    })
    const list = mountAuditList(request)
    await settle()

    expect(list.error.value).toBe('Audit store unavailable.')
  })

  it('drops the previous rows on failure, so a stale page is never captioned by a fresh error', async () => {
    let shouldFail = false
    const request = vi.fn(async () => {
      if (shouldFail)
        throw new Error('boom')
      return auditPage(3, 3)
    })
    const list = mountAuditList(request)
    await settle()
    expect(list.rows.value).toHaveLength(3)

    shouldFail = true
    await list.refresh()

    expect(list.error.value).toBe('Failed to load audit logs.')
    expect(list.rows.value).toEqual([])
  })
})

describe('admin audits: paging', () => {
  it('stops at both ends of the result set', async () => {
    const request = vi.fn(async (_path: string, options: { query: Record<string, string | number> }) => ({
      ...auditPage(61),
      pagination: { page: options.query.page, limit: 20, total: 61, totalPages: 4 },
    }))
    const list = mountAuditList(request)
    await settle()

    list.setPage(0)
    await settle()
    expect(list.page.value).toBe(1)

    list.setPage(4)
    await settle()
    expect(list.page.value).toBe(4)

    // Past the last page: refused, no request.
    const calls = request.mock.calls.length
    list.setPage(5)
    await settle()
    expect(list.page.value).toBe(4)
    expect(request).toHaveBeenCalledTimes(calls)
  })

  it('returns to the first page when a filter narrows the result set', async () => {
    const request = vi.fn(async (_path: string, _options: { query: Record<string, string | number> }) => auditPage(61))
    const list = mountAuditList(request)
    await settle()

    list.setPage(2)
    await settle()
    expect(list.page.value).toBe(2)

    list.filters.action = 'audit.export'
    await settle()

    expect(list.page.value).toBe(1)
    expect(request.mock.calls.at(-1)![1].query).toMatchObject({ page: 1, action: 'audit.export' })
  })
})

describe('admin audits: action vocabulary', () => {
  it('re-translates the action column when the locale changes', () => {
    // A plain object built once during setup followed a locale switch in the
    // dropdown and not in the table column.
    const locale = ref('en')
    const t = createT(locale)
    const labels = computed(() => buildAuditActionLabels(t))

    expect(labels.value['user.role.update']).toBe('User role updated')
    locale.value = 'zh'
    expect(labels.value['user.role.update']).toBe('zh:dashboard.sections.audits.actions.userRole')
  })

  it('derives the dropdown from the label table so the two cannot drift apart', () => {
    const t = createT(ref('en'))
    const labels = buildAuditActionLabels(t)
    const options = buildAuditActionOptions(t, labels)

    expect(options[0]).toEqual({ value: 'all', label: 'All actions' })
    expect(options.slice(1).map(option => option.value)).toEqual(Object.keys(labels))
    for (const option of options.slice(1))
      expect(option.label).toBe(labels[option.value])
  })

  it('labels the agent tool decisions still in the log', () => {
    const labels = buildAuditActionLabels(createT(ref('en')))
    expect(labels['intelligence.tool.approve']).toBe('Agent tool call approved')
    expect(labels['intelligence.tool.reject']).toBe('Agent tool call rejected')
  })
})

describe('admin audits: summary column', () => {
  const labels = buildAuditActionLabels(createT(ref('en')))
  const options = { labels, formatDate: (value: string) => `date(${value})` }

  function summary(action: string, metadata: Record<string, unknown> | null) {
    return auditSummaryText(summarizeAudit({ action, metadata }, options))
  }

  it('keeps the five dedicated summaries', () => {
    expect(summary('user.role.update', { before: { role: 'user' }, after: { role: 'admin' } })).toBe('user → admin')
    expect(summary('user.status.update', { before: { status: 'active' } })).toBe('active → —')
    expect(summary('subscription.grant', { plan: 'PRO', expiresAt: '2026-12-01' })).toBe('PRO · date(2026-12-01)')
    expect(summary('activation_code.revoke', { before: { status: 'active' } })).toBe('Activation code revoked')
    expect(summary('audit.export', { limit: 5000 })).toBe('Audit exported')
  })

  it('shows the first scalar fields instead of the whole metadata as JSON', () => {
    const text = summary('intelligence.tool.approve', {
      approved: true,
      sessionId: 'sess_1',
      toolId: 'web.search',
      riskLevel: 'low',
      nested: { a: 1 },
    })
    expect(text).toBe('approved: true · sessionId: sess_1 · toolId: web.search')
    expect(text).not.toContain('{')
  })

  it('cuts a long value and says nothing when there is nothing scalar', () => {
    expect(summary('doc_comment.delete', { path: 'x'.repeat(80) })).toMatch(/^path: x{47}…$/)
    expect(summary('user.profile.update', { before: { name: 'a' }, after: { name: 'b' } })).toBe('—')
    expect(summary('unknown.action', null)).toBe('—')
  })

  it('prints the full metadata for the drawer', () => {
    const metadata = { before: { role: 'user' }, after: { role: 'admin' } }
    expect(formatAuditMetadata(metadata)).toBe(JSON.stringify(metadata, null, 2))
    expect(formatAuditMetadata(null)).toBeNull()
    expect(formatAuditMetadata({})).toBeNull()
  })

  it('reads the entry shape the API returns', () => {
    const entry: Pick<AdminAuditEntry, 'action' | 'metadata'> = { action: 'user.role.update', metadata: null }
    expect(summarizeAudit(entry, options)).toEqual({ text: null, chips: [] })
  })

  it('falls back to the field summary when a dedicated summary has nothing on either side', () => {
    // Seeded demo rows carry no before/after; `— → —` used to fill the column.
    expect(summary('user.status.update', { source: 'nexus-local-demo', localOnly: true })).toBe('source: nexus-local-demo · localOnly: true')
    expect(summary('subscription.grant', { expiresAt: '' })).toBe('—')
    expect(summary('subscription.grant', { expiresAt: '2026-12-01' })).toBe('— · date(2026-12-01)')
  })
})
