import type { RouteI18nLocale } from '../../test/helpers/route-i18n'
import type { RegistryTranslate } from './admin-provider-registry'
import type { RegistryDetailSection } from './admin-provider-registry-detail'
import type {
  ProviderHealthCheckEntry,
  ProviderRegistryRecord,
  ProviderUsageLedgerEntry,
  SceneRegistryRecord,
} from './provider-registry-admin'
import { describe, expect, it } from 'vitest'
import { createAdminFormat } from '~/composables/useAdminFormat'
import { createRouteI18n } from '../../test/helpers/route-i18n'
import {
  buildHealthDetailSections,
  buildProviderDetailSections,
  buildRouteDetailSections,
  buildUsageDetailSections,
  providerQuotaSummaryText,
} from './admin-provider-registry-detail'

/**
 * The read-only drawers' content, with the real messages: every field the spec
 * lists for each drawer, and how a missing value reads.
 */

async function contextFor(locale: RouteI18nLocale) {
  const i18n = await createRouteI18n(locale)
  const t = ((key: string, second?: unknown) => i18n.t(key, second && typeof second === 'object' ? second as Record<string, unknown> : {})) as RegistryTranslate
  const format = createAdminFormat(() => locale, (key, named) => i18n.t(key, named))
  const names: Record<string, string> = { prv_a: 'Provider A', prv_b: 'Provider B' }
  return { t, format, providerName: (id: string | null | undefined) => (id ? names[id] ?? id : '') }
}

function field(sections: RegistryDetailSection[], section: string, key: string) {
  return sections.find(item => item.key === section)?.fields?.find(item => item.key === key)
}

function fieldKeys(sections: RegistryDetailSection[], section: string) {
  return sections.find(item => item.key === section)?.fields?.map(item => item.key)
}

const provider: ProviderRegistryRecord = {
  id: 'prv_a',
  name: 'provider-a',
  displayName: 'Provider A',
  vendor: 'openai',
  status: 'degraded',
  authType: 'api_key',
  authRef: 'secure://providers/provider-a',
  ownerScope: 'workspace',
  ownerId: 'ws_1',
  description: null,
  endpoint: 'https://api.example.test/v1',
  region: 'us-west',
  metadata: { adapterKey: 'openai-compatible' },
  capabilities: [
    {
      id: 'cap_1',
      providerId: 'prv_a',
      capability: 'text.chat',
      schemaRef: null,
      metering: { unit: 'token' },
      constraints: null,
      metadata: null,
      adapter: { providerId: 'prv_a', vendor: 'openai', capability: 'text.chat', adapterKey: null, ready: false, matchedKey: null, fallbackKey: null, reason: 'adapter-key-missing' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  ],
  createdBy: 'admin',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T03:04:00.000Z',
}

const check: ProviderHealthCheckEntry = {
  id: 'hc_1',
  providerId: 'prv_a',
  providerName: 'Provider A',
  vendor: 'openai',
  capability: 'text.chat',
  status: 'degraded',
  latencyMs: 1850,
  endpoint: 'https://api.example.test/v1/chat/completions',
  requestId: 'req_9',
  degradedReason: 'Provider is marked degraded.',
  errorCode: 'UPSTREAM_TIMEOUT',
  errorMessage: 'Timed out after 30 s.',
  checkedAt: '2026-10-02T03:00:00.000Z',
}

const usage: ProviderUsageLedgerEntry = {
  id: 'ul_1',
  runId: 'run_1',
  sceneId: 'scene-a',
  mode: 'execute',
  status: 'failed',
  strategyMode: 'priority',
  capability: 'text.translate',
  providerId: 'prv_a',
  unit: 'character',
  quantity: 12345,
  billable: true,
  estimated: true,
  pricingRef: 'price_1',
  providerUsageRef: 'upstream_1',
  errorCode: 'UPSTREAM_ERROR',
  errorMessage: 'Bad gateway',
  trace: [{ step: 'dispatch' }],
  fallbackTrail: [{ providerId: 'prv_b', status: 'skipped' }],
  selected: [{ providerId: 'prv_a' }],
  createdAt: '2026-10-02T02:00:00.000Z',
}

const route: SceneRegistryRecord = {
  id: 'scene-a',
  displayName: 'Scene A',
  owner: 'core-app',
  ownerScope: 'system',
  ownerId: null,
  status: 'enabled',
  requiredCapabilities: ['text.translate', 'image.translate'],
  strategyMode: 'priority',
  fallback: 'enabled',
  meteringPolicy: null,
  auditPolicy: null,
  metadata: null,
  readiness: {
    status: 'degraded',
    missingCapabilities: ['image.translate'],
    invalidBindings: [{ bindingId: 'b2', providerId: 'prv_b', capability: 'image.translate', code: 'ADAPTER_MISSING' }],
  },
  bindings: [
    { id: 'b1', sceneId: 'scene-a', providerId: 'prv_a', capability: 'text.translate', model: null, priority: 10, weight: null, status: 'enabled', constraints: null, metadata: null, createdAt: '', updatedAt: '' },
    { id: 'b2', sceneId: 'scene-a', providerId: 'prv_b', capability: 'image.translate', model: 'vision-1', priority: 1000, weight: null, status: 'disabled', constraints: null, metadata: null, createdAt: '', updatedAt: '' },
  ],
  createdBy: 'admin',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const hint = { tone: 'warning' as const, labelKey: 'dashboard.providerRegistry.observability.actions.providerDegraded', fallback: 'Check the degraded reason.', detail: null }

describe('provider drawer', () => {
  it('lists the provider, its quota and update time, its latest health and usage, and its capabilities', async () => {
    const ctx = await contextFor('zh')
    const sections = buildProviderDetailSections(provider, {
      observability: { latestHealth: check, latestUsage: usage, status: 'degraded' },
      hint,
      quota: { configured: true, enabled: true, count: 2, windowDays: '30', maxRequests: '1000', maxTokens: '-', warningThreshold: '80' },
    }, ctx)

    expect(sections.map(section => section.key)).toEqual(['provider', 'health', 'usage', 'capabilities'])
    expect(fieldKeys(sections, 'provider')).toEqual(['id', 'status', 'vendor', 'adapter', 'endpoint', 'region', 'authType', 'owner', 'quota', 'updatedAt', 'hint'])
    expect(field(sections, 'provider', 'status')!.value).toBe('受限')
    expect(field(sections, 'provider', 'adapter')).toMatchObject({ value: 'openai-compatible', kind: 'code' })
    expect(field(sections, 'provider', 'owner')!.value).toBe('工作区 · ws_1')
    expect(field(sections, 'provider', 'quota')!.value).toBe('已启用 · 30 天 · 1,000 次请求 · — Token · 2 个渠道')
    expect(field(sections, 'provider', 'hint')!.value).toBe('先查看受限原因，再重新执行渠道检查。')

    expect(field(sections, 'health', 'status')).toMatchObject({ value: '受限', kind: 'badge', tone: 'warning' })
    expect(field(sections, 'health', 'latency')!.value).toBe('1,850 ms')
    expect(field(sections, 'health', 'reason')!.value).toBe('Provider is marked degraded.')
    expect(field(sections, 'usage', 'scene')).toMatchObject({ value: 'scene-a', kind: 'code' })

    expect(sections[3]!.items).toEqual([{ key: 'cap_1', primary: 'text.chat', secondary: 'token · 服务渠道没有设置适配器格式', code: true }])
  })

  it('says so when there is no check, no usage and no capability in view', async () => {
    const ctx = await contextFor('en')
    const sections = buildProviderDetailSections({ ...provider, capabilities: [] }, {
      observability: { latestHealth: null, latestUsage: null, status: 'unknown' },
      hint: null,
      quota: null,
    }, ctx)

    expect(sections.find(section => section.key === 'health')).toMatchObject({ fields: undefined, empty: 'No check of it among the latest 25.' })
    expect(sections.find(section => section.key === 'usage')!.empty).toBe('No usage of it among the latest 25 ledger rows.')
    expect(sections.find(section => section.key === 'capabilities')).toMatchObject({ items: [], empty: 'This provider declares no capability.' })
    expect(field(sections, 'provider', 'quota')!.value).toBe('No quota configured')
    expect(fieldKeys(sections, 'provider')).not.toContain('hint')
  })

  it('summarizes a quota in one line', async () => {
    const ctx = await contextFor('en')
    expect(providerQuotaSummaryText({ configured: true, enabled: false, count: 1, windowDays: '7', maxRequests: '500', maxTokens: '20000', warningThreshold: '80' }, ctx))
      .toBe('disabled · 7 days · 500 requests · 20,000 tokens · 1 channel(s)')
  })
})

describe('route drawer', () => {
  it('lists the policy, the missing capabilities, why each binding is invalid, the bindings and the latest run', async () => {
    const ctx = await contextFor('zh')
    const sections = buildRouteDetailSections(route, {
      observability: { latestUsage: usage, failedUsageCount: 1, status: 'failed' },
      hint: null,
    }, ctx)

    expect(sections.map(section => section.key)).toEqual(['route', 'missing', 'invalidBindings', 'bindings', 'latestRun'])
    expect(fieldKeys(sections, 'route')).toEqual(['id', 'owner', 'status', 'strategy', 'fallback', 'requiredCapabilities', 'readiness'])
    expect(field(sections, 'route', 'fallback')).toMatchObject({ label: '回退', value: '已启用' })
    expect(field(sections, 'route', 'readiness')).toMatchObject({ value: '降级', kind: 'badge', tone: 'warning' })
    expect(sections[1]!.items).toEqual([{ key: 'image.translate', primary: 'image.translate', code: true }])
    expect(sections[2]!.items).toEqual([{ key: 'b2', primary: 'Provider B · image.translate', secondary: '适配器缺失' }])
    expect(sections[3]!.items!.map(item => item.secondary)).toEqual(['使用默认模型 · 优先级 10 · 已启用', 'vision-1 · 优先级 1,000 · 已停用'])
    expect(field(sections, 'latestRun', 'provider')!.value).toBe('Provider A')
    expect(field(sections, 'latestRun', 'status')).toMatchObject({ value: '失败', tone: 'danger' })
  })

  it('leaves out the missing and invalid sections of a ready route', async () => {
    const ctx = await contextFor('en')
    const ready = { ...route, readiness: { status: 'ready' as const, missingCapabilities: [], invalidBindings: [] } }
    const sections = buildRouteDetailSections(ready, { observability: { latestUsage: null, failedUsageCount: 0, status: 'unknown' }, hint: null }, ctx)

    expect(sections.map(section => section.key)).toEqual(['route', 'bindings', 'latestRun'])
    expect(sections[2]!.empty).toBe('No run of this route among the latest 25 ledger rows.')
  })
})

describe('usage drawer', () => {
  it('lists the run, the metering and its references, the error, and the run\'s trail as JSON', async () => {
    const ctx = await contextFor('zh')
    const sections = buildUsageDetailSections(usage, null, ctx)

    expect(fieldKeys(sections, 'run')).toEqual(['runId', 'scene', 'mode', 'capability', 'status', 'provider', 'metering', 'billable', 'estimated', 'pricingRef', 'providerRef', 'error', 'createdAt'])
    expect(field(sections, 'run', 'metering')!.value).toBe('12,345 character')
    expect(field(sections, 'run', 'billable')!.value).toBe('是')
    expect(field(sections, 'run', 'estimated')!.value).toBe('是')
    expect(field(sections, 'run', 'error')).toMatchObject({ value: 'UPSTREAM_ERROR · Bad gateway', danger: true })
    expect(sections.slice(1).map(section => [section.title, section.json])).toEqual([
      ['调用链路', JSON.stringify(usage.trace, null, 2)],
      ['回退链路', JSON.stringify(usage.fallbackTrail, null, 2)],
      ['命中选择', JSON.stringify(usage.selected, null, 2)],
    ])
  })
})

describe('health drawer', () => {
  it('lists where the check went, the outcome, and every reason it gives', async () => {
    const ctx = await contextFor('zh')
    const sections = buildHealthDetailSections(check, null, ctx)

    expect(fieldKeys(sections, 'check')).toEqual(['provider', 'providerId', 'vendor', 'endpoint', 'capability', 'status', 'latency', 'degradedReason', 'error', 'requestId', 'checkedAt'])
    expect(field(sections, 'check', 'status')).toMatchObject({ value: '受限', tone: 'warning' })
    expect(field(sections, 'check', 'endpoint')!.value).toBe('https://api.example.test/v1/chat/completions')
    expect(field(sections, 'check', 'error')!.value).toBe('UPSTREAM_TIMEOUT · Timed out after 30 s.')
  })
})
