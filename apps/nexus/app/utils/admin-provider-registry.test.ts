import type { RouteI18nLocale } from '../../test/helpers/route-i18n'
import type { RegistryTranslate } from './admin-provider-registry'
import type {
  ProviderCapabilityRecord,
  ProviderEditPanelState,
  ProviderObservabilitySummary,
  ProviderRegistryRecord,
  SceneEditPanelState,
  SceneRegistryRecord,
  SceneStrategyBindingRecord,
} from './provider-registry-admin'
import { describe, expect, it } from 'vitest'
import { createAdminFormat } from '~/composables/useAdminFormat'
import { createRouteI18n } from '../../test/helpers/route-i18n'
import {
  bindingsRemovedBySave,
  buildHealthListQuery,
  buildHealthStatusFilterOptions,
  buildProviderRegistryStatItems,
  buildProviderStatusFilterOptions,
  buildUsageListQuery,
  capabilitiesRemovedBySave,
  createProviderListOptions,
  createRouteListOptions,
  formatRegistryLatency,
  healthStatusLabel,
  HEALTH_LIST_DEFAULTS,
  invalidBindingReasonLabel,
  providerMatchesSearch,
  readinessLabel,
  readinessTone,
  resolveProviderRegistryError,
  USAGE_LIST_DEFAULTS,
  validationFieldLabel,
} from './admin-provider-registry'
import { ProviderRegistryInputError } from './provider-registry-admin'

/** English fallbacks, for the rules that do not depend on the wording. */
const en = ((_key: string, second: unknown, third?: unknown) => (typeof second === 'string' ? second : third as string)) as RegistryTranslate

/** The real messages, as the console renders them. */
async function i18nFor(locale: RouteI18nLocale) {
  const i18n = await createRouteI18n(locale)
  const t = ((key: string, second?: unknown) => i18n.t(key, second && typeof second === 'object' ? second as Record<string, unknown> : {})) as RegistryTranslate
  const format = createAdminFormat(() => locale, (key, named) => i18n.t(key, named))
  return { t, format }
}

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'prv_openai',
    name: 'openai-main',
    displayName: 'OpenAI Main',
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: null,
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://api.openai.example',
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'admin',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function capability(id: string, name: string): ProviderCapabilityRecord {
  return {
    id,
    providerId: 'prv_openai',
    capability: name,
    schemaRef: null,
    metering: { unit: 'token' },
    constraints: null,
    metadata: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function binding(id: string, providerId: string, capabilityName: string, model: string | null = null): SceneStrategyBindingRecord {
  return {
    id,
    sceneId: 'scene-a',
    providerId,
    capability: capabilityName,
    model,
    priority: 10,
    weight: null,
    status: 'enabled',
    constraints: null,
    metadata: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function scene(overrides: Partial<SceneRegistryRecord> = {}): SceneRegistryRecord {
  return {
    id: 'scene-a',
    displayName: 'Scene A',
    owner: 'nexus',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['text.translate'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: null,
    metadata: null,
    bindings: [],
    createdBy: 'admin',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

const page = (filters: Record<string, string>, pageNumber = 1, limit = 20) => ({ page: pageNumber, limit, filters })

describe('usage ledger query', () => {
  it('sends only page and size when nothing is filtered', () => {
    expect(buildUsageListQuery(page({ ...USAGE_LIST_DEFAULTS }) as never)).toEqual({ page: 1, limit: 20 })
  })

  it('sends 需关注 and 估算 as flags of their own, and a single status as status', () => {
    expect(buildUsageListQuery(page({ ...USAGE_LIST_DEFAULTS, status: 'attention' }) as never)).toEqual({ page: 1, limit: 20, attention: 'true' })
    expect(buildUsageListQuery(page({ ...USAGE_LIST_DEFAULTS, status: 'estimated' }) as never)).toEqual({ page: 1, limit: 20, estimated: 'true' })
    expect(buildUsageListQuery(page({ ...USAGE_LIST_DEFAULTS, status: 'failed' }) as never)).toEqual({ page: 1, limit: 20, status: 'failed' })
  })

  it('maps the mode, the provider and the scene one to one', () => {
    expect(buildUsageListQuery(page({ status: 'all', mode: 'dry_run', provider: 'prv_a', scene: 'scene-a' }, 2, 50) as never))
      .toEqual({ page: 2, limit: 50, mode: 'dry_run', providerId: 'prv_a', sceneId: 'scene-a' })
  })

  it('sends nothing for a filter value that is not an option (an old or edited link)', () => {
    expect(buildUsageListQuery(page({ status: 'bogus', mode: 'sideways', provider: '', scene: '' }) as never)).toEqual({ page: 1, limit: 20 })
  })
})

describe('health check query', () => {
  it('sends 需关注 as both failing statuses at once', () => {
    expect(buildHealthListQuery(page({ ...HEALTH_LIST_DEFAULTS, status: 'attention' }) as never))
      .toEqual({ page: 1, limit: 20, status: 'degraded,unhealthy' })
  })

  it('sends a single status and the provider as they are', () => {
    expect(buildHealthListQuery(page({ status: 'healthy', provider: 'prv_a' }) as never))
      .toEqual({ page: 1, limit: 20, status: 'healthy', providerId: 'prv_a' })
  })

  it('sends nothing for an unknown status', () => {
    expect(buildHealthListQuery(page({ status: 'bogus', provider: '' }) as never)).toEqual({ page: 1, limit: 20 })
  })
})

describe('client lists', () => {
  it('searches names, id, vendor and declared capabilities, case-insensitively', () => {
    const record = provider({ capabilities: [capability('cap_1', 'image.translate.e2e')] })
    expect(providerMatchesSearch(record, '')).toBe(true)
    expect(providerMatchesSearch(record, 'openai MAIN')).toBe(true)
    expect(providerMatchesSearch(record, 'prv_openai')).toBe(true)
    expect(providerMatchesSearch(record, 'image.translate')).toBe(true)
    expect(providerMatchesSearch(record, 'deepseek')).toBe(false)
  })

  it('filters providers by search and status together, and pages the matches', async () => {
    const healthy: ProviderObservabilitySummary = { latestHealth: null, latestUsage: null, status: 'healthy' }
    const failing: ProviderObservabilitySummary = { latestHealth: null, latestUsage: null, status: 'unhealthy' }
    const records = [provider({ id: 'a', displayName: 'Alpha' }), provider({ id: 'b', displayName: 'Beta' }), provider({ id: 'c', displayName: 'Alpha two' })]
    const { fetcher } = createProviderListOptions(() => records, () => ({ a: healthy, b: failing, c: failing }))

    expect(await fetcher({ page: 1, limit: 20, filters: { q: '', status: 'attention' } })).toEqual({ rows: [records[1], records[2]], total: 2 })
    expect(await fetcher({ page: 1, limit: 20, filters: { q: 'alpha', status: 'attention' } })).toEqual({ rows: [records[2]], total: 1 })
    expect(await fetcher({ page: 2, limit: 1, filters: { q: '', status: 'all' } })).toEqual({ rows: [records[1]], total: 3 })
  })

  it('slices the new rows after invalidate()', async () => {
    let records = [provider({ id: 'a' })]
    const { fetcher } = createProviderListOptions(() => records, () => ({}))
    expect((await fetcher({ page: 1, limit: 20, filters: { q: '', status: 'all' } })).total).toBe(1)

    records = [provider({ id: 'a' }), provider({ id: 'b' })]
    expect((await fetcher({ page: 1, limit: 20, filters: { q: '', status: 'all' } })).total).toBe(1)
    fetcher.invalidate()
    expect((await fetcher({ page: 1, limit: 20, filters: { q: '', status: 'all' } })).total).toBe(2)
  })

  it('counts a route with failed history as failed', async () => {
    const records = [scene({ id: 'quiet' }), scene({ id: 'noisy' })]
    const { fetcher } = createRouteListOptions(() => records, () => ({
      quiet: { latestUsage: null, failedUsageCount: 0, status: 'completed' },
      noisy: { latestUsage: null, failedUsageCount: 2, status: 'completed' },
    }))
    expect((await fetcher({ page: 1, limit: 20, filters: { status: 'failed' } })).rows.map(row => row.id)).toEqual(['noisy'])
  })
})

describe('stat cards', () => {
  const summary = { providerCount: 1234, enabledProviderCount: 1000, capabilityCount: 56, sceneCount: 7, usageTotal: 1234567, unhealthyTotal: 3 }

  it('groups every number and names the five cards', async () => {
    const { t, format } = await i18nFor('en')
    const items = buildProviderRegistryStatItems(summary, format, t)

    expect(items.map(item => item.key)).toEqual(['providers', 'capabilities', 'scenes', 'usage', 'health'])
    expect(items.map(item => item.value)).toEqual(['1,234', '56', '7', '1,234,567', '3'])
    expect(items[0]!.meta).toBe('1,000 enabled')
  })

  it('puts a line under the providers card alone, its enabled count', async () => {
    const { t, format } = await i18nFor('zh')
    const items = buildProviderRegistryStatItems(summary, format, t)

    expect(items.map(item => item.label)).toEqual(['服务渠道', '能力', '场景', '用量', '健康'])
    expect(items.map(item => item.meta)).toEqual(['1,000 个已启用', undefined, undefined, undefined, undefined])
  })
})

describe('wording', () => {
  it('keeps 降级 for a route missing a capability, and reads a degraded provider or check as 受限', async () => {
    const { t } = await i18nFor('zh')

    expect(readinessLabel('degraded', t)).toBe('降级')
    expect(readinessLabel('ready', t)).toBe('就绪')
    expect(readinessLabel('disabled', t)).toBe('已停用')
    expect(healthStatusLabel('degraded', t)).toBe('受限')
    expect(buildProviderStatusFilterOptions(t).find(option => option.value === 'degraded')!.label).toBe('受限')
    expect(buildHealthStatusFilterOptions(t).find(option => option.value === 'degraded')!.label).toBe('受限')
    expect(t('dashboard.providerRegistry.fields.fallback', 'Fallback')).toBe('回退')
    expect(t('dashboard.providerRegistry.routes.fallbackTrail', 'Fallback trail')).toBe('回退链路')
  })

  it('gives a ready route a success tone, not a muted one', () => {
    expect(readinessTone('ready')).toBe('success')
    expect(readinessTone('degraded')).toBe('warning')
    expect(readinessTone('disabled')).toBe('muted')
  })

  it('names every invalid binding reason in both languages', async () => {
    const zh = await i18nFor('zh')
    const english = await i18nFor('en')
    const codes = ['PROVIDER_MISSING', 'CAPABILITY_MISSING', 'ADAPTER_MISSING', 'MODEL_INVALID'] as const

    expect(codes.map(code => invalidBindingReasonLabel(code, zh.t))).toEqual(['服务渠道不存在', '能力缺失', '适配器缺失', '模型无效'])
    expect(codes.map(code => invalidBindingReasonLabel(code, english.t))).toEqual(['Provider not found', 'Capability missing', 'Adapter missing', 'Model not in the provider list'])
  })

  it('prints latency in grouped milliseconds, and — without a figure', async () => {
    const { t, format } = await i18nFor('en')

    expect(formatRegistryLatency(1850, format, t)).toBe('1,850 ms')
    expect(formatRegistryLatency(null, format, t)).toBe('—')
  })
})

describe('what a save deletes', () => {
  function editPanel(capabilities: ProviderEditPanelState['capabilities'], removed: string[] = []) {
    return { capabilities, removedCapabilityIds: removed }
  }

  function row(id: string | undefined, name: string) {
    return { id, capability: name, schemaRef: '', meteringUnit: 'token', maxImageBytes: '', providerModel: '', meteringText: '', constraintsText: '', metadataText: '' }
  }

  it('lists the capabilities removed from the editor and the ones blanked in it', () => {
    const record = provider({ capabilities: [capability('cap_1', 'text.chat'), capability('cap_2', 'vision.ocr'), capability('cap_3', 'text.translate')] })

    expect(capabilitiesRemovedBySave(record, editPanel([row('cap_1', 'text.chat'), row('cap_2', ' '), row(undefined, 'new.one')], ['cap_3'])).map(item => item.capability))
      .toEqual(['vision.ocr', 'text.translate'])
    expect(capabilitiesRemovedBySave(record, editPanel([row('cap_1', 'text.chat'), row('cap_2', 'vision.ocr'), row('cap_3', 'text.translate')]))).toEqual([])
  })

  function sceneRow(providerId: string, capabilityName: string, model = ''): SceneEditPanelState['bindings'][number] {
    return { providerId, capability: capabilityName, model, priority: 10, weightText: '', status: 'enabled', constraintsText: '', metadataText: '' }
  }

  it('lists the bindings a scene save replaces away: removed, blanked, or moved', () => {
    const record = scene({ bindings: [binding('b1', 'prv_a', 'text.translate'), binding('b2', 'prv_b', 'text.translate', 'gpt-4.1-mini'), binding('b3', 'prv_c', 'vision.ocr')] })

    expect(bindingsRemovedBySave(record, { bindings: [sceneRow('prv_a', 'text.translate'), sceneRow('prv_b', 'text.translate', 'gpt-4.1-mini'), sceneRow('prv_c', 'vision.ocr')] })).toEqual([])
    expect(bindingsRemovedBySave(record, { bindings: [sceneRow('prv_a', 'text.translate')] }).map(item => item.id)).toEqual(['b2', 'b3'])
    expect(bindingsRemovedBySave(record, { bindings: [sceneRow('prv_a', ' '), sceneRow('prv_z', 'text.translate', 'gpt-4.1-mini'), sceneRow('prv_c', 'vision.ocr')] }).map(item => item.id))
      .toEqual(['b1', 'b2'])
  })

  it('reads a new model on the same provider and capability as an edit, as the server does', () => {
    const record = scene({ bindings: [binding('b1', 'prv_a', 'text.translate', 'gpt-4.1-mini')] })

    expect(bindingsRemovedBySave(record, { bindings: [sceneRow('prv_a', 'text.translate', 'gpt-4.1')] })).toEqual([])
    expect(bindingsRemovedBySave(record, { bindings: [sceneRow('prv_a', 'text.translate')] })).toEqual([])
  })
})

describe('errors', () => {
  it('reads a value the operator typed in their language', async () => {
    const { t } = await i18nFor('zh')

    expect(resolveProviderRegistryError(new ProviderRegistryInputError('json-invalid', { field: 'provider.metadata' }, 'x'), t, '兜底'))
      .toBe('「元数据 JSON」不是合法的 JSON。')
    expect(resolveProviderRegistryError(new ProviderRegistryInputError('number-range', { field: 'warningThreshold', min: 0, max: 100 }, 'x'), t, '兜底'))
      .toBe('「警告百分比」必须是 0 到 100 之间的数字。')
    expect(resolveProviderRegistryError(new ProviderRegistryInputError('json-not-object', { field: 'bindings[1].constraints' }, 'x'), t, '兜底'))
      .toBe('「约束 JSON（第 2 行）」必须是 JSON 对象。')
    expect(resolveProviderRegistryError(new ProviderRegistryInputError('default-model-missing', {}, 'x'), t, '兜底'))
      .toBe('默认模型必须在模型列表里。')
  })

  it('names a field by the label the form shows it under, in both languages', async () => {
    const zh = await i18nFor('zh')
    const english = await i18nFor('en')

    expect(['capabilities[0].metering', 'scene.auditPolicy', 'maxTokens', 'input'].map(field => validationFieldLabel(field, zh.t)))
      .toEqual(['计量 JSON（第 1 行）', '审计策略 JSON', '最大 token 数', '输入 JSON'])
    expect(validationFieldLabel('capabilities[2].maxImageBytes', english.t)).toBe('Max image bytes, row 3')
    expect(validationFieldLabel('someday.newField', english.t)).toBe('someday.newField')
  })

  it('shows the server\'s message, or the fallback, and never the request line', () => {
    const transport = Object.assign(new Error('[PATCH] "/api/dashboard/provider-registry/providers/a": 500'), { data: null })
    expect(resolveProviderRegistryError(transport, en, 'Failed to update provider.')).toBe('Failed to update provider.')
    expect(resolveProviderRegistryError({ data: { message: 'Provider name is taken.' } }, en, 'Failed')).toBe('Provider name is taken.')
  })
})
