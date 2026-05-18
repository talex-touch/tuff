import { describe, expect, it } from 'vitest'
import {
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
  type ProviderHealthCheckEntry,
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
