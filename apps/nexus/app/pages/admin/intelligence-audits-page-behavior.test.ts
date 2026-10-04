import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import type { EffectScope } from 'vue'
import { createAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  auditHttpStatus,
  auditProviderName,
  auditResponseSnippet,
  auditResultBadgeText,
  auditResultTitle,
  buildAuditMetadataEntries,
  buildIntelligenceAuditQuery,
  buildIntelligenceProviderTypeLabels,
  createIntelligenceAuditListOptions,
  formatIntelligenceLatency,
  INTELLIGENCE_AUDIT_FILTER_DEFAULTS,
  intelligenceProviderTypeLabel,
} from '~/utils/admin-intelligence'
import type { IntelligenceRequest, IntelligenceTranslate } from '~/utils/admin-intelligence'
import { createRouteI18n } from '../../../test/helpers/route-i18n'
import type { RouteI18nLocale } from '../../../test/helpers/route-i18n'

/**
 * Behaviour of `/admin/intelligence-audits`, tested through the pieces the page
 * is built from: `createIntelligenceAuditListOptions` handed to `useAdminList`
 * (exactly what the page does with `requestJson`), and the cell and drawer
 * helpers in `utils/admin-intelligence.ts`, rendered with the real messages.
 *
 * | before (IntelligenceAuditsPanel.vue)                        | now |
 * | ----------------------------------------------------------- | --- |
 * | user id applied on "Filter" only; two requests from page > 1 | `filters` › debounce, page 1, one request |
 * | no provider filter                                           | `filters` › provider id |
 * | 20 rows, page only, nothing in the URL                       | `request` › URL, page sizes |
 * | `toLocaleString()` time, `{n}ms` latency                     | `cells` › latency |
 * | `intelligence.types.<type>` raw for dashscope / tencent-cloud | `cells` › type labels |
 * | seven metadata keys inline, the rest never shown             | `drawer` › metadata, every key, no JSON |
 */

type Query = Record<string, string | string[] | undefined>

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/intelligence-audits', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

/** English fallbacks: the list options only read their error fallback through it. */
const en = (_key: string, fallback: string) => fallback

function auditPage(total = 61, count = 20) {
  return {
    audits: Array.from({ length: count }, (_, index) => ({ id: `ia_${index}`, success: true })),
    total,
    page: 1,
    pageSize: 20,
  }
}

function mountAuditList(request: IntelligenceRequest, query: Query = {}) {
  const route = installRoute(query)
  scope = effectScope()
  const list = scope.run(() => useAdminList(createIntelligenceAuditListOptions(request, en)))!
  return { list, route }
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

async function i18nFor(locale: RouteI18nLocale) {
  const i18n = await createRouteI18n(locale)
  const t = ((key: string, second: string | Record<string, unknown>) => i18n.t(key, second as Record<string, unknown>)) as IntelligenceTranslate
  const format = createAdminFormat(() => locale, (key, named) => i18n.t(key, named))
  return { t, format }
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

describe('AI call audits: request', () => {
  it('sends exactly { page: 1, limit: 20 } when nothing is filtered', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage())
    const { list } = mountAuditList(request)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe('/api/dashboard/intelligence/audits')
    expect(request.mock.calls[0]![1]!.query).toEqual({ page: 1, limit: 20 })
    expect(list.rows.value).toHaveLength(20)
    expect(list.total.value).toBe(61)
  })

  it('sends both filters trimmed, and only when they are set', () => {
    expect(buildIntelligenceAuditQuery({ page: 2, limit: 50, filters: { ...INTELLIGENCE_AUDIT_FILTER_DEFAULTS, userId: '  usr_1 ' } }))
      .toEqual({ page: 2, limit: 50, userId: 'usr_1' })
    expect(buildIntelligenceAuditQuery({ page: 1, limit: 20, filters: { userId: '', providerId: 'prv_tencent' } }))
      .toEqual({ page: 1, limit: 20, providerId: 'prv_tencent' })
    expect(buildIntelligenceAuditQuery({ page: 1, limit: 20, filters: { userId: '   ', providerId: '  ' } }))
      .toEqual({ page: 1, limit: 20 })
  })

  it('restores page, page size and both filters from a shared link', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage(400, 50))
    const { list } = mountAuditList(request, { userId: 'usr_1', providerId: 'prv_1', page: '2', limit: '50' })
    await settle()

    expect(request.mock.calls[0]![1]!.query).toEqual({ page: 2, limit: 50, userId: 'usr_1', providerId: 'prv_1' })
    expect(list.filters.userId).toBe('usr_1')
    expect(list.filters.providerId).toBe('prv_1')
    expect(list.hasActiveFilters.value).toBe(true)
  })

  it('offers 20, 50 and 100 rows a page, and nothing else', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage())
    const { list } = mountAuditList(request, { limit: '30' })
    await settle()

    expect(list.pageSizes).toEqual([20, 50, 100])
    expect(request.mock.calls[0]![1]!.query).toEqual({ page: 1, limit: 20 })
  })

  it('writes only what differs from the defaults into the URL', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage(400, 50))
    const { list, route } = mountAuditList(request)
    await settle()

    list.setLimit(50)
    await settle()
    list.setPage(2)
    await settle()
    expect(route.query).toEqual({ limit: '50', page: '2' })
    expect(request.mock.calls.at(-1)![1]!.query).toEqual({ page: 2, limit: 50 })
  })

  it('shows the localized fallback instead of the transport string', async () => {
    const request = vi.fn(async () => {
      throw new Error('[GET] "/api/dashboard/intelligence/audits?page=1&limit=20": <no response> Failed to fetch')
    })
    const { list } = mountAuditList(request)
    await settle()

    expect(list.error.value).toBe('Failed to load audit logs.')
    expect(list.error.value).not.toContain('/api/')
  })
})

describe('AI call audits: filters', () => {
  it('applies a typed user id 300 ms after the last keystroke, back on page 1', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage())
    const { list, route } = mountAuditList(request)
    await settle()
    list.setPage(2)
    await settle()
    expect(list.page.value).toBe(2)
    request.mockClear()

    list.filters.userId = 'usr'
    await settle()
    list.filters.userId = 'usr_1'
    await settle()
    vi.advanceTimersByTime(299)
    await settle()
    expect(request).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![1]!.query).toEqual({ page: 1, limit: 20, userId: 'usr_1' })
    expect(list.page.value).toBe(1)
    expect(route.query).toEqual({ userId: 'usr_1' })
  })

  it('debounces the provider id the same way', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage())
    const { list, route } = mountAuditList(request)
    await settle()
    request.mockClear()

    list.filters.providerId = 'prv_1'
    await settle()
    expect(request).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    await settle()
    expect(request.mock.calls[0]![1]!.query).toEqual({ page: 1, limit: 20, providerId: 'prv_1' })
    expect(route.query).toEqual({ providerId: 'prv_1' })
  })

  it('tells "nothing matches" from "nothing yet", and clears both filters at once', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => auditPage(0, 0))
    const { list, route } = mountAuditList(request, { userId: 'usr_404' })
    await settle()

    // The table shows its "no matches" state, with "Clear filters", while a filter is set.
    expect(list.rows.value).toEqual([])
    expect(list.hasActiveFilters.value).toBe(true)

    list.clearFilters()
    await settle()
    expect(list.hasActiveFilters.value).toBe(false)
    expect(route.query).toEqual({})
    expect(request.mock.calls.at(-1)![1]!.query).toEqual({ page: 1, limit: 20 })
  })
})

describe('AI call audits: cells', () => {
  const TYPES = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom', 'dashscope', 'tencent-cloud', 'exchange-rate']

  it('names every provider type in both languages, the three registry vendors included', async () => {
    for (const locale of ['en', 'zh'] as const) {
      const { t } = await i18nFor(locale)
      const labels = buildIntelligenceProviderTypeLabels(t)
      expect(Object.keys(labels)).toEqual(TYPES)
      for (const type of TYPES) {
        const label = intelligenceProviderTypeLabel(type, labels)
        expect(label.trim(), `${locale} ${type}`).not.toBe('')
        expect(label, `${locale} ${type}`).not.toContain('intelligence.types')
      }
    }
    const zh = buildIntelligenceProviderTypeLabels((await i18nFor('zh')).t)
    expect([zh.dashscope, zh['tencent-cloud'], zh['exchange-rate']]).toEqual(['百炼 / DashScope', '腾讯云', '汇率'])
    const enLabels = buildIntelligenceProviderTypeLabels((await i18nFor('en')).t)
    expect([enLabels.dashscope, enLabels['tencent-cloud'], enLabels['exchange-rate']]).toEqual(['DashScope / Model Studio', 'Tencent Cloud', 'Exchange rate'])
  })

  it('shows an unknown type as itself, and a missing one as a dash', async () => {
    const labels = buildIntelligenceProviderTypeLabels((await i18nFor('en')).t)
    expect(intelligenceProviderTypeLabel('volcengine', labels)).toBe('volcengine')
    expect(intelligenceProviderTypeLabel('', labels)).toBe('—')
    expect(intelligenceProviderTypeLabel('toString', labels)).toBe('toString')
  })

  it('names the provider, or its type when the row has no name', async () => {
    const labels = buildIntelligenceProviderTypeLabels((await i18nFor('zh')).t)
    expect(auditProviderName({ providerName: 'Team OpenAI', providerType: 'openai' }, labels)).toBe('Team OpenAI')
    expect(auditProviderName({ providerName: null, providerType: 'tencent-cloud' }, labels)).toBe('腾讯云')
    expect(auditProviderName({ providerName: '  ', providerType: 'exchange-rate' }, labels)).toBe('汇率')
  })

  it('prints latency as exact grouped milliseconds', async () => {
    const { t, format } = await i18nFor('en')
    expect(formatIntelligenceLatency(1850, format, t)).toBe('1,850 ms')
    expect(formatIntelligenceLatency(12, format, t)).toBe('12 ms')
    expect(formatIntelligenceLatency(null, format, t)).toBe('—')
    const zh = await i18nFor('zh')
    expect(formatIntelligenceLatency(120000, zh.format, zh.t)).toBe('120,000 ms')
  })

  it('puts the result in words beside its code on the badge', async () => {
    // The column is 120px: English says OK and Fail so word and code fit inside it.
    const zh = await i18nFor('zh')
    expect(auditResultBadgeText({ success: true, status: 200 }, zh.t)).toBe('成功 · 200')
    expect(auditResultBadgeText({ success: false, status: 500 }, zh.t)).toBe('失败 · 500')
    const enT = (await i18nFor('en')).t
    expect(auditResultBadgeText({ success: true, status: 200 }, enT)).toBe('OK · 200')
    expect(auditResultBadgeText({ success: false, status: 429 }, enT)).toBe('Fail · 429')
    expect(auditResultBadgeText({ success: false, status: null }, enT)).toBe('Failed')
  })

  it('words the result with its status code', async () => {
    const zh = await i18nFor('zh')
    expect(auditResultTitle({ success: true, status: 200 }, zh.t)).toBe('成功 · HTTP 200')
    expect(auditResultTitle({ success: false, status: 429 }, zh.t)).toBe('失败 · HTTP 429')
    const enT = (await i18nFor('en')).t
    expect(auditResultTitle({ success: false, status: null }, enT)).toBe('Failed')
    expect(auditHttpStatus({ status: null }, enT)).toBeNull()
  })
})

describe('AI call audits: drawer', () => {
  const METADATA = {
    source: 'intelligence-agent',
    stage: 'invoke',
    attempt: 2,
    retryable: true,
    willRetry: false,
    tokens: 1234567,
    baseUrl: 'https://api.example.com/v1',
    endpoints: ['https://api.example.com/v1/chat/completions', 'https://api.example.com/chat/completions'],
    usage: { promptTokens: 12, completionTokens: 30, cached: { hit: true } },
    empty: {},
    note: null,
    responseSnippet: '{"error":{"message":"quota exceeded"}}',
  }

  it('lists every metadata field as label and value, never as a JSON string', async () => {
    const { t, format } = await i18nFor('en')
    const entries = buildAuditMetadataEntries(METADATA, format, t)

    expect(entries.map(entry => entry.key)).toEqual(['source', 'stage', 'attempt', 'retryable', 'willRetry', 'tokens', 'baseUrl', 'endpoints', 'usage', 'empty', 'note'])
    const byKey = Object.fromEntries(entries.map(entry => [entry.key, entry]))
    expect(byKey.source).toEqual({ key: 'source', label: 'source', lines: ['intelligence-agent'] })
    expect(byKey.retryable!.lines).toEqual(['Yes'])
    expect(byKey.willRetry!.lines).toEqual(['No'])
    expect(byKey.tokens).toEqual({ key: 'tokens', label: 'Tokens', lines: ['1,234,567'] })
    expect(byKey.baseUrl!.label).toBe('Base URL')
    // A list reads one item per line; a nested object one field per line.
    expect(byKey.endpoints).toEqual({
      key: 'endpoints',
      label: 'Candidate Endpoints',
      lines: ['https://api.example.com/v1/chat/completions', 'https://api.example.com/chat/completions'],
    })
    expect(byKey.usage!.lines).toEqual(['promptTokens: 12', 'completionTokens: 30', 'cached: hit: Yes'])
    expect(byKey.empty!.lines).toEqual(['—'])
    expect(byKey.note!.lines).toEqual(['—'])

    const printed = entries.flatMap(entry => entry.lines).join('\n')
    expect(printed).not.toMatch(/[{}[\]"]/)
  })

  it('reads the known fields under their Chinese names', async () => {
    const { t, format } = await i18nFor('zh')
    const entries = buildAuditMetadataEntries(METADATA, format, t)
    const labels = Object.fromEntries(entries.map(entry => [entry.key, entry.label]))
    expect(labels.endpoints).toBe('候选接口')
    expect(labels.tokens).toBe('Tokens')
    expect(entries.find(entry => entry.key === 'retryable')!.lines).toEqual(['是'])
  })

  it('keeps the response snippet for its own monospace block', async () => {
    const { t, format } = await i18nFor('en')
    expect(auditResponseSnippet(METADATA)).toBe('{"error":{"message":"quota exceeded"}}')
    expect(buildAuditMetadataEntries(METADATA, format, t).some(entry => entry.key === 'responseSnippet')).toBe(false)
    expect(auditResponseSnippet({ responseSnippet: '   ' })).toBeNull()
    expect(auditResponseSnippet(null)).toBeNull()
  })

  it('has nothing to list when no metadata was recorded', async () => {
    const { t, format } = await i18nFor('en')
    expect(buildAuditMetadataEntries(null, format, t)).toEqual([])
    expect(buildAuditMetadataEntries({}, format, t)).toEqual([])
  })
})
