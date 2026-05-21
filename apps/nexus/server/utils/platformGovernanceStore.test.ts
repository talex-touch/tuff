import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertStorageChannelPolicy,
  assertIntelligenceProviderQuota,
  buildStoragePolicyAlerts,
  evaluateStorageChannelPolicy,
  getPluginGovernanceAnalytics,
  getPlatformGovernanceAnalytics,
  listPlatformGovernanceEvents,
  recordPlatformGovernanceEvent,
  recordStorageChannelUsage,
  upsertPlatformGovernanceConfig,
} from './platformGovernanceStore'
import { deletePluginPackage, getPluginPackage, uploadPluginPackage } from './pluginPackageStorage'

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

function event(providerId: string) {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path: `/test/${providerId}`,
  } as any
}

describe('platformGovernanceStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores actor/context fingerprints without raw actor ids', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const record = await recordPlatformGovernanceEvent(event(providerId), {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'user@example.com',
      resourceType: 'plugin',
      resourceId: providerId,
      channel: 'feature-x',
      unit: 'call',
      quantity: 1,
      metadata: {
        pluginName: 'Demo Plugin',
      },
    })

    expect(record.actorHash).toMatch(/^[a-f0-9]{64}$/)
    expect(record.actorHash).not.toBe('user@example.com')
    expect(JSON.stringify(record)).not.toContain('user@example.com')

    const rows = await listPlatformGovernanceEvents(event(providerId), {
      resourceType: 'plugin',
      resourceId: providerId,
      limit: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      scope: 'plugin',
      action: 'invoke',
      resourceId: providerId,
      unit: 'call',
      quantity: 1,
    })
  })

  it('rejects plaintext secrets in governance configs', async () => {
    await expect(upsertPlatformGovernanceConfig(event('secrets'), {
      configType: 'notification_channel',
      name: 'Resend primary',
      provider: 'resend',
      channel: 'email',
      config: {
        apiKey: 'plain-secret',
      },
    }, 'admin')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects persistent notification recipients in governance configs', async () => {
    await expect(upsertPlatformGovernanceConfig(event('recipients'), {
      configType: 'notification_channel',
      name: 'Resend primary',
      provider: 'resend',
      channel: 'email',
      config: {
        providerType: 'resend',
        credentialRef: 'secure://notifications/resend-primary',
        from: 'Tuff <noreply@example.com>',
        recipients: ['developer@example.com'],
      },
    }, 'admin')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('enforces intelligence provider request quotas before dispatch', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const h3Event = event(providerId)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'intelligence_provider_quota',
      name: 'One request quota',
      targetId: providerId,
      limits: {
        maxRequests: 1,
        windowDays: 30,
      },
    }, 'admin')

    await assertIntelligenceProviderQuota(h3Event, providerId)
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 1,
    })

    await expect(assertIntelligenceProviderQuota(h3Event, providerId)).rejects.toMatchObject({
      statusCode: 429,
    })
  })

  it('evaluates storage channel policy usage by channel and provider', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const iconResourceType = `plugin-icon-${marker}`
    const policy = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: 'R2 budget',
      channel: 'r2',
      provider: 'cloudflare-r2',
      targetId: iconResourceType,
      limits: {
        maxBytes: 1000,
        trafficBytes: 400,
        maxOperations: 4,
        alertBytes: 700,
      },
      warningThreshold: 70,
    }, 'admin')

    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType: iconResourceType,
      resourceId: `icon-${marker}`,
      quantity: 750,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.read',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType: iconResourceType,
      resourceId: `icon-${marker}`,
      quantity: 120,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      channel: 'r2',
      provider: 'memory',
      resourceType: iconResourceType,
      resourceId: `dev-icon-${marker}`,
      quantity: 900,
    })

    const evaluation = await evaluateStorageChannelPolicy(h3Event, policy, { days: 30 })

    expect(evaluation).toMatchObject({
      status: 'warning',
      reasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning']),
      usage: {
        storedBytes: 750,
        trafficBytes: 120,
        operations: 2,
        writes: 1,
        reads: 1,
        deletes: 0,
      },
      utilization: {
        storedBytes: 75,
        trafficBytes: 30,
        operations: 50,
      },
    })
    expect(JSON.stringify(evaluation)).not.toContain('storage-user@example.com')

    const alerts = buildStoragePolicyAlerts([evaluation])
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metric: 'storedBytes',
        limitKey: 'maxBytes',
        usage: 750,
        limit: 1000,
        utilization: 75,
        reasons: ['max-bytes-warning'],
      }),
      expect.objectContaining({
        metric: 'storedBytes',
        limitKey: 'alertBytes',
        usage: 750,
        limit: 700,
        reasons: ['alert-bytes-reached'],
      }),
    ]))
    expect(alerts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'trafficBytes' }),
      expect.objectContaining({ metric: 'operations' }),
    ]))
    expect(JSON.stringify(alerts)).not.toContain('storage-user@example.com')

    const packagePolicy = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: 'R2 package budget',
      channel: 'r2',
      provider: 'cloudflare-r2',
      targetId: `plugin-package-${marker}`,
      limits: {
        maxBytes: 300,
      },
    }, 'admin')
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType: `plugin-package-${marker}`,
      resourceId: `package-${marker}`,
      quantity: 120,
    })

    const packageEvaluation = await evaluateStorageChannelPolicy(h3Event, packagePolicy, { days: 30 })
    expect(packageEvaluation.usage.storedBytes).toBe(120)
    expect(packageEvaluation.usage.operations).toBe(1)
  })

  it('rejects unsupported storage channel policies', async () => {
    const marker = crypto.randomUUID()
    await expect(upsertPlatformGovernanceConfig(event(marker), {
      configType: 'storage_channel',
      name: 'Unknown storage budget',
      channel: `r2-${marker}`,
      provider: 'cloudflare-r2',
      limits: {
        maxBytes: 1000,
      },
    }, 'admin')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('builds anonymized cockpit analytics for search, plugin, upload, and provider usage', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const pluginId = `plugin_${marker}`
    const providerId = `provider_${marker}`
    const signupSource = `auth-register-${marker}`
    const providerModel = `gpt-4o-mini-${marker}`
    const providerType = `openai-${marker}`
    const staleUploadStartedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'app',
      action: 'search',
      actorId: 'searcher@example.com',
      resourceType: 'search',
      resourceId: 'corebox',
      channel: 'all',
      unit: 'search',
      quantity: 1,
      metadata: {
        queryType: 'text',
        searchScene: 'corebox',
        hasFilters: true,
        queryLength: 12,
        firstResultMs: 180,
        totalDurationMs: 950,
        searchResultCount: 5,
        firstResultCount: 3,
        providerErrorCount: 0,
        providerTimeoutCount: 1,
        filterKinds: ['plugin'],
        filterSources: ['corebox'],
        inputTypes: ['text'],
        providerTimings: {
          [providerId]: 120,
        },
        providerResults: {
          [providerId]: 5,
        },
        resultCategories: {
          plugin: 4,
          command: 1,
        },
        providerStatus: {
          [providerId]: 'success',
        },
        contextAppCategory: 'developer_tools',
        contextSource: 'active-app',
        entryPoint: 'global-shortcut',
        triggerType: 'keyboard',
        userPreferenceMode: 'recent-first',
        sessionBucket: 'workday-morning',
        pluginIds: [pluginId],
        pluginCategories: ['productivity'],
        contextTags: ['editor'],
        localHour: 9,
        localDayOfWeek: 2,
        countryCode: 'US',
        regionCode: 'CA',
        timezone: 'America/Los_Angeles',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'user',
      action: 'signup',
      actorId: 'new-user@example.com',
      resourceType: 'user',
      resourceId: `user_${marker}`,
      channel: 'email',
      unit: 'user',
      quantity: 1,
      metadata: {
        source: signupSource,
        countryCode: 'US',
        regionCode: 'CA',
        timezone: 'America/Los_Angeles',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'download',
      actorId: 'plugin-user@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'download',
      quantity: 2,
      metadata: {
        countryCode: 'US',
        regionCode: 'CA',
        version: '1.0.0',
        artifactType: 'tpex',
        packageSize: 2048,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'install',
      actorId: 'plugin-user@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'install',
      quantity: 4,
      metadata: {
        countryCode: 'US',
        regionCode: 'CA',
        version: '1.0.0',
        artifactType: 'tpex',
        packageSize: 2048,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-user@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'feature-x',
      unit: 'call',
      quantity: 3,
      metadata: {
        countryCode: 'US',
        regionCode: 'CA',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.started',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_started_${marker}`,
      channel: 'application/octet-stream',
      unit: 'file',
      quantity: 1,
      occurredAt: staleUploadStartedAt,
      metadata: {
        extension: `startedonly-${marker}`,
        contentType: 'application/octet-stream',
        resourceType: 'resource',
        attemptId: `stuck-attempt-${marker}`,
        surface: 'dashboard-resource',
        size: 999999,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.started',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_fresh_started_${marker}`,
      channel: 'application/octet-stream',
      unit: 'file',
      quantity: 1,
      metadata: {
        extension: `freshstarted-${marker}`,
        contentType: 'application/octet-stream',
        resourceType: 'resource',
        attemptId: `fresh-attempt-${marker}`,
        surface: 'dashboard-resource',
        size: 4096,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.completed',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_${marker}`,
      channel: 'image/png',
      unit: 'byte',
      quantity: 2048,
      metadata: {
        extension: 'png',
        contentType: 'image/png',
        resourceType: 'resource',
        attemptId: `completed-attempt-${marker}`,
        storageChannel: 'memory',
        storageProvider: 'memory',
        durationMs: 120,
        surface: 'dashboard-resource',
        size: 2048,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.failed',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_failed_${marker}`,
      channel: 'application/zip',
      unit: 'file',
      quantity: 1,
      metadata: {
        extension: 'zip',
        contentType: 'application/zip',
        resourceType: 'resource',
        attemptId: `failed-attempt-${marker}`,
        reason: 'r2-timeout',
        statusCode: 504,
        surface: 'dashboard-resource',
        size: 4096,
      },
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: `cloudflare-r2-${marker}`,
      resourceType: `storage-package-${marker}`,
      resourceId: `pkg:${marker}`,
      quantity: 2048,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.read',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: `cloudflare-r2-${marker}`,
      resourceType: `storage-package-${marker}`,
      resourceId: `pkg:${marker}`,
      quantity: 512,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.delete',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: `cloudflare-r2-${marker}`,
      resourceType: `storage-package-${marker}`,
      resourceId: `pkg:${marker}`,
      unit: 'operation',
      quantity: 1,
    })
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'intelligence_provider_quota',
      name: 'Analytics provider quota',
      targetId: providerId,
      channel: 'chat.completion',
      limits: {
        maxRequests: 2,
        maxTokens: 600,
        windowDays: 30,
      },
      warningThreshold: 80,
    }, 'admin')
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 1,
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.usage',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'token',
      quantity: 512,
      metadata: {
        model: providerModel,
        providerType,
      },
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serializedAnalytics = JSON.stringify(analytics)

    expect(serializedAnalytics).not.toContain('searcher@example.com')
    expect(serializedAnalytics).not.toContain('new-user@example.com')
    expect(serializedAnalytics).not.toContain('plugin-user@example.com')
    expect(analytics.users.signups).toBeGreaterThanOrEqual(1)
    expect(analytics.users.signupTrend.length).toBeGreaterThan(0)
    expect(analytics.users.bySource).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: signupSource, events: 1 }),
    ]))
    expect(analytics.users.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US' }),
    ]))
    expect(analytics.searches.byQueryType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'text', events: 1 }),
    ]))
    expect(analytics.searches.byProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerId, events: 1 }),
    ]))
    expect(analytics.searches.trend.length).toBeGreaterThan(0)
    expect(analytics.searches.heatmap.length).toBeGreaterThan(0)
    expect(analytics.searches.byProviderLatency).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerId, quantity: 120 }),
    ]))
    expect(analytics.searches.byProviderResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerId, quantity: 5 }),
    ]))
    expect(analytics.searches.byResultCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'plugin', quantity: 4 }),
    ]))
    expect(analytics.searches.byProviderStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `${providerId}:success`, events: 1 }),
    ]))
    expect(analytics.searches.byFilterKind).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'plugin', events: 1 }),
    ]))
    expect(analytics.searches.byContextAppCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'developer_tools', events: 1 }),
    ]))
    expect(analytics.searches.byTriggerType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'keyboard', events: 1 }),
    ]))
    expect(analytics.searches.byUserPreferenceMode).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'recent-first', events: 1 }),
    ]))
    expect(analytics.searches.byPluginId).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: pluginId, events: 1 }),
    ]))
    expect(analytics.searches.byPluginCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'productivity', events: 1 }),
    ]))
    expect(analytics.searches.byLocalHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '09', events: 1 }),
    ]))
    expect(analytics.searches.filterUsage.filterRate).toBeGreaterThan(0)
    expect(analytics.searches.latency.firstResultMs.average).toBe(180)
    expect(analytics.searches.resultStats.resultCount.average).toBe(5)
    expect(analytics.searches.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US', events: 1 }),
    ]))
    expect(analytics.searches.byTimezone).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'America/Los_Angeles', events: 1 }),
    ]))
    expect(analytics.plugins.leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId,
        downloads: 2,
        installs: 4,
        invocations: 3,
        hotScore: 21,
        growth: expect.objectContaining({
          currentScore: 19,
          growthRate: 100,
        }),
        uniqueActors: 1,
        topRegions: expect.arrayContaining([
          expect.objectContaining({ regionCode: 'CA' }),
        ]),
        byAction: expect.arrayContaining([
          expect.objectContaining({ action: 'download', events: 1, quantity: 2 }),
          expect.objectContaining({ action: 'install', events: 1, quantity: 4 }),
          expect.objectContaining({ action: 'invoke', events: 1, quantity: 3 }),
        ]),
      }),
    ]))
    expect(analytics.plugins.trend.length).toBeGreaterThan(0)
    expect(analytics.plugins.installTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({ installs: 4, quantity: 4 }),
    ]))
    expect(analytics.plugins.heatmap.length).toBeGreaterThan(0)
    expect(analytics.uploads.started).toBeGreaterThanOrEqual(1)
    expect(analytics.uploads.completed).toBeGreaterThanOrEqual(1)
    expect(analytics.uploads.failed).toBeGreaterThanOrEqual(1)
    expect(analytics.uploads.attempts).toBeGreaterThanOrEqual(3)
    expect(analytics.uploads.stuckAttempts).toBe(1)
    expect(analytics.uploads.stuckAttemptAgeMs).toBe(15 * 60 * 1000)
    expect(analytics.uploads.stuckRate).toBe(25)
    expect(analytics.uploads.failureRate).toBe(50)
    expect(analytics.uploads.bytes).toBeGreaterThanOrEqual(2048)
    expect(analytics.uploads.byExtension).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'png', quantity: 2048 }),
    ]))
    expect(analytics.uploads.byExtension).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `startedonly-${marker}` }),
    ]))
    expect(analytics.uploads.byExtension).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `freshstarted-${marker}` }),
    ]))
    expect(analytics.uploads.byResourceType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'resource', events: 2 }),
    ]))
    expect(analytics.uploads.byContentType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'image/png', quantity: 2048 }),
      expect.objectContaining({ key: 'application/zip', quantity: 1 }),
    ]))
    expect(analytics.uploads.byStorageChannel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'memory', quantity: 2048 }),
    ]))
    expect(analytics.uploads.byStorageProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'memory', quantity: 2048 }),
    ]))
    expect(analytics.uploads.byFailureReason).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'r2-timeout', events: 1 }),
    ]))
    expect(analytics.uploads.byStatusCode).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '504', events: 1 }),
    ]))
    expect(analytics.uploads.bySurface).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dashboard-resource', events: 4 }),
    ]))
    expect(analytics.uploads.uploadSize.average).toBe(3072)
    expect(analytics.uploads.uploadDurationMs.average).toBe(120)
    expect(analytics.storage.storedBytes).toBeGreaterThanOrEqual(2048)
    expect(analytics.storage.trafficBytes).toBeGreaterThanOrEqual(512)
    expect(analytics.storage.operations).toBeGreaterThanOrEqual(3)
    expect(analytics.storage.byProviderUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `cloudflare-r2-${marker}`,
        events: 3,
        storedBytes: 2048,
        trafficBytes: 512,
        operations: 3,
        writes: 1,
        reads: 1,
        deletes: 1,
        uniqueActors: 1,
      }),
    ]))
    expect(analytics.storage.byResourceTypeUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `storage-package-${marker}`,
        events: 3,
        storedBytes: 2048,
        trafficBytes: 512,
        operations: 3,
      }),
    ]))
    expect(analytics.storage.byActionUsage.find(item => item.key === 'storage.write')?.storedBytes).toBeGreaterThanOrEqual(2048)
    expect(analytics.storage.byActionUsage.find(item => item.key === 'storage.read')?.trafficBytes).toBeGreaterThanOrEqual(512)
    expect(analytics.storage.byActionUsage.find(item => item.key === 'storage.delete')?.deletes).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        storedBytes: expect.any(Number),
        trafficBytes: expect.any(Number),
        operations: expect.any(Number),
      }),
    ]))
    expect(analytics.providers.leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        requests: 1,
        tokens: 512,
        byModel: expect.arrayContaining([
          expect.objectContaining({ model: providerModel, tokens: 512 }),
        ]),
      }),
    ]))
    expect(analytics.providers.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerModel, quantity: 512 }),
    ]))
    expect(analytics.providers.byProviderType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerType, quantity: 512 }),
    ]))
    expect(analytics.providers.quotas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        status: 'warning',
        usage: {
          requests: 1,
          tokens: 512,
        },
        limits: expect.objectContaining({
          maxRequests: 2,
          maxTokens: 600,
          warningThreshold: 80,
        }),
        utilization: {
          requests: 50,
          tokens: 85.33,
        },
      }),
    ]))

    const pluginAnalytics = await getPluginGovernanceAnalytics(h3Event, pluginId, { days: 30, limit: 5000, topLimit: 50 })
    expect(pluginAnalytics.downloads).toBe(2)
    expect(pluginAnalytics.installs).toBe(4)
    expect(pluginAnalytics.invocations).toBe(3)
    expect(pluginAnalytics.uniqueActors).toBe(1)
    expect(pluginAnalytics.trend.length).toBeGreaterThan(0)
    expect(pluginAnalytics.installTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({ installs: 4, quantity: 4 }),
    ]))
    expect(pluginAnalytics.heatmap.length).toBeGreaterThan(0)
    expect(pluginAnalytics.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US', events: 3 }),
    ]))
    expect(pluginAnalytics.byRegion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'CA', events: 3 }),
    ]))
    expect(pluginAnalytics.byChannel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'stable', events: 2 }),
      expect.objectContaining({ key: 'feature-x', events: 1 }),
    ]))
    expect(pluginAnalytics.byAction).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'install', events: 1, quantity: 4 }),
    ]))
    expect(pluginAnalytics.byVersion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '1.0.0', events: 2 }),
    ]))
    expect(pluginAnalytics.byArtifactType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'tpex', events: 2 }),
    ]))
    expect(pluginAnalytics.packageSize.average).toBe(2048)
  })

  it('records plugin package storage writes, reads, and deletes for storage governance', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'demo.tpex', {
      type: 'application/vnd.tuff.plugin',
    })

    const uploaded = await uploadPluginPackage(h3Event, file, undefined, {
      actorId: 'publisher@example.com',
    })
    const loaded = await getPluginPackage(h3Event, uploaded.key)
    await deletePluginPackage(h3Event, uploaded.key)

    expect(loaded?.contentType).toBe('application/vnd.tuff.plugin')

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      resourceId: uploaded.key,
      days: 30,
      limit: 10,
    })

    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        channel: 'memory',
        unit: 'byte',
        quantity: 4,
        metadata: expect.objectContaining({
          provider: 'memory',
          contentType: 'application/vnd.tuff.plugin',
        }),
      }),
      expect.objectContaining({
        action: 'storage.read',
        channel: 'memory',
        unit: 'byte',
        quantity: 4,
      }),
      expect.objectContaining({
        action: 'storage.delete',
        channel: 'memory',
        unit: 'operation',
        quantity: 1,
      }),
    ]))
  })

  it('records plugin package storage usage by stable plugin version governance id', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const governanceResourceId = `plugin:${marker}:version:release:1.0.0`
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'private-build.tpex', {
      type: 'application/vnd.tuff.plugin',
    })

    const uploaded = await uploadPluginPackage(h3Event, file, undefined, {
      actorId: 'publisher@example.com',
      governanceResourceId,
    })
    const loaded = await getPluginPackage(h3Event, uploaded.key, { governanceResourceId })
    await deletePluginPackage(h3Event, uploaded.key, { governanceResourceId })

    expect(loaded?.contentType).toBe('application/vnd.tuff.plugin')

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })
    const keyRows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      resourceId: uploaded.key,
      days: 30,
      limit: 10,
    })

    expect(keyRows).toHaveLength(0)
    expect(JSON.stringify(rows)).not.toContain('publisher@example.com')
    expect(JSON.stringify(rows)).not.toContain('private-build.tpex')
    expect(JSON.stringify(rows)).not.toContain(uploaded.key)
    expect(rows.every(row => row.resourceId === governanceResourceId)).toBe(true)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        channel: 'memory',
        unit: 'byte',
        quantity: 5,
        metadata: expect.objectContaining({
          provider: 'memory',
          contentType: 'application/vnd.tuff.plugin',
        }),
      }),
      expect.objectContaining({
        action: 'storage.read',
        channel: 'memory',
        unit: 'byte',
        quantity: 5,
      }),
      expect.objectContaining({
        action: 'storage.delete',
        channel: 'memory',
        unit: 'operation',
        quantity: 1,
      }),
    ]))
  })

  it('blocks plugin package reads by traffic policy without blocking writes', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `Memory package traffic ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: 'plugin-package',
      limits: {
        maxBytes: 100,
        trafficBytes: 3,
        windowDays: 30,
      },
    }, 'admin')

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'traffic.tpex', {
      type: 'application/vnd.tuff.plugin',
    })
    const uploaded = await uploadPluginPackage(h3Event, file, undefined, {
      actorId: 'publisher@example.com',
    })
    const rowsBefore = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      resourceId: uploaded.key,
      days: 30,
      limit: 10,
    })

    await expect(getPluginPackage(h3Event, uploaded.key)).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: expect.stringContaining('traffic-bytes-exceeded'),
    })

    const rowsAfter = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      resourceId: uploaded.key,
      days: 30,
      limit: 10,
    })

    expect(rowsAfter.filter(row => row.action === 'storage.write')).toHaveLength(1)
    expect(rowsAfter.filter(row => row.action === 'storage.read')).toHaveLength(
      rowsBefore.filter(row => row.action === 'storage.read').length,
    )
  })

  it('blocks plugin package writes before storage policy limits are exceeded', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `Memory package budget ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: 'plugin-package',
      limits: {
        maxBytes: 3,
        windowDays: 30,
      },
    }, 'admin')

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'blocked.tpex', {
      type: 'application/vnd.tuff.plugin',
    })
    const rowsBefore = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      days: 30,
      limit: 20,
    })
    const writesBefore = rowsBefore.filter(row => row.action === 'storage.write').length

    await expect(uploadPluginPackage(h3Event, file, undefined, {
      actorId: 'publisher@example.com',
    })).rejects.toMatchObject({
      statusCode: 429,
    })

    const rows = await listPlatformGovernanceEvents(h3Event, {
      scope: 'storage',
      resourceType: 'plugin-package',
      days: 30,
      limit: 20,
    })

    expect(rows.filter(row => row.action === 'storage.write')).toHaveLength(writesBefore)
  })

  it('blocks storage operations when operation limits are exceeded', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceType = `quota-probe-${marker}`

    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `Operation budget ${marker}`,
      channel: 'memory',
      provider: 'memory',
      targetId: resourceType,
      limits: {
        maxOperations: 0,
        windowDays: 30,
      },
    }, 'admin')

    const actions = [
      { action: 'storage.write', unit: 'byte' },
      { action: 'storage.read', unit: 'byte' },
      { action: 'storage.delete', unit: 'operation' },
    ] as const

    for (const { action, unit } of actions) {
      await expect(assertStorageChannelPolicy(h3Event, {
        action,
        channel: 'memory',
        provider: 'memory',
        resourceType,
        unit,
        quantity: 1,
      })).rejects.toMatchObject({
        statusCode: 429,
        statusMessage: expect.stringContaining('operation-limit-exceeded'),
      })
    }
  })

  it('builds storage channel usage analytics for capacity and traffic planning', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resourceType = `plugin-package-${marker}`
    const resourceId = `raw/storage/object/${marker}.tpex`

    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType,
      resourceId,
      quantity: 900,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.read',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType,
      resourceId,
      quantity: 300,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.delete',
      actorId: 'storage-user@example.com',
      channel: 'r2',
      provider: 'cloudflare-r2',
      resourceType,
      resourceId,
      quantity: 1,
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics)

    expect(analytics.storage.storedBytes).toBeGreaterThanOrEqual(900)
    expect(analytics.storage.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(analytics.storage.operations).toBeGreaterThanOrEqual(3)
    expect(analytics.storage.writes).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.reads).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.deletes).toBeGreaterThanOrEqual(1)
    const channelBucket = analytics.storage.byChannelUsage.find(item => item.key === 'r2')
    expect(channelBucket?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(channelBucket?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(channelBucket?.operations).toBeGreaterThanOrEqual(3)
    expect(channelBucket?.writes).toBeGreaterThanOrEqual(1)
    expect(channelBucket?.reads).toBeGreaterThanOrEqual(1)
    expect(channelBucket?.deletes).toBeGreaterThanOrEqual(1)
    expect(channelBucket?.uniqueActors).toBeGreaterThanOrEqual(1)

    const providerBucket = analytics.storage.byProviderUsage.find(item => item.key === 'cloudflare-r2')
    expect(providerBucket?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(providerBucket?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(analytics.storage.byResourceTypeUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: resourceType,
        storedBytes: 900,
        trafficBytes: 300,
        operations: 3,
        writes: 1,
        reads: 1,
        deletes: 1,
        uniqueActors: 1,
      }),
    ]))

    const writeBucket = analytics.storage.byActionUsage.find(item => item.key === 'storage.write')
    const readBucket = analytics.storage.byActionUsage.find(item => item.key === 'storage.read')
    const deleteBucket = analytics.storage.byActionUsage.find(item => item.key === 'storage.delete')
    expect(writeBucket?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(writeBucket?.operations).toBeGreaterThanOrEqual(1)
    expect(readBucket?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(readBucket?.operations).toBeGreaterThanOrEqual(1)
    expect(deleteBucket?.deletes).toBeGreaterThanOrEqual(1)
    expect(deleteBucket?.operations).toBeGreaterThanOrEqual(1)

    const trendBucket = analytics.storage.trend.at(-1)
    expect(trendBucket?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(trendBucket?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(trendBucket?.operations).toBeGreaterThanOrEqual(3)
    expect(serialized).not.toContain('storage-user@example.com')
    expect(serialized).not.toContain(resourceId)
  })

  it('builds notification delivery health analytics without leaking recipients or credential refs', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const pluginId = `plugin_${marker}`

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'email',
      unit: 'delivery',
      quantity: 1,
      metadata: {
        notificationAction: 'plugin.version.approved',
        provider: `resend-primary-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        reason: 'delivery-planned',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'email',
      unit: 'delivery',
      quantity: 1,
      metadata: {
        notificationAction: 'plugin.version.approved',
        provider: `resend-primary-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        reason: 'delivery-sent',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.skipped',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'browser',
      unit: 'delivery',
      quantity: 0,
      metadata: {
        notificationAction: 'plugin.version.approved',
        provider: 'browser',
        providerType: 'browser',
        adapter: 'browser',
        reason: 'event-mismatch',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.failed',
      actorId: 'ops@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'email',
      unit: 'delivery',
      quantity: 0,
      metadata: {
        notificationAction: 'plugin.version.approved',
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        reason: 'credential-ref-required',
      },
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics)

    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('ops@example.com')
    expect(serialized).not.toContain('secure://')
    expect(analytics.notifications.deliveries.total).toBeGreaterThanOrEqual(3)
    expect(analytics.notifications.deliveries.planned).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.sent).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.skipped).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.failed).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.plannedRate).toBeGreaterThan(0)
    expect(analytics.notifications.deliveries.sentRate).toBeGreaterThan(0)
    expect(analytics.notifications.deliveries.failureRate).toBeGreaterThan(0)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'planned')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'sent')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'skipped')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'failed')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `resend-primary-${marker}`, events: 2 }),
      expect.objectContaining({ key: `smtp-ops-${marker}`, events: 1 }),
    ]))
    expect(analytics.notifications.byAdapter).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email/resend', events: 2 }),
      expect.objectContaining({ key: 'email/smtp', events: 1 }),
    ]))
    expect(analytics.notifications.byReason).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'delivery-sent', events: 1 }),
      expect.objectContaining({ key: 'credential-ref-required', events: 1 }),
    ]))
    expect(analytics.notifications.byNotificationAction.find(item => item.key === 'plugin.version.approved')?.events).toBeGreaterThanOrEqual(4)
    expect(analytics.notifications.providerHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: `resend-primary-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        total: 2,
        planned: 1,
        sent: 1,
        failed: 0,
        sentRate: 50,
        failureRate: 0,
      }),
      expect.objectContaining({
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        failed: 1,
        sentRate: 0,
        failureRate: 100,
        latestFailureReason: 'credential-ref-required',
        latestFailureAt: expect.any(String),
      }),
    ]))
  })

  it('builds browser push subscription analytics without leaking endpoints or keys', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const subscriptionId = `push-sub-${marker}`

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'browser_push.subscription.upserted',
      actorId: 'developer@example.com',
      resourceType: 'browser_push_subscription',
      resourceId: subscriptionId,
      channel: 'browser_push',
      unit: 'subscription',
      quantity: 1,
      metadata: {
        id: subscriptionId,
        endpointHost: 'push.example.test',
        hasKeys: true,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'browser_push.subscription.deleted',
      actorId: 'developer@example.com',
      resourceType: 'browser_push_subscription',
      resourceId: subscriptionId,
      channel: 'browser_push',
      unit: 'subscription',
      quantity: 1,
      metadata: {
        id: subscriptionId,
        endpointHost: 'push.example.test',
      },
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics)

    expect(analytics.notifications.browserPushSubscriptions).toMatchObject({
      total: 2,
      registered: 1,
      deleted: 1,
    })
    expect(analytics.notifications.browserPushSubscriptions.byAction).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'upserted', events: 1 }),
      expect.objectContaining({ key: 'deleted', events: 1 }),
    ]))
    expect(analytics.notifications.browserPushSubscriptions.byEndpointHost).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'push.example.test', events: 2 }),
    ]))
    expect(serialized).not.toContain('developer@example.com')
    await expect(recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'browser_push.subscription.upserted',
      resourceType: 'browser_push_subscription',
      resourceId: `unsafe-${subscriptionId}`,
      metadata: {
        p256dh: 'p256dh-unit-test-key',
      },
    })).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})
