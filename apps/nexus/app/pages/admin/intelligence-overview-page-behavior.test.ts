import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { EffectScope } from 'vue'
import { createAdminFormat } from '~/composables/useAdminFormat'
import { useAdminResource } from '~/composables/useAdminResource'
import {
  buildOverviewStatItems,
  buildOverviewTopLists,
  buildRankRows,
  buildUsageStatItems,
  fetchIntelligenceOverview,
  fetchIntelligenceUsage,
  normalizeUsageLookupInput,
  overviewSampleHint,
  resolveOverviewFailure,
  resolveUsageLookupView,
} from '~/utils/admin-intelligence'
import type { IntelligenceOverview, IntelligenceRequest, IntelligenceTranslate } from '~/utils/admin-intelligence'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import { createRouteI18n } from '../../../test/helpers/route-i18n'
import type { RouteI18nLocale } from '../../../test/helpers/route-i18n'

/**
 * Behaviour of `/admin/intelligence-overview`, tested through the pieces the
 * page and its user lookup are built from: `fetchIntelligenceOverview` and
 * `fetchIntelligenceUsage` handed to `useAdminResource` (exactly what they do
 * with `requestJson`), and the view models in `utils/admin-intelligence.ts`,
 * rendered with the real messages through vue-i18n.
 *
 * | before (IntelligenceOverviewPanel.vue)                         | now |
 * | -------------------------------------------------------------- | --- |
 * | `{{ totalRequests }}`, `{{ successRate }}%`, `{{ avgLatency }}ms` | `metrics` › spec example: grouped, a percent, `1,850 ms` |
 * | 「请求总量」, which always equalled the sample                   | `metrics` › 「样本请求数」 |
 * | one spinner for refresh and first load alike                    | `requests` › refresh keeps the data |
 * | `e.data?.message ‖ t(loadFailed)` beside stale cards            | `requests` › fallback, failed refresh |
 * | a failed first load printed 暂无数据 in every list               | `requests` › first load vs refresh failure; no summary is a failure |
 * | three lists; `providers` fetched and never shown                | `ranked lists` › four lists |
 * | usage error showed `e.message` (ofetch) or 'Missing userId'     | `user lookup` › errors |
 * | `toLocaleString()` for the last request                         | `user lookup` › cards |
 * | no "no calls" state; no generations                             | `user lookup` › empty, latest query wins |
 */

type Translate = IntelligenceTranslate

async function i18nFor(locale: RouteI18nLocale) {
  const i18n = await createRouteI18n(locale)
  // vue-i18n's `t` takes a fallback string or named values in the second place.
  const t = ((key: string, second: string | Record<string, unknown>) => i18n.t(key, second as Record<string, unknown>)) as Translate
  const format = createAdminFormat(() => locale, (key, named) => i18n.t(key, named))
  return { t, format }
}

const SPEC_SUMMARY = { totalRequests: 1234, successRate: 87, totalTokens: 1234567, avgLatency: 1850, sampleSize: 200 }

function overviewResponse(overrides: Partial<IntelligenceOverview> = {}) {
  return {
    summary: SPEC_SUMMARY,
    models: [{ label: 'gpt-4o-mini', count: 1200, tokens: 9 }, { label: 'deepseek-chat', count: 34, tokens: 0 }],
    providers: [{ label: 'tencent-cloud', count: 900, tokens: 0 }, { label: 'Team OpenAI', count: 334, tokens: 0 }],
    ips: [{ label: '203.0.113.7', count: 12, tokens: 0 }],
    countries: [{ label: 'US', count: 1234, tokens: 0 }],
    ...overrides,
  }
}

/** What ofetch rejects with when the server answered nothing presentable. */
function transportError(path: string) {
  return Object.assign(new Error(`[GET] "${path}": 500 Internal Server Error`), { data: null })
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

let scope: EffectScope | undefined

function run<T>(factory: () => T): T {
  scope = effectScope()
  return scope.run(factory)!
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

afterEach(() => {
  scope?.stop()
  scope = undefined
})

describe('AI overview: metrics', () => {
  it('formats the four cards as the spec example says', async () => {
    const { t, format } = await i18nFor('en')
    const items = buildOverviewStatItems(SPEC_SUMMARY, format, t)

    expect(items.map(item => item.value)).toEqual(['1,234', '87%', '1,234,567', '1,850 ms'])
    expect(items.map(item => item.label)).toEqual(['Sampled Requests', 'Success Rate', 'Token Usage', 'Avg Latency'])
  })

  it('labels the first card as a sample in Chinese, with the same figures', async () => {
    const { t, format } = await i18nFor('zh')
    const items = buildOverviewStatItems(SPEC_SUMMARY, format, t)

    expect(items.map(item => item.label)).toEqual(['样本请求数', '成功率', 'Token 消耗', '平均延迟'])
    expect(items.map(item => item.value)).toEqual(['1,234', '87%', '1,234,567', '1,850 ms'])
  })

  it('shows — for the average latency when nothing was sampled', async () => {
    const { t, format } = await i18nFor('en')
    const empty = { totalRequests: 0, successRate: 0, totalTokens: 0, avgLatency: 0, sampleSize: 0 }
    expect(buildOverviewStatItems(empty, format, t)[3]!.value).toBe('—')
    // Sampled rows without a latency are a measured 0, not an unknown.
    expect(buildOverviewStatItems({ ...empty, sampleSize: 3 }, format, t)[3]!.value).toBe('0 ms')
  })

  it('names the sample size once, in the block description, with grouping', async () => {
    const en = await i18nFor('en')
    const zh = await i18nFor('zh')
    expect(overviewSampleHint(SPEC_SUMMARY, en.format, en.t)).toBe('Based on the latest 200 audit entries')
    expect(overviewSampleHint(SPEC_SUMMARY, zh.format, zh.t)).toBe('基于最近 200 条审计数据')
    expect(overviewSampleHint({ ...SPEC_SUMMARY, sampleSize: 1500 }, en.format, en.t)).toBe('Based on the latest 1,500 audit entries')
    // Before the first answer the line is there, without a number to be wrong about.
    expect(overviewSampleHint(null, zh.format, zh.t)).toBe('基于最近的审计数据')
    // The cards do not repeat it.
    for (const item of buildOverviewStatItems(SPEC_SUMMARY, en.format, en.t))
      expect([item.label, item.value, item.meta].join(' ')).not.toContain('audit entries')
  })
})

describe('AI overview: requests', () => {
  function overviewResource(request: IntelligenceRequest) {
    return run(() => useAdminResource({
      fetch: () => fetchIntelligenceOverview(request),
      errorFallback: () => 'Failed to load the AI overview.',
    }))
  }

  it('asks GET /api/dashboard/intelligence/overview once, with no parameters', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => overviewResponse())
    const overview = overviewResource(request)
    expect(overview.loading.value).toBe(true)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]).toEqual(['/api/dashboard/intelligence/overview'])
    expect(overview.data.value?.summary).toEqual(SPEC_SUMMARY)
    expect(overview.data.value?.providers.map(item => item.label)).toEqual(['tencent-cloud', 'Team OpenAI'])
  })

  it('shows the localized fallback for a transport failure, never the API path', async () => {
    const request = vi.fn(async () => {
      throw transportError('/api/dashboard/intelligence/overview')
    })
    const overview = overviewResource(request)
    await settle()

    expect(overview.error.value).toBe('Failed to load the AI overview.')
    expect(overview.error.value).not.toContain('/api/')
    expect(overview.data.value).toBeNull()
    expect(overview.loading.value).toBe(false)
  })

  it('keeps the overview on screen when a refresh fails, and recovers on retry', async () => {
    let fail = false
    const request = vi.fn(async () => {
      if (fail)
        throw transportError('/api/dashboard/intelligence/overview')
      return overviewResponse()
    })
    const overview = overviewResource(request)
    await settle()

    fail = true
    await overview.refresh()
    expect(overview.data.value?.summary.totalRequests).toBe(1234)
    expect(overview.error.value).toBe('Failed to load the AI overview.')

    fail = false
    await overview.refresh()
    expect(overview.error.value).toBeNull()
  })

  it('tells a failed first load from a failed refresh, through their retries', async () => {
    const answers: Array<{ resolve: (value: unknown) => void, reject: (error: unknown) => void }> = []
    const request = vi.fn(() => new Promise<unknown>((resolve, reject) => {
      answers.push({ resolve, reject })
    }))
    const overview = overviewResource(request)
    const failure = () => resolveOverviewFailure({
      hasData: Boolean(overview.data.value),
      loading: overview.loading.value,
      error: overview.error.value,
    })

    // First load: placeholders, no failure.
    expect(failure()).toBeNull()
    answers[0]!.reject(transportError('/api/dashboard/intelligence/overview'))
    await settle()
    // Nothing to keep: the error state replaces the metrics and the lists.
    expect(failure()).toBe('first-load')

    // Its retry is a first load again: placeholders, then the content.
    void overview.refresh()
    await settle()
    expect(failure()).toBeNull()
    expect(overview.loading.value).toBe(true)
    answers[1]!.resolve(overviewResponse())
    await settle()
    expect(failure()).toBeNull()

    // A failed refresh keeps the content under a notice...
    void overview.refresh()
    answers[2]!.reject(transportError('/api/dashboard/intelligence/overview'))
    await settle()
    expect(failure()).toBe('refresh')
    expect(overview.data.value?.summary.totalRequests).toBe(1234)

    // ...which stays while its retry runs, and goes once it succeeds.
    void overview.refresh()
    await settle()
    expect(overview.refreshing.value).toBe(true)
    expect(failure()).toBe('refresh')
    answers[3]!.resolve(overviewResponse())
    await settle()
    expect(failure()).toBeNull()
  })

  it('treats a body without a summary as a failure, not as a quiet week', async () => {
    const request = vi.fn(async () => ({ models: [] }))
    const overview = overviewResource(request)
    await settle()

    expect(overview.data.value).toBeNull()
    expect(overview.error.value).toBe('Failed to load the AI overview.')
  })
})

describe('AI overview: ranked lists', () => {
  it('builds the four lists in order, the providers list included, with grouped counts', async () => {
    const { t, format } = await i18nFor('en')
    const overview = await fetchIntelligenceOverview(async () => overviewResponse())
    const lists = buildOverviewTopLists(overview, format, t)

    expect(lists.map(list => list.key)).toEqual(['models', 'providers', 'ips', 'countries'])
    expect(lists.map(list => list.title)).toEqual(['Top Models', 'Top Providers', 'Top IPs', 'Top Countries'])
    // The first load draws as many placeholder rows as the API can return.
    expect(lists.map(list => list.limit)).toEqual([8, 6, 8, 8])
    expect(lists[0]!.rows.map(row => [row.label, row.count])).toEqual([['gpt-4o-mini', '1,200'], ['deepseek-chat', '34']])
    expect(lists[3]!.rows[0]!.count).toBe('1,234')
  })

  it('reads a provider type under its name in the providers list', async () => {
    const overview = await fetchIntelligenceOverview(async () => overviewResponse())
    const en = await i18nFor('en')
    const zh = await i18nFor('zh')
    expect(buildOverviewTopLists(overview, en.format, en.t)[1]!.rows.map(row => row.label)).toEqual(['Tencent Cloud', 'Team OpenAI'])
    expect(buildOverviewTopLists(overview, zh.format, zh.t)[1]!.rows.map(row => row.label)).toEqual(['腾讯云', 'Team OpenAI'])
    expect(buildOverviewTopLists(overview, zh.format, zh.t).map(list => list.title))
      .toEqual(['模型分布（Top）', '服务渠道（Top）', 'IP 热点（Top）', '国家/地区（Top）'])
  })

  it('leaves an empty list empty, for the list to say "no data", and draws nothing before data', async () => {
    const { t, format } = await i18nFor('en')
    const overview = await fetchIntelligenceOverview(async () => overviewResponse({ ips: [], countries: [] }))
    const lists = buildOverviewTopLists(overview, format, t)
    expect(lists[2]!.rows).toEqual([])
    expect(lists[3]!.rows).toEqual([])
    expect(lists[0]!.rows).toHaveLength(2)

    expect(buildOverviewTopLists(null, format, t).every(list => list.rows.length === 0)).toBe(true)
  })

  it('never prints a blank name', async () => {
    const { format } = await i18nFor('en')
    expect(buildRankRows([{ label: '', count: 2 }], format)[0]!.label).toBe('—')
  })
})

describe('AI overview: user lookup', () => {
  function lookupResult(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'usr_1',
      totalRequests: 12345,
      totalTokens: 1234567,
      successRate: 87,
      sampleSize: 200,
      lastSeenAt: '2026-10-03T13:21:09.000Z',
      models: [{ label: 'gpt-4o-mini', count: 150, tokens: 0 }],
      ...overrides,
    }
  }

  it('submits the trimmed id, and nothing for a blank one', () => {
    expect(normalizeUsageLookupInput('  usr_1  ')).toBe('usr_1')
    expect(normalizeUsageLookupInput('   ')).toBeNull()
    expect(normalizeUsageLookupInput('')).toBeNull()
  })

  it('asks for that user and tags the answer with the id it asked for', async () => {
    const request = vi.fn(async (_path: string, _options?: { query: Record<string, string | number> }) => ({ ok: true, result: lookupResult() }))
    const lookup = await fetchIntelligenceUsage(request, 'usr_1')

    expect(request).toHaveBeenCalledWith('/api/dashboard/intelligence/usage', { query: { userId: 'usr_1' } })
    expect(lookup.userId).toBe('usr_1')
    expect(lookup.result.totalRequests).toBe(12345)
    expect(lookup.result.models).toEqual([{ label: 'gpt-4o-mini', count: 150 }])
  })

  it('reports ok:false with the localized fallback, never the server text', async () => {
    const { t } = await i18nFor('zh')
    const fallback = t('dashboard.sections.intelligence.usage.loadFailed', 'Failed to load usage.')
    const refused = await fetchIntelligenceUsage(async () => ({ ok: false, error: 'Missing userId' }), 'usr_1').catch(error => error)

    expect(refused).toBeInstanceOf(Error)
    const message = resolveAdminErrorMessage(refused, fallback)
    expect(message).toBe('加载用量失败。')
    expect(message).not.toContain('Missing userId')
  })

  it('reports a transport failure without the request line', async () => {
    const usage = run(() => useAdminResource({
      fetch: () => fetchIntelligenceUsage(async () => {
        throw transportError('/api/dashboard/intelligence/usage?userId=usr_1')
      }, 'usr_1'),
      errorFallback: () => 'Failed to load usage.',
      immediate: false,
    }))
    await usage.refresh()
    expect(usage.error.value).toBe('Failed to load usage.')
    expect(usage.error.value).not.toMatch(/\[GET\]|\/api\//)
  })

  it('never shows the server\'s own words for a failed lookup', async () => {
    // An H3 error carries the server's English in statusMessage / data.message,
    // which the kit's resolver prefers; the lookup always shows its own copy.
    const usage = run(() => useAdminResource({
      fetch: () => fetchIntelligenceUsage(async () => {
        throw Object.assign(new Error('[GET] "/api/dashboard/intelligence/usage": 403 Forbidden'), {
          statusMessage: 'Admin permission required.',
          data: { statusMessage: 'Admin permission required.', message: 'Admin permission required.' },
        })
      }, 'usr_1'),
      errorFallback: () => '加载用量失败。',
      immediate: false,
    }))
    await usage.refresh()
    expect(usage.error.value).toBe('加载用量失败。')
    expect(usage.error.value).not.toContain('Admin permission required')
  })

  it('shows the later of two quick lookups', async () => {
    const answers: Array<Deferred<unknown>> = []
    const request = vi.fn((_path: string, _options?: { query: Record<string, string | number> }) => {
      const answer = deferred<unknown>()
      answers.push(answer)
      return answer.promise
    })
    const submitted = ref<string | null>(null)
    const usage = run(() => useAdminResource({
      fetch: () => fetchIntelligenceUsage(request, submitted.value ?? ''),
      errorFallback: () => 'Failed to load usage.',
      immediate: false,
    }))
    const view = () => resolveUsageLookupView({
      submittedUserId: submitted.value,
      data: usage.data.value,
      pending: usage.loading.value || usage.refreshing.value,
      error: usage.error.value,
    })

    submitted.value = 'usr_a'
    void usage.refresh()
    submitted.value = 'usr_b'
    void usage.refresh()
    expect(request.mock.calls.map(call => call[1]?.query.userId)).toEqual(['usr_a', 'usr_b'])

    // B answers first; A's late answer is dropped.
    answers[1]!.resolve({ ok: true, result: lookupResult({ userId: 'usr_b', totalRequests: 2 }) })
    await settle()
    answers[0]!.resolve({ ok: true, result: lookupResult({ userId: 'usr_a', totalRequests: 1 }) })
    await settle()

    const shown = view()
    expect(shown.state).toBe('result')
    expect(shown.state === 'result' && shown.lookup.userId).toBe('usr_b')
    expect(shown.state === 'result' && shown.lookup.result.totalRequests).toBe(2)
  })

  it('has a state of its own for a user with no calls on record', async () => {
    const { t } = await i18nFor('zh')
    const lookup = await fetchIntelligenceUsage(async () => ({ ok: true, result: lookupResult({ totalRequests: 0, models: [], lastSeenAt: null }) }), 'usr_1')
    expect(resolveUsageLookupView({ submittedUserId: 'usr_1', data: lookup, pending: false, error: null }))
      .toEqual({ state: 'empty', userId: 'usr_1' })
    expect(t('dashboard.sections.intelligence.overview.userUsage.noRecords', 'This user has no AI calls on record.')).toBe('该用户暂无 AI 调用记录')
  })

  it('never shows one user\'s cards for another, nor beside a failure', async () => {
    const lookup = await fetchIntelligenceUsage(async () => ({ ok: true, result: lookupResult() }), 'usr_1')

    expect(resolveUsageLookupView({ submittedUserId: null, data: null, pending: false, error: null })).toEqual({ state: 'idle' })
    expect(resolveUsageLookupView({ submittedUserId: 'usr_1', data: null, pending: true, error: null })).toEqual({ state: 'loading' })
    // Asking for someone else: placeholders, not usr_1's cards.
    expect(resolveUsageLookupView({ submittedUserId: 'usr_2', data: lookup, pending: true, error: null })).toEqual({ state: 'loading' })
    // Asking for the same user again keeps the cards while it runs.
    expect(resolveUsageLookupView({ submittedUserId: 'usr_1', data: lookup, pending: true, error: null }).state).toBe('result')
    // A failure is shown as the failure.
    expect(resolveUsageLookupView({ submittedUserId: 'usr_1', data: lookup, pending: false, error: 'Failed to load usage.' }))
      .toEqual({ state: 'error', message: 'Failed to load usage.' })
  })

  it('formats the four cards, with the full time behind the last request', async () => {
    const { t, format } = await i18nFor('en')
    const lastSeenAt = '2026-10-03T13:21:09.000Z'
    const items = buildUsageStatItems({ totalRequests: 12345, totalTokens: 1234567, successRate: 87, lastSeenAt, models: [] }, format, t)

    expect(items.map(item => item.label)).toEqual(['Requests', 'Token Usage', 'Success Rate', 'Last Seen'])
    expect(items.slice(0, 3).map(item => item.value)).toEqual(['12,345', '1,234,567', '87%'])
    expect(items[3]!.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(items[3]!.value).toBe(format.tableDateTime(lastSeenAt))
    expect(items[3]!.title).toBe(format.dateTimeTitle(lastSeenAt))

    const never = buildUsageStatItems({ totalRequests: 1, totalTokens: 0, successRate: 0, lastSeenAt: null, models: [] }, format, t)
    expect(never[3]!.value).toBe('—')
    expect(never[3]!.title).toBeUndefined()
  })
})
