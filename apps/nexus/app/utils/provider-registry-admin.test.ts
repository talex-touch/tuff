import { readFileSync } from 'node:fs'
import { getTuffIntelligenceBuiltinAbility } from '@talex-touch/tuff-intelligence/light'
import { describe, expect, it } from 'vitest'
import {
  createDefaultSceneCapabilityInput,
  createProviderAuthRef,
  createProviderQuotaPanel,
  createProviderEditPanel,
  createSceneRunPanel,
  filterProvidersByObservability,
  filterScenesByObservability,
  filterHealthCheckEntries,
  filterUsageLedgerEntries,
  resolveProviderObservability,
  resolveProviderObservabilityActionHint,
  resolveProviderObservabilityEmptyState,
  resolveHealthCheckActionHint,
  resolveHealthCheckEmptyState,
  resolveHealthCheckReason,
  resolveSceneObservability,
  resolveSceneObservabilityActionHint,
  resolveSceneObservabilityEmptyState,
  resolveUsageLedgerActionHint,
  resolveUsageLedgerEmptyState,
  resolveUsageLedgerReference,
  resolveFirstProviderTemplateForServiceCategory,
  summarizeProviderQuota,
  summarizeProviderQuotaList,
  providerRegistryTemplates,
  providerServiceCategoryOptions,
  type ProviderHealthCheckEntry,
  type ProviderQuotaRecord,
  type ProviderRegistryRecord,
  type SceneRegistryRecord,
  type ProviderUsageLedgerEntry,
} from './provider-registry-admin'

function healthEntry(overrides: Partial<ProviderHealthCheckEntry>): ProviderHealthCheckEntry {
  return {
    id: 'health-1',
    providerId: 'provider-a',
    providerName: 'Provider A',
    vendor: 'openai',
    capability: 'chat.completion',
    status: 'healthy',
    latencyMs: 120,
    endpoint: 'https://example.test',
    requestId: null,
    degradedReason: null,
    errorCode: null,
    errorMessage: null,
    checkedAt: '2026-05-17T01:00:00.000Z',
    ...overrides,
  }
}

function usageEntry(overrides: Partial<ProviderUsageLedgerEntry>): ProviderUsageLedgerEntry {
  return {
    id: 'usage-1',
    runId: 'run-1',
    sceneId: 'scene-a',
    mode: 'execute',
    status: 'completed',
    strategyMode: 'priority',
    capability: 'chat.completion',
    providerId: 'provider-a',
    unit: 'request',
    quantity: 1,
    billable: true,
    estimated: false,
    pricingRef: null,
    providerUsageRef: null,
    errorCode: null,
    errorMessage: null,
    trace: [],
    fallbackTrail: [],
    selected: [],
    createdAt: '2026-05-17T01:00:00.000Z',
    ...overrides,
  }
}

function providerRecord(overrides: Partial<ProviderRegistryRecord>): ProviderRegistryRecord {
  return {
    id: 'provider-a',
    name: 'provider-a',
    displayName: 'Provider A',
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: 'secure://provider-a',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: null,
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'admin',
    createdAt: '2026-05-17T01:00:00.000Z',
    updatedAt: '2026-05-17T01:00:00.000Z',
    ...overrides,
  }
}

function quotaRecord(overrides: Partial<ProviderQuotaRecord>): ProviderQuotaRecord {
  return {
    id: 'quota-1',
    configType: 'intelligence_provider_quota',
    name: 'Provider A quota',
    targetId: 'provider-a',
    provider: 'openai',
    channel: null,
    enabled: true,
    limits: {
      windowDays: 14,
      maxRequests: 100,
      maxTokens: 100000,
    },
    warningThreshold: 75,
    config: null,
    createdBy: 'admin',
    createdAt: '2026-05-17T01:00:00.000Z',
    updatedAt: '2026-05-17T01:00:00.000Z',
    ...overrides,
  }
}

describe('provider registry adapter readiness helpers', () => {
  it('derives internal provider auth refs from provider names', () => {
    expect(createProviderAuthRef('openai-compatible-ai-main')).toBe('secure://providers/openai-compatible-ai-main')
    expect(createProviderAuthRef('OpenAI Compatible AI Main')).toBe('secure://providers/openai-compatible-ai-main')
    expect(createProviderAuthRef('')).toBe('secure://providers/provider')
  })

  it('resolves the first adapter template for each service category', () => {
    expect(resolveFirstProviderTemplateForServiceCategory('ai')?.id).toBe('openai-compatible-ai')
    expect(resolveFirstProviderTemplateForServiceCategory('exchange')?.id).toBe('exchange-rate')
    expect(resolveFirstProviderTemplateForServiceCategory('screenshot')?.id).toBe('screenshot-overlay')
    expect(resolveFirstProviderTemplateForServiceCategory('translation')?.id).toBe('tencent-translation')
    expect(resolveFirstProviderTemplateForServiceCategory('unknown')).toBeNull()
  })

  it('preserves capability adapter readiness metadata for provider edit panels', () => {
    const provider = providerRecord({
      capabilities: [
        {
          id: 'cap-text',
          providerId: 'provider-a',
          capability: 'text.translate',
          schemaRef: 'nexus://schemas/provider/text-translate.v1',
          metering: { unit: 'character' },
          constraints: null,
          metadata: null,
          adapter: {
            providerId: 'provider-a',
            vendor: 'openai',
            capability: 'text.translate',
            ready: false,
            matchedKey: null,
            fallbackKey: 'openai:text.translate',
            reason: 'adapter-missing',
          },
          createdAt: '2026-05-17T01:00:00.000Z',
          updatedAt: '2026-05-17T01:00:00.000Z',
        },
      ],
    })

    expect(provider.capabilities[0]?.adapter).toMatchObject({
      ready: false,
      reason: 'adapter-missing',
      fallbackKey: 'openai:text.translate',
    })
    expect(createProviderEditPanel(provider).capabilities[0]).toMatchObject({
      capability: 'text.translate',
      meteringUnit: 'character',
      meteringText: '',
    })
  })
})

describe('provider registry quota helpers', () => {
  it('creates default quota panel state for unconfigured providers', () => {
    expect(createProviderQuotaPanel(providerRecord({ displayName: 'OpenAI Main' }), null)).toMatchObject({
      expanded: true,
      saving: false,
      name: 'OpenAI Main quota',
      enabled: 'enabled',
      windowDays: '30',
      maxRequests: '',
      maxTokens: '',
      warningThreshold: '80',
      error: null,
    })
  })

  it('summarizes configured provider quotas without leaking config payloads', () => {
    const quota = quotaRecord({
      enabled: false,
      limits: {
        windowDays: 7,
        maxRequests: 250,
        maxTokens: 500000,
      },
      warningThreshold: 65,
    })

    expect(createProviderQuotaPanel(providerRecord({}), quota)).toMatchObject({
      name: 'Provider A quota',
      enabled: 'disabled',
      windowDays: '7',
      maxRequests: '250',
      maxTokens: '500000',
      warningThreshold: '65',
    })
    expect(summarizeProviderQuota(quota)).toEqual({
      configured: true,
      enabled: false,
      count: 1,
      windowDays: '7',
      maxRequests: '250',
      maxTokens: '500000',
      warningThreshold: '65',
    })
    expect(summarizeProviderQuota(null)).toEqual({
      configured: false,
      enabled: false,
      count: 0,
      windowDays: '30',
      maxRequests: '-',
      maxTokens: '-',
      warningThreshold: '-',
    })
  })

  it('summarizes multi-channel provider quotas without collapsing count', () => {
    const textQuota = quotaRecord({
      id: 'quota-text',
      channel: 'text.translate',
      limits: {
        windowDays: 14,
        maxRequests: 250,
      },
    })
    const imageQuota = quotaRecord({
      id: 'quota-image',
      channel: 'image.translate',
      limits: {
        windowDays: 7,
        maxTokens: 500000,
      },
    })

    expect(summarizeProviderQuotaList([textQuota, imageQuota])).toEqual({
      configured: true,
      enabled: true,
      count: 2,
      windowDays: '14',
      maxRequests: '250',
      maxTokens: '-',
      warningThreshold: '75',
    })
  })
})

describe('provider registry quota UI contract', () => {
  it('renders multi-channel provider quota summaries in the admin panel', () => {
    const panel = readFileSync(new URL('../components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue', import.meta.url), 'utf8')

    expect(panel).toContain('getProviderQuotaList')
    expect(panel).toContain('getProviderQuotaList(selectedProvider.id)')
    expect(panel).toContain('dashboard.providerRegistry.quota.channels')
    expect(panel).toContain('dashboard.providerRegistry.quota.defaultChannel')
    expect(panel).toContain('quota.channel')
    expect(panel).toContain('quota.limits?.maxRequests')
    expect(panel).toContain('quota.limits?.maxTokens')
  })
})

describe('provider registry observability UI contract', () => {
  it('renders provider, scene, usage, and health next-action hints in the admin panel', () => {
    const panel = readFileSync(new URL('../components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue', import.meta.url), 'utf8')

    expect(panel).toContain('getProviderObservabilityActionHint(provider.id)')
    expect(panel).toContain('getSceneObservabilityActionHint(scene.id)')
    expect(panel).toContain('getUsageLedgerActionHint(entry)')
    expect(panel).toContain('getHealthCheckActionHint(entry)')
    expect(panel).toContain('dashboard.providerRegistry.observability.latestSceneRun')
    expect(panel).toContain('getProviderObservability(provider.id).latestHealth?.latencyMs')
    expect(panel).toContain('getSceneObservability(scene.id).latestUsage?.providerId')
    expect(panel).toContain('getUsageLedgerReference(entry)')
    expect(panel).toContain('getHealthCheckReason(entry)')
  })
})

describe('provider registry capability template UI contract', () => {
  it('uses a compact table for adapter-scoped capability rows without exposing schema refs', () => {
    const panel = readFileSync(new URL('../components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue', import.meta.url), 'utf8')

    expect(panel).toContain('providerCapabilityTemplateOptions')
    expect(panel).toContain('applyProviderCapabilityTemplate(row, $event)')
    expect(panel).not.toContain('providerSchemaRefOptions')
    expect(panel).not.toContain('row.schemaRef')
    expect(panel).toContain('providerMeteringUnitOptions')
    expect(panel).toContain('<table class="w-full min-w-[620px]')
    expect(panel).toContain('dashboard.providerRegistry.fields.meteringUnit')
    expect(panel).toContain('text-red-500')
    expect(panel).toContain('i-carbon-close')
    expect(panel).toContain('w-full min-w-0')
  })
})

describe('provider registry provider templates', () => {
  it('includes AI provider templates so Intelligence configuration starts in Provider Registry', () => {
    const aiTemplates = providerRegistryTemplates.filter(template => template.metadata.source === 'intelligence')
    const chatAbility = getTuffIntelligenceBuiltinAbility('text.chat')

    expect(aiTemplates.map(template => template.id)).toEqual(expect.arrayContaining([
      'openai-compatible-ai',
      'openai-responses-ai',
      'deepseek-ai',
    ]))
    expect(aiTemplates.flatMap(template => template.capabilities.map(row => row.capability))).toEqual(expect.arrayContaining([
      'chat.completion',
      'text.summarize',
      'content.extract',
      'vision.ocr',
    ]))
    expect(aiTemplates[0]?.capabilities.find(row => row.capability === 'chat.completion')).toEqual({
      capability: chatAbility?.id,
      schemaRef: chatAbility?.schemaRef,
      meteringUnit: chatAbility?.meteringUnit,
    })
    for (const template of aiTemplates) {
      expect(template.authType).toBe('api_key')
      expect(template.authRef).toMatch(/^secure:\/\/providers\//)
      expect(template.metadata).toMatchObject({
        source: 'intelligence',
        routingShape: 'providers-scenes',
      })
    }
    expect(aiTemplates.find(template => template.id === 'openai-responses-ai')?.metadata).toMatchObject({
      adapter: 'openai-responses',
      transport: 'responses',
    })
  })

  it('groups provider templates by service category before adapter selection', () => {
    expect(providerServiceCategoryOptions).toEqual(['ai', 'exchange', 'screenshot', 'translation'])
    expect(providerRegistryTemplates.map(template => template.serviceCategory)).toEqual(expect.arrayContaining([
      'ai',
      'exchange',
      'screenshot',
      'translation',
    ]))
    expect(providerRegistryTemplates.find(template => template.id === 'exchange-rate')?.capabilities.map(row => row.capability)).toEqual([
      'fx.rate.latest',
      'fx.convert',
    ])
    expect(providerRegistryTemplates.find(template => template.id === 'screenshot-overlay')?.capabilities.map(row => row.capability)).toEqual([
      'overlay.render',
    ])
  })

  it('renders service category and adapter selectors in the admin panel', () => {
    const panel = readFileSync(new URL('../components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue', import.meta.url), 'utf8')

    expect(panel).toContain('providerServiceCategoryOptions')
    expect(panel).toContain('applyProviderServiceCategory')
    expect(panel).toContain('providerTemplateOptions')
    expect(panel).toContain('applyProviderTemplate')
    expect(panel).toContain('dashboard.providerRegistry.fields.serviceCategory')
    expect(panel).toContain('dashboard.providerRegistry.fields.adapter')
  })

  it('seeds runnable OpenAI scene inputs for admin verification', () => {
    expect(createDefaultSceneCapabilityInput('chat.completion')).toEqual({
      messages: [
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('chat completion is working'),
        }),
      ],
    })
    expect(createDefaultSceneCapabilityInput('text.summarize')).toMatchObject({
      text: expect.stringContaining('Provider Registry'),
      style: 'concise',
      maxLength: 160,
    })
    expect(createDefaultSceneCapabilityInput('content.extract')).toMatchObject({
      text: expect.stringContaining('Provider Registry owners'),
      tags: ['summary', 'entities', 'actions', 'keywords'],
    })

    const panel = createSceneRunPanel(sceneRecord({
      requiredCapabilities: ['text.summarize'],
      bindings: [],
    }))
    expect(JSON.parse(panel.inputText)).toMatchObject({
      text: expect.stringContaining('Provider Registry'),
      style: 'concise',
    })
  })

  it('keeps run drawer wired to capability-specific samples and failed run hints', () => {
    const panel = readFileSync(new URL('../components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue', import.meta.url), 'utf8')

    expect(panel).toContain('applySceneRunCapabilitySample')
    expect(panel).toContain('selectSceneRunCapability')
    expect(panel).toContain('dashboard.providerRegistry.routes.resetSample')
    expect(panel).toContain('activeSceneRunPanel.error')
  })
})

function sceneRecord(overrides: Partial<SceneRegistryRecord>): SceneRegistryRecord {
  return {
    id: 'scene-a',
    displayName: 'Scene A',
    owner: 'nexus',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['chat.completion'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: null,
    metadata: null,
    bindings: [],
    createdBy: 'admin',
    createdAt: '2026-05-17T01:00:00.000Z',
    updatedAt: '2026-05-17T01:00:00.000Z',
    ...overrides,
  }
}

describe('provider registry observability summaries', () => {
  it('uses latest provider health as the provider status source', () => {
    const summary = resolveProviderObservability('provider-a', [
      healthEntry({
        id: 'older-health',
        status: 'healthy',
        capability: 'text.summarize',
        checkedAt: '2026-05-17T01:00:00.000Z',
      }),
      healthEntry({
        id: 'latest-health',
        status: 'degraded',
        capability: 'chat.completion',
        checkedAt: '2026-05-17T02:00:00.000Z',
      }),
    ], [
      usageEntry({
        id: 'latest-usage',
        status: 'failed',
        createdAt: '2026-05-17T03:00:00.000Z',
      }),
    ])

    expect(summary.latestHealth?.id).toBe('latest-health')
    expect(summary.latestUsage?.id).toBe('latest-usage')
    expect(summary.status).toBe('degraded')
  })

  it('marks provider unhealthy when usage failed and no health check exists', () => {
    const summary = resolveProviderObservability('provider-a', [], [
      usageEntry({
        id: 'failed-usage',
        status: 'failed',
        errorCode: 'PROVIDER_TIMEOUT',
      }),
    ])

    expect(summary.latestHealth).toBeNull()
    expect(summary.latestUsage?.id).toBe('failed-usage')
    expect(summary.status).toBe('unhealthy')
  })

  it('marks provider unknown when there is no observability data', () => {
    const summary = resolveProviderObservability('provider-a', [
      healthEntry({ providerId: 'provider-b' }),
    ], [
      usageEntry({ providerId: 'provider-b' }),
    ])

    expect(summary).toEqual({
      latestHealth: null,
      latestUsage: null,
      status: 'unknown',
    })
  })

  it('summarizes scene latest run and recent failures', () => {
    const summary = resolveSceneObservability('scene-a', [
      usageEntry({
        id: 'older-failed-run',
        runId: 'run-failed',
        status: 'failed',
        errorCode: 'NO_PROVIDER',
        createdAt: '2026-05-17T01:00:00.000Z',
      }),
      usageEntry({
        id: 'latest-completed-run',
        runId: 'run-completed',
        status: 'completed',
        providerId: 'provider-a',
        capability: 'vision.ocr',
        createdAt: '2026-05-17T02:00:00.000Z',
      }),
      usageEntry({
        id: 'other-scene-failed-run',
        sceneId: 'scene-b',
        status: 'failed',
        createdAt: '2026-05-17T03:00:00.000Z',
      }),
    ])

    expect(summary.latestUsage?.id).toBe('latest-completed-run')
    expect(summary.failedUsageCount).toBe(1)
    expect(summary.status).toBe('completed')
  })

  it('marks scene unknown when it has no usage ledger rows', () => {
    const summary = resolveSceneObservability('scene-a', [
      usageEntry({ sceneId: 'scene-b' }),
    ])

    expect(summary).toEqual({
      latestUsage: null,
      failedUsageCount: 0,
      status: 'unknown',
    })
  })
})

describe('provider registry observability action hints', () => {
  it('returns credential and health guidance for unhealthy providers', () => {
    const hint = resolveProviderObservabilityActionHint({
      latestHealth: healthEntry({
        status: 'unhealthy',
        errorCode: 'AUTH_FAILED',
        errorMessage: 'Invalid key',
      }),
      latestUsage: null,
      status: 'unhealthy',
    })

    expect(hint).toEqual({
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.providerUnhealthy',
      fallback: 'Check credentials, endpoint, and provider health before using this provider.',
      detail: 'AUTH_FAILED',
    })
  })

  it('returns provider check guidance when no provider evidence exists', () => {
    const hint = resolveProviderObservabilityActionHint({
      latestHealth: null,
      latestUsage: null,
      status: 'unknown',
    })

    expect(hint).toEqual({
      tone: 'muted',
      labelKey: 'dashboard.providerRegistry.observability.actions.providerUnknown',
      fallback: 'Run a provider check before relying on this provider.',
      detail: null,
    })
  })

  it('returns dry-run guidance for scenes with failed history', () => {
    const hint = resolveSceneObservabilityActionHint({
      latestUsage: usageEntry({
        status: 'completed',
        runId: 'run-completed',
      }),
      failedUsageCount: 2,
      status: 'completed',
    })

    expect(hint).toEqual({
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.sceneFailedHistory',
      fallback: 'Recent failures exist. Dry-run before the next execute.',
      detail: '2 failed',
    })
  })

  it('returns evidence guidance for completed scenes', () => {
    const hint = resolveSceneObservabilityActionHint({
      latestUsage: usageEntry({
        status: 'completed',
        runId: 'run-ok',
      }),
      failedUsageCount: 0,
      status: 'completed',
    })

    expect(hint).toEqual({
      tone: 'success',
      labelKey: 'dashboard.providerRegistry.observability.actions.sceneCompleted',
      fallback: 'Completed. Latest run can support registry evidence if output is clean.',
      detail: 'run-ok',
    })
  })
})

describe('provider registry ledger action hints', () => {
  it('returns trace guidance for failed usage rows', () => {
    const hint = resolveUsageLedgerActionHint(usageEntry({
      status: 'failed',
      errorCode: 'NO_PROVIDER',
      errorMessage: 'No provider can satisfy the scene.',
    }))

    expect(hint).toEqual({
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.usageFailed',
      fallback: 'Inspect the trace and fallback trail before reusing this scene.',
      detail: 'NO_PROVIDER',
    })
  })

  it('distinguishes planned usage from executed evidence', () => {
    const hint = resolveUsageLedgerActionHint(usageEntry({
      status: 'planned',
      runId: 'run-planned',
    }))

    expect(hint).toEqual({
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.usagePlanned',
      fallback: 'Dry-run evidence only. Execute with a safe sample before marking runtime ready.',
      detail: 'run-planned',
    })
  })

  it('flags estimated completed usage until billing reference is confirmed', () => {
    const hint = resolveUsageLedgerActionHint(usageEntry({
      status: 'completed',
      estimated: true,
      providerUsageRef: 'provider-usage-1',
    }))

    expect(hint).toEqual({
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.usageEstimated',
      fallback: 'Usage is estimated. Confirm provider billing reference before using it as final evidence.',
      detail: 'provider-usage-1',
    })
    expect(resolveUsageLedgerReference(usageEntry({
      providerUsageRef: 'provider-usage-1',
      pricingRef: 'pricing-1',
      runId: 'run-1',
    }))).toBe('provider-usage-1')
  })

  it('marks completed non-estimated usage as ready for evidence review', () => {
    const hint = resolveUsageLedgerActionHint(usageEntry({
      status: 'completed',
      estimated: false,
      pricingRef: 'pricing-1',
    }))

    expect(hint).toEqual({
      tone: 'success',
      labelKey: 'dashboard.providerRegistry.observability.actions.usageCompleted',
      fallback: 'Completed usage row is ready for evidence review.',
      detail: 'pricing-1',
    })
  })

  it('returns health guidance for unhealthy and degraded checks', () => {
    expect(resolveHealthCheckActionHint(healthEntry({
      status: 'unhealthy',
      errorCode: 'AUTH_FAILED',
      errorMessage: 'Invalid key',
    }))).toEqual({
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.healthUnhealthy',
      fallback: 'Health check failed. Verify credentials, endpoint, and provider availability.',
      detail: 'AUTH_FAILED',
    })

    expect(resolveHealthCheckActionHint(healthEntry({
      status: 'degraded',
      degradedReason: 'LATENCY_HIGH',
    }))).toEqual({
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.healthDegraded',
      fallback: 'Provider is degraded. Review the reason and rerun health check before routing traffic.',
      detail: 'LATENCY_HIGH',
    })
  })

  it('marks healthy checks as ready and exposes readable health reasons', () => {
    const entry = healthEntry({
      status: 'healthy',
      requestId: 'req-1',
      capability: 'chat.completion',
    })

    expect(resolveHealthCheckActionHint(entry)).toEqual({
      tone: 'success',
      labelKey: 'dashboard.providerRegistry.observability.actions.healthHealthy',
      fallback: 'Latest health check is healthy.',
      detail: 'req-1',
    })
    expect(resolveHealthCheckReason(entry)).toBe('req-1')
  })
})

describe('provider registry observability filters', () => {
  it('filters providers by attention and health status', () => {
    const providers = [
      providerRecord({ id: 'provider-healthy' }),
      providerRecord({ id: 'provider-degraded' }),
      providerRecord({ id: 'provider-usage-failed' }),
      providerRecord({ id: 'provider-unknown' }),
    ]
    const observabilityById = {
      'provider-healthy': {
        latestHealth: healthEntry({ providerId: 'provider-healthy', status: 'healthy' }),
        latestUsage: null,
        status: 'healthy' as const,
      },
      'provider-degraded': {
        latestHealth: healthEntry({ providerId: 'provider-degraded', status: 'degraded' }),
        latestUsage: null,
        status: 'degraded' as const,
      },
      'provider-usage-failed': {
        latestHealth: null,
        latestUsage: usageEntry({ providerId: 'provider-usage-failed', status: 'failed' }),
        status: 'unhealthy' as const,
      },
    }

    expect(filterProvidersByObservability(providers, observabilityById, 'attention').map(item => item.id)).toEqual([
      'provider-degraded',
      'provider-usage-failed',
    ])
    expect(filterProvidersByObservability(providers, observabilityById, 'healthy').map(item => item.id)).toEqual([
      'provider-healthy',
    ])
    expect(filterProvidersByObservability(providers, observabilityById, 'unknown').map(item => item.id)).toEqual([
      'provider-unknown',
    ])
  })

  it('filters scenes by attention, failed history, and latest status', () => {
    const scenes = [
      sceneRecord({ id: 'scene-completed' }),
      sceneRecord({ id: 'scene-failed-history' }),
      sceneRecord({ id: 'scene-planned' }),
      sceneRecord({ id: 'scene-unknown' }),
    ]
    const observabilityById = {
      'scene-completed': {
        latestUsage: usageEntry({ sceneId: 'scene-completed', status: 'completed' }),
        failedUsageCount: 0,
        status: 'completed' as const,
      },
      'scene-failed-history': {
        latestUsage: usageEntry({ sceneId: 'scene-failed-history', status: 'completed' }),
        failedUsageCount: 2,
        status: 'completed' as const,
      },
      'scene-planned': {
        latestUsage: usageEntry({ sceneId: 'scene-planned', status: 'planned' }),
        failedUsageCount: 0,
        status: 'planned' as const,
      },
    }

    expect(filterScenesByObservability(scenes, observabilityById, 'attention').map(item => item.id)).toEqual([
      'scene-failed-history',
      'scene-unknown',
    ])
    expect(filterScenesByObservability(scenes, observabilityById, 'failed').map(item => item.id)).toEqual([
      'scene-failed-history',
    ])
    expect(filterScenesByObservability(scenes, observabilityById, 'planned').map(item => item.id)).toEqual([
      'scene-planned',
    ])
  })

  it('filters usage ledger by attention, status, and estimated rows', () => {
    const entries = [
      usageEntry({ id: 'usage-completed', status: 'completed', estimated: false }),
      usageEntry({ id: 'usage-estimated', status: 'completed', estimated: true }),
      usageEntry({ id: 'usage-planned', status: 'planned', estimated: false }),
      usageEntry({ id: 'usage-failed', status: 'failed', estimated: false }),
    ]

    expect(filterUsageLedgerEntries(entries, 'attention').map(item => item.id)).toEqual([
      'usage-estimated',
      'usage-planned',
      'usage-failed',
    ])
    expect(filterUsageLedgerEntries(entries, 'estimated').map(item => item.id)).toEqual([
      'usage-estimated',
    ])
    expect(filterUsageLedgerEntries(entries, 'completed').map(item => item.id)).toEqual([
      'usage-completed',
      'usage-estimated',
    ])
  })

  it('filters health checks by attention and health status', () => {
    const entries = [
      healthEntry({ id: 'health-healthy', status: 'healthy' }),
      healthEntry({ id: 'health-degraded', status: 'degraded' }),
      healthEntry({ id: 'health-unhealthy', status: 'unhealthy' }),
    ]

    expect(filterHealthCheckEntries(entries, 'attention').map(item => item.id)).toEqual([
      'health-degraded',
      'health-unhealthy',
    ])
    expect(filterHealthCheckEntries(entries, 'healthy').map(item => item.id)).toEqual([
      'health-healthy',
    ])
    expect(filterHealthCheckEntries(entries, 'unhealthy').map(item => item.id)).toEqual([
      'health-unhealthy',
    ])
  })
})

describe('provider registry observability empty states', () => {
  it('guides provider creation when no providers exist', () => {
    expect(resolveProviderObservabilityEmptyState([], {}, 'all')).toMatchObject({
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.providers.empty',
      detailKey: 'dashboard.providerRegistry.providers.emptyDetail',
      actionKey: 'dashboard.providerRegistry.providers.emptyAction',
    })
  })

  it('returns no provider empty state when the filter has matches', () => {
    const providers = [providerRecord({ id: 'provider-healthy' })]
    const observabilityById = {
      'provider-healthy': {
        latestHealth: healthEntry({ providerId: 'provider-healthy', status: 'healthy' }),
        latestUsage: null,
        status: 'healthy' as const,
      },
    }

    expect(resolveProviderObservabilityEmptyState(providers, observabilityById, 'healthy')).toBeNull()
  })

  it('uses positive provider copy when no provider needs attention', () => {
    const providers = [providerRecord({ id: 'provider-healthy' })]
    const observabilityById = {
      'provider-healthy': {
        latestHealth: healthEntry({ providerId: 'provider-healthy', status: 'healthy' }),
        latestUsage: null,
        status: 'healthy' as const,
      },
    }

    expect(resolveProviderObservabilityEmptyState(providers, observabilityById, 'attention')).toMatchObject({
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.providers.emptyAttention',
      actionKey: 'dashboard.providerRegistry.providers.clearFilter',
    })
  })

  it('guides provider evidence refresh when unknown filter has no matches', () => {
    const providers = [providerRecord({ id: 'provider-healthy' })]
    const observabilityById = {
      'provider-healthy': {
        latestHealth: healthEntry({ providerId: 'provider-healthy', status: 'healthy' }),
        latestUsage: null,
        status: 'healthy' as const,
      },
    }

    expect(resolveProviderObservabilityEmptyState(providers, observabilityById, 'unknown')).toMatchObject({
      tone: 'warning',
      titleKey: 'dashboard.providerRegistry.providers.emptyUnknown',
      detailKey: 'dashboard.providerRegistry.providers.emptyUnknownDetail',
    })
  })

  it('guides scene creation when no scenes exist', () => {
    expect(resolveSceneObservabilityEmptyState([], {}, 'all')).toMatchObject({
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.scenes.empty',
      detailKey: 'dashboard.providerRegistry.scenes.emptyDetail',
      actionKey: 'dashboard.providerRegistry.scenes.emptyAction',
    })
  })

  it('returns no scene empty state when the filter has matches', () => {
    const scenes = [sceneRecord({ id: 'scene-completed' })]
    const observabilityById = {
      'scene-completed': {
        latestUsage: usageEntry({ sceneId: 'scene-completed', status: 'completed' }),
        failedUsageCount: 0,
        status: 'completed' as const,
      },
    }

    expect(resolveSceneObservabilityEmptyState(scenes, observabilityById, 'completed')).toBeNull()
  })

  it('uses positive scene copy when no scene needs attention', () => {
    const scenes = [sceneRecord({ id: 'scene-completed' })]
    const observabilityById = {
      'scene-completed': {
        latestUsage: usageEntry({ sceneId: 'scene-completed', status: 'completed' }),
        failedUsageCount: 0,
        status: 'completed' as const,
      },
    }

    expect(resolveSceneObservabilityEmptyState(scenes, observabilityById, 'attention')).toMatchObject({
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.scenes.emptyAttention',
      actionKey: 'dashboard.providerRegistry.scenes.clearFilter',
    })
  })

  it('uses positive scene copy when failed evidence is absent', () => {
    const scenes = [sceneRecord({ id: 'scene-completed' })]
    const observabilityById = {
      'scene-completed': {
        latestUsage: usageEntry({ sceneId: 'scene-completed', status: 'completed' }),
        failedUsageCount: 0,
        status: 'completed' as const,
      },
    }

    expect(resolveSceneObservabilityEmptyState(scenes, observabilityById, 'failed')).toMatchObject({
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.scenes.emptyFailed',
      detailKey: 'dashboard.providerRegistry.scenes.emptyFailedDetail',
    })
  })

  it('guides usage collection when usage ledger is empty', () => {
    expect(resolveUsageLedgerEmptyState([], 'all')).toMatchObject({
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.usage.empty',
      detailKey: 'dashboard.providerRegistry.usage.emptyDetail',
    })
  })

  it('uses positive usage copy when no usage rows need attention', () => {
    const entries = [
      usageEntry({ id: 'usage-completed', status: 'completed', estimated: false }),
    ]

    expect(resolveUsageLedgerEmptyState(entries, 'attention')).toMatchObject({
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.usage.emptyAttention',
      actionKey: 'dashboard.providerRegistry.usage.clearFilter',
    })
  })

  it('guides health collection when health ledger is empty', () => {
    expect(resolveHealthCheckEmptyState([], 'all')).toMatchObject({
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.health.empty',
      detailKey: 'dashboard.providerRegistry.health.emptyDetail',
    })
  })

  it('uses positive health copy when no health checks need attention', () => {
    const entries = [
      healthEntry({ id: 'health-healthy', status: 'healthy' }),
    ]

    expect(resolveHealthCheckEmptyState(entries, 'attention')).toMatchObject({
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.health.emptyAttention',
      actionKey: 'dashboard.providerRegistry.health.clearFilter',
    })
  })
})
