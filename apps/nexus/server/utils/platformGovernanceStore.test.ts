import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertStorageChannelPolicy,
  assertIntelligenceProviderQuota,
  buildStoragePolicyAlerts,
  evaluateStorageChannelPolicy,
  evaluateIntelligenceProviderQuotas,
  formatPlatformGovernanceReportMarkdown,
  getPluginGovernanceAnalytics,
  getPlatformGovernanceAnalytics,
  getPlatformGovernanceReportSnapshot,
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

  it('summarizes notification channel config health without leaking credential refs', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend healthy ${marker}`,
      channel: 'email',
      provider: `resend-primary-${marker}`,
      config: {
        providerType: 'resend',
        credentialRef: `secure://notifications/resend-${marker}`,
        from: 'Tuff <noreply@example.com>',
      },
    }, 'admin')
    const emailProviderTypes = ['sendgrid', 'mailgun', 'postmark'] as const
    for (const providerType of emailProviderTypes) {
      await upsertPlatformGovernanceConfig(h3Event, {
        configType: 'notification_channel',
        name: `${providerType} primary ${marker}`,
        channel: 'email',
        provider: `${providerType}-${marker}`,
        config: {
          mode: 'send',
          providerType,
          credentialRef: `secure://notifications/${providerType}-${marker}`,
          from: 'Tuff <noreply@example.com>',
          ...(providerType === 'mailgun' ? { domain: 'mail.example.com' } : {}),
        },
      }, 'admin')
    }
    const smtp = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `SMTP missing ref ${marker}`,
      channel: 'email',
      provider: `smtp-${marker}`,
      config: {
        providerType: 'smtp',
      },
    }, 'admin')
    const browser = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Browser disabled ${marker}`,
      channel: 'browser',
      provider: 'browser',
      enabled: false,
      config: {
        providerType: 'browser',
      },
    }, 'admin')

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics.notifications)

    expect(serialized).not.toContain('secure://notifications')
    expect(analytics.notifications.channelSummary).toEqual(expect.objectContaining({
      total: expect.any(Number),
      enabled: expect.any(Number),
      disabled: expect.any(Number),
      credentialed: expect.any(Number),
      credentialMissing: expect.any(Number),
    }))
    expect(analytics.notifications.channelSummary.total).toBeGreaterThanOrEqual(3)
    expect(analytics.notifications.channelSummary.enabled).toBeGreaterThanOrEqual(2)
    expect(analytics.notifications.channelSummary.disabled).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.channelSummary.credentialed).toBeGreaterThanOrEqual(2)
    expect(analytics.notifications.channelSummary.credentialMissing).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.channelSummary.productionReady).toEqual(expect.any(Number))
    expect(analytics.notifications.channelSummary.sendModeMissing).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.channelRisks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: smtp.id,
        adapter: 'email/smtp',
        status: 'warning',
        reasons: expect.arrayContaining(['credential-ref-required', 'send-mode-required', 'smtp-relay-endpoint-required']),
        credentialRequired: true,
        hasCredentialRef: false,
        readiness: expect.objectContaining({
          productionReady: false,
          requiresRelayEndpoint: true,
          hasRelayEndpoint: false,
        }),
      }),
      expect.objectContaining({
        configId: browser.id,
        adapter: 'browser',
        status: 'disabled',
        reasons: expect.arrayContaining(['channel-disabled']),
      }),
    ]))
    expect(analytics.notifications.providerMix).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerType: 'sendgrid',
        adapter: 'email/sendgrid',
        productionReady: 1,
      }),
      expect.objectContaining({
        providerType: 'mailgun',
        adapter: 'email/mailgun',
        productionReady: 1,
      }),
      expect.objectContaining({
        providerType: 'postmark',
        adapter: 'email/postmark',
        productionReady: 1,
      }),
      expect.objectContaining({
        providerType: 'smtp',
        adapter: 'email/smtp',
        warning: 1,
        credentialMissing: 1,
        sendModeMissing: 1,
        relayMissing: 1,
      }),
    ]))
    expect(analytics.notifications.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'channel-config',
        priority: 'high',
        suggestedAction: 'bind-credential-ref',
        reason: 'credential-ref-required',
        configId: smtp.id,
        adapter: 'email/smtp',
        status: 'warning',
        credentialRequired: true,
        hasCredentialRef: false,
        productionReady: false,
        reasons: expect.arrayContaining(['credential-ref-required', 'send-mode-required', 'smtp-relay-endpoint-required']),
      }),
      expect.objectContaining({
        source: 'channel-config',
        priority: 'medium',
        suggestedAction: 'enable-channel',
        reason: 'channel-disabled',
        configId: browser.id,
        adapter: 'browser',
        status: 'disabled',
      }),
    ]))
  })

  it('surfaces Web Push production readiness gaps without leaking runtime secrets', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Web Push missing VAPID ${marker}`,
      channel: 'browser',
      provider: `webpush-${marker}`,
      config: {
        mode: 'send',
        providerType: 'webpush',
        credentialRef: `secure://notifications/webpush-${marker}`,
      },
    }, 'admin')

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics.notifications)

    expect(analytics.notifications.channelSummary.runtimeMissing).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.channelRisks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        adapter: 'webpush',
        reasons: expect.arrayContaining(['webpush-vapid-public-key-missing']),
        readiness: expect.objectContaining({
          productionReady: false,
          sendMode: true,
          requiresPublicRuntime: true,
          hasPublicRuntime: false,
        }),
      }),
    ]))
    expect(analytics.notifications.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'channel-config',
        priority: 'high',
        suggestedAction: 'configure-runtime',
        reason: 'webpush-vapid-public-key-missing',
        configId: channel.id,
        adapter: 'webpush',
        productionReady: false,
      }),
    ]))
    expect(serialized).not.toContain('secure://notifications')
    expect(serialized).not.toContain('p256dh')
    expect(serialized).not.toContain('auth-unit-test-key')
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

  it('enforces intelligence provider quotas by provider channel', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const h3Event = event(providerId)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'intelligence_provider_quota',
      name: 'Chat request quota',
      targetId: providerId,
      channel: 'chat.completion',
      limits: {
        maxRequests: 1,
        windowDays: 30,
      },
    }, 'admin')
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'image.translate',
      unit: 'request',
      quantity: 1,
    })

    await assertIntelligenceProviderQuota(h3Event, providerId, 'chat.completion')

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 1,
    })

    await expect(assertIntelligenceProviderQuota(h3Event, providerId, 'chat.completion')).rejects.toMatchObject({
      statusCode: 429,
      data: {
        channel: 'chat.completion',
      },
    })
    await assertIntelligenceProviderQuota(h3Event, providerId, 'image.translate')
  })

  it('evaluates intelligence provider quota usage and remaining budgets', async () => {
    const providerId = `provider_${crypto.randomUUID()}`
    const h3Event = event(providerId)
    await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'intelligence_provider_quota',
      name: 'Provider quota evaluation',
      targetId: providerId,
      channel: 'chat.completion',
      limits: {
        maxRequests: 4,
        maxTokens: 1000,
        windowDays: 10,
      },
      warningThreshold: 50,
    }, 'admin')
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'request',
      quantity: 2,
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.usage',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'token',
      quantity: 750,
    })

    const evaluations = await evaluateIntelligenceProviderQuotas(h3Event, providerId)

    expect(evaluations).toEqual([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        status: 'warning',
        usage: {
          requests: 2,
          tokens: 750,
        },
        utilization: {
          requests: 50,
          tokens: 75,
        },
        remaining: {
          requests: 2,
          tokens: 250,
        },
        burnRate: {
          requestsPerDay: 0.2,
          tokensPerDay: 75,
        },
        projectedExhaustionDays: {
          requests: 10,
          tokens: 3.33,
        },
      }),
    ])
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
      remaining: {
        storedBytes: 250,
        trafficBytes: 280,
        operations: 2,
        alertBytes: 0,
      },
      overage: {
        storedBytes: 0,
        trafficBytes: 0,
        operations: 0,
        alertBytes: 50,
      },
      burnRate: {
        storedBytesPerDay: 25,
        trafficBytesPerDay: 4,
        operationsPerDay: 0.07,
      },
      projectedExhaustionDays: {
        storedBytes: 10,
        trafficBytes: 70,
        operations: 30,
        alertBytes: 0,
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

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    expect(analytics.storage.policySummary).toEqual(expect.objectContaining({
      total: expect.any(Number),
      active: expect.any(Number),
      warning: expect.any(Number),
      alerts: expect.any(Number),
      highestStoredUtilization: expect.any(Number),
    }))
    expect(analytics.storage.policySummary.total).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.policySummary.active).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.policySummary.warning).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.policySummary.alerts).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.policySummary.highestStoredUtilization).toBeGreaterThanOrEqual(75)
    expect(analytics.storage.policyRisks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: policy.id,
        status: 'warning',
        reasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning']),
        utilization: expect.objectContaining({
          storedBytes: 75,
        }),
        burnRate: expect.objectContaining({
          storedBytesPerDay: 25,
          trafficBytesPerDay: 4,
          operationsPerDay: 0.07,
        }),
        projectedExhaustionDays: expect.objectContaining({
          storedBytes: 10,
          trafficBytes: 70,
          operations: 30,
          alertBytes: 0,
        }),
      }),
    ]))
    expect(JSON.stringify(analytics.storage.policyRisks)).not.toContain('storage-user@example.com')

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
    expect(packageEvaluation.burnRate.storedBytesPerDay).toBe(4)
    expect(packageEvaluation.projectedExhaustionDays.storedBytes).toBe(45)
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
    const sceneAssetAttempt = `scene-asset-attempt-${marker}`
    const sceneAssetFailedAttempt = `scene-asset-failed-attempt-${marker}`
    const sceneAssetResourceId = `scene_asset_${marker}`
    const sceneAssetFailedResourceId = `scene_asset_failed_${marker}`
    const staleUploadStartedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'app',
      action: 'visit',
      actorId: 'visitor@example.com',
      resourceType: 'route',
      resourceId: `/dashboard/${marker}`,
      channel: 'dashboard',
      unit: 'visit',
      quantity: 1,
      metadata: {
        route: `/dashboard/${marker}`,
        page: 'Governance',
        surface: 'dashboard-admin',
        referrer: 'core-app',
        localHour: 21,
        localDayOfWeek: 5,
        countryCode: 'US',
        regionCode: 'CA',
        timezone: 'America/Los_Angeles',
      },
    })
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
        selected: true,
        selectedProvider: providerId,
        selectedCategory: 'plugin',
        selectedPluginId: pluginId,
        selectedRank: 2,
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
        hasFilters: false,
        queryLength: 9,
        firstResultMs: 0,
        totalDurationMs: 420,
        searchResultCount: 0,
        firstResultCount: 0,
        providerErrorCount: 1,
        providerTimeoutCount: 2,
        providerStatus: {
          [providerId]: 'timeout',
        },
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
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        durationMs: 120,
        surface: 'dashboard-resource',
        size: 2048,
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        storageOperation: 'storage.write',
        storageStatusCode: 503,
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
        retryable: true,
        retryCount: 1,
        maxRetries: 3,
        nextRetryDelayMs: 5000,
        failureSampleSource: 'live',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.failed',
      actorId: 'admin@example.com',
      resourceType: 'resource',
      resourceId: `asset_failed_exhausted_${marker}`,
      channel: 'application/zip',
      unit: 'file',
      quantity: 1,
      metadata: {
        extension: 'zip',
        contentType: 'application/zip',
        resourceType: 'resource',
        attemptId: `exhausted-attempt-${marker}`,
        reason: 'oss-rate-limited',
        statusCode: 429,
        surface: 'dashboard-resource',
        size: 8192,
        retryable: true,
        retryCount: 3,
        maxRetries: 3,
        retryAfterMs: 0,
        failureSampleSource: 'manual',
        failureCalibrated: true,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.started',
      actorId: 'admin@example.com',
      resourceType: 'scene-output-image',
      resourceId: sceneAssetResourceId,
      channel: 'image/png',
      unit: 'file',
      quantity: 1,
      metadata: {
        contentType: 'image/png',
        resourceType: 'scene-output-image',
        attemptId: sceneAssetAttempt,
        surface: 'scene-adapter-upload',
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        assetId: `translated-image-raw-${marker}`,
        assetKind: 'translated-image',
        objectKey: `private/scene/raw-object-${marker}.png`,
        fileName: `translated-image-${marker}.png`,
        size: 3072,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.completed',
      actorId: 'admin@example.com',
      resourceType: 'scene-output-image',
      resourceId: sceneAssetResourceId,
      channel: 'image/png',
      unit: 'byte',
      quantity: 3072,
      metadata: {
        contentType: 'image/png',
        resourceType: 'scene-output-image',
        attemptId: sceneAssetAttempt,
        surface: 'scene-adapter-upload',
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        assetId: `translated-image-raw-${marker}`,
        assetKind: 'translated-image',
        objectKey: `private/scene/raw-object-${marker}.png`,
        fileName: `translated-image-${marker}.png`,
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        durationMs: 180,
        size: 3072,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.started',
      actorId: 'admin@example.com',
      resourceType: 'scene-output-image',
      resourceId: sceneAssetFailedResourceId,
      channel: 'image/png',
      unit: 'file',
      quantity: 1,
      metadata: {
        contentType: 'image/png',
        resourceType: 'scene-output-image',
        attemptId: sceneAssetFailedAttempt,
        surface: 'scene-adapter-upload',
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        assetId: `translated-image-failed-raw-${marker}`,
        assetKind: 'translated-image',
        objectKey: `private/scene/raw-failed-object-${marker}.png`,
        fileName: `failed-translated-image-${marker}.png`,
        size: 10485760,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'upload',
      action: 'resource.failed',
      actorId: 'admin@example.com',
      resourceType: 'scene-output-image',
      resourceId: sceneAssetFailedResourceId,
      channel: 'image/png',
      unit: 'file',
      quantity: 1,
      metadata: {
        contentType: 'image/png',
        resourceType: 'scene-output-image',
        attemptId: sceneAssetFailedAttempt,
        surface: 'scene-adapter-upload',
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        assetId: `translated-image-failed-raw-${marker}`,
        assetKind: 'translated-image',
        objectKey: `private/scene/raw-failed-object-${marker}.png`,
        fileName: `failed-translated-image-${marker}.png`,
        reason: 'scene-asset-preflight-failed',
        statusCode: 413,
        failureCategory: 'payload-validation',
        failureSampleSource: 'live',
        failureCalibrationStatus: 'sampled',
        retryable: false,
        size: 10485760,
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
      metadata: {
        model: providerModel,
      },
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
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.quota_smoke.allowed',
      actorId: 'provider-admin@example.com',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'smoke',
      quantity: 1,
      metadata: {
        providerId,
        channel: 'chat.completion',
        mode: 'dry-run',
        reason: 'provider-quota-allows-request',
        requestRecorded: false,
        tokensRecorded: 0,
        credentialRef: 'secure://providers/provider-quota-smoke',
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'intelligence',
      action: 'provider.quota_smoke.blocked',
      actorId: 'provider-admin@example.com',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'chat.completion',
      unit: 'smoke',
      quantity: 0,
      metadata: {
        providerId,
        channel: 'chat.completion',
        mode: 'consume',
        reason: 'token-quota-exceeded',
        requestRecorded: true,
        tokensRecorded: 128,
        credentialRef: 'secure://providers/provider-quota-smoke',
      },
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serializedAnalytics = JSON.stringify(analytics)

    expect(serializedAnalytics).not.toContain('searcher@example.com')
    expect(serializedAnalytics).not.toContain('visitor@example.com')
    expect(serializedAnalytics).not.toContain('new-user@example.com')
    expect(serializedAnalytics).not.toContain('plugin-user@example.com')
    expect(serializedAnalytics).not.toContain(`stuck-attempt-${marker}`)
    expect(serializedAnalytics).not.toContain(`failed-attempt-${marker}`)
    expect(serializedAnalytics).not.toContain(`exhausted-attempt-${marker}`)
    expect(serializedAnalytics).not.toContain(sceneAssetAttempt)
    expect(serializedAnalytics).not.toContain(sceneAssetFailedAttempt)
    expect(serializedAnalytics).not.toContain(`asset_failed_${marker}`)
    expect(serializedAnalytics).not.toContain(`asset_failed_exhausted_${marker}`)
    expect(serializedAnalytics).not.toContain(sceneAssetResourceId)
    expect(serializedAnalytics).not.toContain(sceneAssetFailedResourceId)
    expect(serializedAnalytics).not.toContain(`translated-image-raw-${marker}`)
    expect(serializedAnalytics).not.toContain(`translated-image-failed-raw-${marker}`)
    expect(serializedAnalytics).not.toContain(`private/scene/raw-object-${marker}.png`)
    expect(serializedAnalytics).not.toContain(`private/scene/raw-failed-object-${marker}.png`)
    expect(serializedAnalytics).not.toContain(`translated-image-${marker}.png`)
    expect(serializedAnalytics).not.toContain(`failed-translated-image-${marker}.png`)
    expect(analytics.users.signups).toBeGreaterThanOrEqual(1)
    expect(analytics.users.signupTrend.length).toBeGreaterThan(0)
    expect(analytics.users.signupGrowthTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quantity: 1,
        cumulative: expect.any(Number),
        growthRate: 100,
      }),
    ]))
    expect(analytics.users.bySource).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: signupSource, events: 1 }),
    ]))
    expect(analytics.users.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US' }),
    ]))
    expect(analytics.dashboard.growth.userSignups).toEqual(expect.objectContaining({
      total: expect.any(Number),
      latestQuantity: expect.any(Number),
      cumulative: expect.any(Number),
      growthRate: expect.any(Number),
    }))
    expect(analytics.dashboard.growth.searches).toEqual(expect.objectContaining({
      total: expect.any(Number),
      latestQuantity: expect.any(Number),
      zeroResultRate: 50,
      problemRate: 100,
      selectionRate: 50,
    }))
    expect(analytics.visits.byRoute).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `/dashboard/${marker}`, events: 1 }),
    ]))
    expect(analytics.visits.byPage).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Governance', events: 1 }),
    ]))
    expect(analytics.visits.bySurface).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dashboard-admin', events: 1 }),
    ]))
    expect(analytics.visits.byReferrer).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'core-app', events: 1 }),
    ]))
    expect(analytics.visits.byLocalHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '21', events: 1 }),
    ]))
    expect(analytics.visits.byLocalTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'evening', events: 1 }),
    ]))
    expect(analytics.visits.byLocalDayOfWeek).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '5', events: 1 }),
    ]))
    expect(analytics.visits.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'US', events: 1 }),
    ]))
    expect(analytics.visits.byRegion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'CA', events: 1 }),
    ]))
    expect(analytics.visits.byTimezone).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'America/Los_Angeles', events: 1 }),
    ]))
    expect(analytics.visits.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        events: 1,
        quantity: 1,
        uniqueActors: 1,
      }),
    ]))
    expect(analytics.visits.heatmap.length).toBeGreaterThan(0)
    expect(analytics.searches.byQueryType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'text', events: 2 }),
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
      expect.objectContaining({ key: `${providerId}:timeout`, events: 1 }),
    ]))
    expect(analytics.searches.selectionSummary).toEqual({
      selected: 1,
      selectionRate: 50,
    })
    expect(analytics.searches.bySelectedProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerId, events: 1 }),
    ]))
    expect(analytics.searches.bySelectedCategory).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'plugin', events: 1 }),
    ]))
    expect(analytics.searches.bySelectedPluginId).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: pluginId, events: 1 }),
    ]))
    expect(analytics.searches.bySelectedRankBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '2-3', events: 1 }),
    ]))
    expect(analytics.searches.byQueryLengthBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '11-30', events: 1 }),
      expect.objectContaining({ key: '1-10', events: 1 }),
    ]))
    expect(analytics.searches.byResultCountBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '4-10', events: 1 }),
      expect.objectContaining({ key: '0', events: 1 }),
    ]))
    expect(analytics.searches.byFirstResultLatencyBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '101-300ms', events: 1 }),
      expect.objectContaining({ key: '<=100ms', events: 1 }),
    ]))
    expect(analytics.searches.byTotalDurationBucket).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '301-1000ms', events: 2 }),
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
    expect(analytics.searches.pluginPreferenceByTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: 'morning',
        plugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(analytics.searches.pluginPreferenceByContext).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contextAppCategory: 'developer_tools',
        contextSource: 'active-app',
        localTimeSlot: 'morning',
        events: 1,
        selected: 1,
        selectionRate: 100,
        uniqueActors: 1,
        plugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(analytics.searches.contextSelectionMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contextAppCategory: 'developer_tools',
        contextSource: 'active-app',
        localTimeSlot: 'morning',
        selectedCategory: 'plugin',
        events: 1,
        selected: 1,
        selectionRate: 100,
        uniqueActors: 1,
        plugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(analytics.searches.journey).toEqual(expect.objectContaining({
      total: 2,
      withFilters: 1,
      withResults: 1,
      selected: 1,
      zeroResult: 1,
      providerProblem: 2,
      providerErrors: 1,
      providerTimeouts: 3,
      filterRate: 50,
      withResultsRate: 50,
      selectionRate: 50,
      zeroResultRate: 50,
      problemRate: 100,
    }))
    expect(analytics.searches.journey.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contextAppCategory: 'developer_tools',
        contextSource: 'active-app',
        localTimeSlot: 'morning',
        sessionBucket: 'workday-morning',
        userPreferenceMode: 'recent-first',
        entryPoint: 'global-shortcut',
        triggerType: 'keyboard',
        events: 1,
        withFilters: 1,
        withResults: 1,
        selected: 1,
        zeroResult: 0,
        providerProblem: 1,
        filterRate: 100,
        withResultsRate: 100,
        selectionRate: 100,
        uniqueActors: 1,
        scenes: expect.arrayContaining([
          expect.objectContaining({ key: 'corebox', events: 1 }),
        ]),
        providers: expect.arrayContaining([
          expect.objectContaining({ key: providerId, events: 1 }),
        ]),
        plugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(JSON.stringify(analytics.searches.journey)).not.toContain('searcher@example.com')
    expect(analytics.searches.byLocalHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '09', events: 1 }),
    ]))
    expect(analytics.searches.byLocalDayOfWeek).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '2', events: 1 }),
    ]))
    expect(analytics.searches.byLocalTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'morning', events: 1 }),
    ]))
    expect(analytics.searches.timeHeatmap).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dayOfWeek: 2,
        hour: '09',
        timeSlot: 'morning',
        events: 1,
        selected: 1,
        selectionRate: 100,
        zeroResult: 0,
        zeroResultRate: 0,
        providerProblem: 1,
        problemRate: 100,
        providerErrors: 0,
        providerTimeouts: 1,
        uniqueActors: 1,
        topContextAppCategories: expect.arrayContaining([
          expect.objectContaining({ key: 'developer_tools', events: 1 }),
        ]),
        topContextSources: expect.arrayContaining([
          expect.objectContaining({ key: 'active-app', events: 1 }),
        ]),
        topPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(JSON.stringify(analytics.searches.timeHeatmap)).not.toContain('searcher@example.com')
    expect(analytics.searches.frequencyCohorts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cohort: 'light-search',
        users: 1,
        searches: 2,
        quantity: 2,
        activeDays: 1,
        avgSearchesPerUser: 2,
        avgActiveDaysPerUser: 1,
        selectionRate: 50,
        zeroResultRate: 50,
        problemRate: 100,
        topLocalTimeSlots: expect.arrayContaining([
          expect.objectContaining({ key: 'morning', events: 1 }),
          expect.objectContaining({ key: 'unknown', events: 1 }),
        ]),
        topUserPreferenceModes: expect.arrayContaining([
          expect.objectContaining({ key: 'recent-first', events: 1 }),
          expect.objectContaining({ key: 'unknown', events: 1 }),
        ]),
        topContextAppCategories: expect.arrayContaining([
          expect.objectContaining({ key: 'developer_tools', events: 1 }),
          expect.objectContaining({ key: 'unknown', events: 1 }),
        ]),
        topPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
        selectedPlugins: expect.arrayContaining([
          expect.objectContaining({ key: pluginId, events: 1 }),
        ]),
      }),
    ]))
    expect(JSON.stringify(analytics.searches.frequencyCohorts)).not.toContain('searcher@example.com')
    expect(analytics.searches.filterUsage.filterRate).toBe(50)
    expect(analytics.searches.reliabilitySummary).toEqual(expect.objectContaining({
      total: expect.any(Number),
      zeroResult: 1,
      providerErrors: 1,
      providerTimeouts: 3,
      problemSearches: 2,
      zeroResultRate: 50,
      problemRate: 100,
    }))
    expect(analytics.searches.reliabilityTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        zeroResult: 1,
        providerErrors: 1,
        providerTimeouts: 3,
        problemSearches: 2,
        uniqueActors: 1,
      }),
    ]))
    expect(analytics.searches.latency.firstResultMs.average).toBe(90)
    expect(analytics.searches.resultStats.resultCount.average).toBe(2.5)
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
    expect(analytics.dashboard.growth.pluginInstalls).toEqual(expect.objectContaining({
      total: expect.any(Number),
      latestQuantity: expect.any(Number),
      growthRate: expect.any(Number),
    }))
    expect(analytics.dashboard.leaderboards.hotPlugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ pluginId, hotScore: 21 }),
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
    expect(analytics.uploads.stuckRate).toBeCloseTo(14.29, 2)
    expect(analytics.uploads.failureRate).toBeCloseTo(60, 2)
    expect(analytics.uploads.bytes).toBeGreaterThanOrEqual(5120)
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
      expect.objectContaining({ key: 'resource', events: 3 }),
      expect.objectContaining({ key: 'scene-output-image', events: 2 }),
    ]))
    expect(analytics.uploads.byContentType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'image/png', quantity: 5121 }),
      expect.objectContaining({ key: 'application/zip', quantity: 2 }),
    ]))
    expect(analytics.uploads.byStorageChannel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 's3', quantity: 2048 }),
      expect.objectContaining({ key: 'r2', quantity: 3072 }),
    ]))
    expect(analytics.uploads.byStorageProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'aws-s3', quantity: 2048 }),
      expect.objectContaining({ key: 'cloudflare-r2', quantity: 3072 }),
    ]))
    expect(analytics.uploads.byFailureReason).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'r2-timeout', events: 1 }),
      expect.objectContaining({ key: 'oss-rate-limited', events: 1 }),
      expect.objectContaining({ key: 'scene-asset-preflight-failed', events: 1 }),
    ]))
    expect(analytics.uploads.byStatusCode).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '504', events: 1 }),
      expect.objectContaining({ key: '429', events: 1 }),
      expect.objectContaining({ key: '413', events: 1 }),
    ]))
    expect(analytics.uploads.bySurface).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dashboard-resource', events: 5 }),
      expect.objectContaining({ key: 'scene-adapter-upload', events: 4 }),
    ]))
    expect(analytics.uploads.sceneAssetHealth).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sceneId: 'corebox.selection.translate',
        capability: 'text.translate',
        providerId: 'prv_tencent_cloud_mt',
        assetKind: 'translated-image',
        resourceType: 'scene-output-image',
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        surface: 'scene-adapter-upload',
        started: 1,
        completed: 1,
        failed: 0,
        bytes: 3072,
        failureRate: 0,
        avgDurationMs: 180,
        avgSize: 3072,
        failureReasons: [],
        statusCodes: [],
      }),
      expect.objectContaining({
        sceneId: 'corebox.selection.translate',
        capability: 'text.translate',
        providerId: 'prv_tencent_cloud_mt',
        assetKind: 'translated-image',
        resourceType: 'scene-output-image',
        storageChannel: null,
        storageProvider: null,
        surface: 'scene-adapter-upload',
        started: 1,
        completed: 0,
        failed: 1,
        bytes: 0,
        failureRate: 100,
        avgSize: 10485760,
        failureReasons: expect.arrayContaining([
          expect.objectContaining({ key: 'scene-asset-preflight-failed', events: 1 }),
        ]),
        statusCodes: expect.arrayContaining([
          expect.objectContaining({ key: '413', events: 1 }),
        ]),
      }),
    ]))
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(sceneAssetAttempt)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(sceneAssetFailedAttempt)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(sceneAssetResourceId)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(sceneAssetFailedResourceId)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`translated-image-raw-${marker}`)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`translated-image-failed-raw-${marker}`)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`private/scene/raw-object-${marker}.png`)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`private/scene/raw-failed-object-${marker}.png`)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`translated-image-${marker}.png`)
    expect(JSON.stringify(analytics.uploads.sceneAssetHealth)).not.toContain(`failed-translated-image-${marker}.png`)
    expect(analytics.uploads.pipelineSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'resource',
        surface: 'dashboard-resource',
        storageChannel: null,
        storageProvider: null,
        attempts: 4,
        started: 2,
        completed: 0,
        failed: 2,
        stuck: 1,
        pending: 1,
        completionRate: 0,
        failureRate: 50,
        stuckRate: 25,
      }),
      expect.objectContaining({
        resourceType: 'resource',
        surface: 'dashboard-resource',
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        attempts: 1,
        completed: 1,
        failed: 0,
        stuck: 0,
        pending: 0,
        completionRate: 100,
        avgDurationMs: 120,
      }),
      expect.objectContaining({
        resourceType: 'scene-output-image',
        surface: 'scene-adapter-upload',
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        attempts: 1,
        started: 1,
        completed: 1,
        failed: 0,
        stuck: 0,
        pending: 0,
        completionRate: 100,
        failureRate: 0,
        avgDurationMs: 180,
      }),
      expect.objectContaining({
        resourceType: 'scene-output-image',
        surface: 'scene-adapter-upload',
        storageChannel: null,
        storageProvider: null,
        attempts: 1,
        started: 1,
        completed: 0,
        failed: 1,
        stuck: 0,
        pending: 0,
        completionRate: 0,
        failureRate: 100,
      }),
    ]))
    expect(analytics.uploads.statusTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        started: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number),
        bytes: expect.any(Number),
        uniqueActors: expect.any(Number),
      }),
    ]))
    expect(analytics.uploads.retrySummary).toMatchObject({
      retryableFailures: 2,
      nonRetryableFailures: 1,
      scheduledRetries: 1,
      exhaustedFailures: 1,
      recoveredUploads: 1,
      recoveredRetryCount: 2,
      recoveredRetryRate: 50,
      calibratedFailureSamples: 3,
      verifiedFailureSamples: 1,
      liveFailureSamples: 2,
      manualFailureSamples: 1,
      calibrationCoverageRate: 100,
    })
    expect(analytics.uploads.retrySummary.retryCount.average).toBe(2)
    expect(analytics.uploads.retrySummary.nextRetryDelayMs.average).toBe(2500)
    expect(analytics.uploads.retrySummary.recoveredAttempts.average).toBe(3)
    expect(analytics.uploads.byRetryDisposition).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'retry-scheduled', events: 1 }),
      expect.objectContaining({ key: 'retry-exhausted', events: 1 }),
      expect.objectContaining({ key: 'not-retryable', events: 1 }),
      expect.objectContaining({ key: 'retry-recovered', events: 1 }),
    ]))
    expect(analytics.uploads.failureMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'resource',
        surface: 'dashboard-resource',
        reason: 'r2-timeout',
        disposition: 'retry-scheduled',
        statusCode: 504,
        events: 1,
        retryable: 1,
        scheduled: 1,
        exhausted: 0,
        totalRetryCount: 1,
        nextRetryDelayMs: 5000,
        calibrationStatus: 'sampled',
        sampleSource: 'live',
        sampleCount: 1,
        latestSampleAt: expect.any(String),
        suggestedAction: 'retry-monitor',
      }),
      expect.objectContaining({
        resourceType: 'resource',
        surface: 'dashboard-resource',
        reason: 'oss-rate-limited',
        disposition: 'retry-exhausted',
        statusCode: 429,
        events: 1,
        retryable: 1,
        scheduled: 0,
        exhausted: 1,
        totalRetryCount: 3,
        calibrationStatus: 'verified',
        sampleSource: 'manual',
        sampleCount: 1,
        latestSampleAt: expect.any(String),
        suggestedAction: 'quota-policy-check',
      }),
      expect.objectContaining({
        resourceType: 'scene-output-image',
        surface: 'scene-adapter-upload',
        reason: 'scene-asset-preflight-failed',
        disposition: 'not-retryable',
        statusCode: 413,
        events: 1,
        retryable: 0,
        scheduled: 0,
        exhausted: 0,
        totalRetryCount: 0,
        calibrationStatus: 'sampled',
        sampleSource: 'live',
        sampleCount: 1,
        latestSampleAt: expect.any(String),
        suggestedAction: 'payload-validation',
      }),
    ]))
    expect(analytics.uploads.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        priority: 'high',
        suggestedAction: 'retry-monitor',
        reason: 'r2-timeout',
        failedAttempts: 1,
        retryableFailures: 1,
        scheduledRetries: 1,
        exhaustedRetries: 0,
        evidenceAttemptHashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{16}$/)]),
        evidenceResourceHashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{16}$/)]),
      }),
      expect.objectContaining({
        priority: 'critical',
        suggestedAction: 'quota-policy-check',
        reason: 'oss-rate-limited',
        statusCode: 429,
        failedAttempts: 1,
        exhaustedRetries: 1,
        calibrationStatus: 'verified',
        sampleSource: 'manual',
      }),
      expect.objectContaining({
        priority: 'medium',
        suggestedAction: 'payload-validation',
        reason: 'scene-asset-preflight-failed',
        resourceType: 'scene-output-image',
        surface: 'scene-adapter-upload',
        statusCode: 413,
        failedAttempts: 1,
        retryableFailures: 0,
        calibrationStatus: 'sampled',
        sampleSource: 'live',
      }),
      expect.objectContaining({
        priority: 'critical',
        suggestedAction: 'stuck-attempt-check',
        reason: 'application/octet-stream',
        stuckAttempts: 1,
        oldestAgeMs: expect.any(Number),
        evidenceAttemptHashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{16}$/)]),
        evidenceResourceHashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{16}$/)]),
      }),
    ]))
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(`stuck-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(`failed-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(`exhausted-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(sceneAssetAttempt)
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(sceneAssetFailedAttempt)
    expect(JSON.stringify(analytics.uploads.actionQueue)).not.toContain(`asset_failed_${marker}`)
    expect(analytics.uploads.retryTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        failed: expect.any(Number),
        retryable: 2,
        scheduled: 1,
        exhausted: 1,
        recovered: 1,
        uniqueActors: expect.any(Number),
      }),
    ]))
    expect(analytics.uploads.recoveredEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        attemptHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        resourceHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        resourceType: 'resource',
        surface: 'dashboard-resource',
        storageChannel: 's3',
        storageProvider: 'aws-s3',
        contentType: 'image/png',
        durationMs: 120,
        size: 2048,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        storageOperation: 'storage.write',
        storageStatusCode: 503,
        latestAt: expect.any(String),
      }),
    ]))
    expect(JSON.stringify(analytics.uploads.recoveredEvidence)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.uploads.recoveredEvidence)).not.toContain(`completed-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.recoveredEvidence)).not.toContain(`asset_${marker}`)
    expect(analytics.uploads.uploadSize.average).toBeCloseTo(2_100_633.6, 2)
    expect(analytics.uploads.uploadDurationMs.average).toBe(150)
    expect(analytics.uploads.problemAttempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'failed',
        resourceType: 'resource',
        surface: 'dashboard-resource',
        reason: 'r2-timeout',
        statusCode: 504,
        durationMs: null,
        retryable: true,
        retryCount: 1,
        maxRetries: 3,
        nextRetryDelayMs: 5000,
      }),
      expect.objectContaining({
        status: 'failed',
        resourceType: 'resource',
        surface: 'dashboard-resource',
        reason: 'oss-rate-limited',
        statusCode: 429,
        retryable: true,
        retryCount: 3,
        maxRetries: 3,
      }),
      expect.objectContaining({
        status: 'failed',
        resourceType: 'scene-output-image',
        surface: 'scene-adapter-upload',
        reason: 'scene-asset-preflight-failed',
        statusCode: 413,
        retryable: false,
      }),
      expect.objectContaining({
        status: 'stuck',
        resourceType: 'resource',
        surface: 'dashboard-resource',
        reason: null,
        statusCode: null,
      }),
    ]))
    expect(analytics.uploads.problemAttempts.every(item => /^[a-f0-9]{16}$/.test(item.attemptHash))).toBe(true)
    expect(analytics.uploads.problemAttempts.every(item => /^[a-f0-9]{16}$/.test(item.resourceHash))).toBe(true)
    expect(JSON.stringify(analytics.uploads.failureMatrix)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.uploads.failureMatrix)).not.toContain(`failed-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.failureMatrix)).not.toContain(sceneAssetFailedAttempt)
    expect(JSON.stringify(analytics.uploads.failureMatrix)).not.toContain(`asset_failed_${marker}`)
    expect(JSON.stringify(analytics.uploads.failureMatrix)).not.toContain(sceneAssetFailedResourceId)
    expect(JSON.stringify(analytics.uploads.pipelineSummary)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.uploads.pipelineSummary)).not.toContain(`failed-attempt-${marker}`)
    expect(JSON.stringify(analytics.uploads.pipelineSummary)).not.toContain(sceneAssetFailedAttempt)
    expect(JSON.stringify(analytics.uploads.pipelineSummary)).not.toContain(`asset_failed_${marker}`)
    expect(JSON.stringify(analytics.uploads.pipelineSummary)).not.toContain(sceneAssetFailedResourceId)
    expect(analytics.dashboard.growth.uploads).toEqual(expect.objectContaining({
      latestStarted: expect.any(Number),
      latestCompleted: expect.any(Number),
      latestFailed: expect.any(Number),
      failureRate: expect.any(Number),
      stuckRate: expect.any(Number),
    }))
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
    expect(analytics.storage.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        priority: 'medium',
        suggestedAction: 'configure-policy',
        reason: 'unmanaged-channel',
        channel: 'r2',
        provider: `cloudflare-r2-${marker}`,
        pressureStatus: 'unmanaged',
        events: 3,
        storedBytes: 2048,
        trafficBytes: 512,
        operations: 3,
        writes: 1,
        reads: 1,
        deletes: 1,
        uniqueActors: 1,
        policyId: null,
        policyName: null,
      }),
    ]))
    expect(JSON.stringify(analytics.storage.actionQueue)).not.toContain('storage-user@example.com')
    expect(JSON.stringify(analytics.storage.actionQueue)).not.toContain(`pkg:${marker}`)
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
    expect(analytics.providers.usageSummary).toEqual(expect.objectContaining({
      events: expect.any(Number),
      requests: expect.any(Number),
      tokens: expect.any(Number),
    }))
    expect(analytics.providers.usageSummary.requests).toBeGreaterThanOrEqual(1)
    expect(analytics.providers.usageSummary.tokens).toBeGreaterThanOrEqual(512)
    expect(analytics.providers.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requests: expect.any(Number),
        tokens: expect.any(Number),
        quantity: expect.any(Number),
        uniqueActors: expect.any(Number),
      }),
    ]))
    expect(analytics.providers.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerModel, quantity: 512 }),
    ]))
    expect(analytics.providers.byProviderType).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: providerType, quantity: 512 }),
    ]))
    expect(analytics.providers.modelDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: providerModel,
        quantity: 513,
        requests: 1,
        tokens: 512,
        uniqueActors: 1,
        byProvider: expect.arrayContaining([
          expect.objectContaining({ providerId, quantity: 513 }),
        ]),
        byChannel: expect.arrayContaining([
          expect.objectContaining({ channel: 'chat.completion', quantity: 513 }),
        ]),
        byProviderType: expect.arrayContaining([
          expect.objectContaining({ providerType, quantity: 512 }),
        ]),
      }),
    ]))
    expect(analytics.providers.modelChannelDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: providerModel,
        channel: 'chat.completion',
        quantity: 513,
        requests: 1,
        tokens: 512,
        uniqueActors: 1,
        byProvider: expect.arrayContaining([
          expect.objectContaining({ providerId, quantity: 513 }),
        ]),
        byProviderType: expect.arrayContaining([
          expect.objectContaining({ providerType, quantity: 512 }),
        ]),
      }),
    ]))
    expect(analytics.providers.channelDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        requests: 1,
        tokens: 512,
        quantity: 513,
        uniqueActors: 1,
        byModel: expect.arrayContaining([
          expect.objectContaining({ model: providerModel, tokens: 512 }),
        ]),
        byProviderType: expect.arrayContaining([
          expect.objectContaining({ providerType, quantity: 512 }),
        ]),
      }),
    ]))
    expect(analytics.dashboard.growth.providerUsage).toEqual(expect.objectContaining({
      requests: expect.any(Number),
      tokens: expect.any(Number),
      latestRequests: expect.any(Number),
      latestTokens: expect.any(Number),
    }))
    expect(analytics.dashboard.leaderboards.topModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: providerModel, tokens: 512 }),
    ]))
    expect(analytics.providers.quotaSummary).toEqual(expect.objectContaining({
      total: expect.any(Number),
      active: expect.any(Number),
      blocked: expect.any(Number),
      warning: expect.any(Number),
      disabled: expect.any(Number),
        highestRequestUtilization: expect.any(Number),
        highestTokenUtilization: 85.33,
        requestOverage: 0,
        tokenOverage: 0,
        lowestRemainingRequests: expect.any(Number),
        lowestRemainingTokens: expect.any(Number),
        nearestRequestExhaustionDays: expect.any(Number),
        nearestTokenExhaustionDays: expect.any(Number),
      }))
    expect(analytics.providers.quotaSummary.lowestRemainingTokens).toBeLessThanOrEqual(88)
    expect(analytics.providers.quotaSummary.nearestTokenExhaustionDays).toBeLessThanOrEqual(5.16)
    expect(analytics.providers.quotaSummary.highestRequestUtilization).toBeGreaterThanOrEqual(50)
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
        remaining: {
          requests: 1,
          tokens: 88,
        },
        overage: {
          requests: 0,
          tokens: 0,
        },
        burnRate: {
          requestsPerDay: 0.03,
          tokensPerDay: 17.07,
        },
        projectedExhaustionDays: {
          requests: 30,
          tokens: 5.16,
        },
      }),
    ]))
    expect(analytics.providers.quotaRiskItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        status: 'warning',
        highestUtilization: 85.33,
        riskReason: 'warning-threshold',
        remaining: {
          requests: 1,
          tokens: 88,
        },
        overage: {
          requests: 0,
          tokens: 0,
        },
        projectedExhaustionDays: {
          requests: 30,
          tokens: 5.16,
        },
      }),
    ]))
    expect(analytics.providers.quotaActionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        priority: 'medium',
        suggestedAction: 'monitor-burn-rate',
        reason: 'warning-threshold',
        status: 'warning',
        requests: 1,
        tokens: 512,
        maxRequests: 2,
        maxTokens: 600,
        requestUtilization: 50,
        tokenUtilization: 85.33,
        remainingRequests: 1,
        remainingTokens: 88,
        requestOverage: 0,
        tokenOverage: 0,
        requestsPerDay: 0.03,
        tokensPerDay: 17.07,
        projectedRequestExhaustionDays: 30,
        projectedTokenExhaustionDays: 5.16,
      }),
    ]))
    expect(analytics.providers.quotaSmokeEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        mode: 'consume',
        status: 'blocked',
        reason: 'token-quota-exceeded',
        requestRecorded: true,
        tokensRecorded: 128,
        events: 1,
        allowed: 0,
        blocked: 1,
        consumed: 0,
        failed: 0,
        uniqueActors: 1,
      }),
      expect.objectContaining({
        providerId,
        channel: 'chat.completion',
        mode: 'dry-run',
        status: 'allowed',
        reason: 'provider-quota-allows-request',
        requestRecorded: false,
        tokensRecorded: 0,
        events: 1,
        allowed: 1,
        blocked: 0,
        consumed: 0,
        failed: 0,
        uniqueActors: 1,
      }),
    ]))
    expect(JSON.stringify(analytics.providers.quotaRiskItems)).not.toContain('secure://')
    expect(JSON.stringify(analytics.providers.quotaRiskItems)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.providers.quotaActionQueue)).not.toContain('secure://')
    expect(JSON.stringify(analytics.providers.quotaActionQueue)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.providers.quotaSmokeEvidence)).not.toContain('secure://')
    expect(JSON.stringify(analytics.providers.quotaSmokeEvidence)).not.toContain('provider-admin@example.com')
    expect(analytics.dashboard.riskSummary).toEqual(expect.objectContaining({
      uploadProblems: expect.any(Number),
      storageAlerts: expect.any(Number),
      notificationRisks: expect.any(Number),
      providerQuotaWarning: expect.any(Number),
    }))
    expect(analytics.dashboard.trends).toEqual(expect.objectContaining({
      userGrowth: expect.any(Array),
      searches: expect.any(Array),
      pluginInstalls: expect.any(Array),
      providerUsage: expect.any(Array),
      uploadStatus: expect.any(Array),
      operationsTimeline: expect.any(Array),
    }))
    expect(analytics.dashboard.trends.operationsTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: expect.any(String),
        userSignups: expect.any(Number),
        searches: expect.any(Number),
        searchSelected: expect.any(Number),
        searchSelectionRate: expect.any(Number),
        searchProblems: expect.any(Number),
        pluginInstalls: expect.any(Number),
        pluginInvocations: expect.any(Number),
        providerRequests: expect.any(Number),
        providerTokens: expect.any(Number),
        uploadStarted: expect.any(Number),
        uploadCompleted: expect.any(Number),
        uploadFailed: expect.any(Number),
        uploadFailureRate: expect.any(Number),
        uploadBytes: expect.any(Number),
        storageOperations: expect.any(Number),
        storageBytes: expect.any(Number),
        riskScore: expect.any(Number),
      }),
    ]))
    expect(JSON.stringify(analytics.dashboard.trends.operationsTimeline)).not.toContain('admin@example.com')
    expect(JSON.stringify(analytics.dashboard.trends.operationsTimeline)).not.toContain(`failed-attempt-${marker}`)
    expect(serializedAnalytics).not.toContain('secure://')

    const report = await getPlatformGovernanceReportSnapshot(h3Event, { days: 30, limit: 5000, topLimit: 10 })
    const serializedReport = JSON.stringify(report)
    expect(report.report.scorecards).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'search-demand', status: 'watch', reason: 'search-problem-rate' }),
      expect.objectContaining({ key: 'provider-tokens', status: expect.stringMatching(/^(watch|critical)$/), reason: expect.stringMatching(/^provider-quota-/) }),
      expect.objectContaining({ key: 'upload-health', status: 'watch' }),
    ]))
    expect(report.report.evidenceStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'admin-cockpit',
        status: 'open',
        blocker: 'authenticated-browser-evidence-required',
      }),
      expect.objectContaining({
        key: 'provider-quota',
        status: 'local-only',
        evidenceCount: expect.any(Number),
        blocker: 'real-provider-call-evidence-required',
      }),
      expect.objectContaining({
        key: 'd1-production',
        status: 'open',
        blocker: 'production-d1-backfill-required',
      }),
    ]))
    expect(report.report.riskQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: 'search',
        suggestedAction: 'review-search-provider-and-zero-result-segments',
        reason: 'search-reliability-risk',
      }),
      expect.objectContaining({
        area: 'upload',
        suggestedAction: 'quota-policy-check',
        reason: 'oss-rate-limited',
      }),
      expect.objectContaining({
        area: 'provider-quota',
        suggestedAction: expect.stringMatching(/^(increase-request-limit|increase-token-limit|monitor-burn-rate|reduce-provider-traffic|split-provider-channel)$/),
        reason: expect.stringMatching(/^(request-exhausted|token-exhausted|warning-threshold|projected-exhaustion|request-overage|token-overage)$/),
      }),
    ]))
    expect(report.report.evidenceStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'storage-smoke',
        status: 'r2',
      }),
      expect.objectContaining({
        key: 'notification-send',
        status: 'open',
      }),
    ]))
    expect(report.report.leaderboards.hotPlugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ pluginId, hotScore: 21 }),
    ]))
    expect(report.report.leaderboards.topModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: providerModel, tokens: 512 }),
    ]))
    expect(report.report.trendSummary).toEqual(expect.objectContaining({
      operationsDays: expect.any(Number),
      peakProviderTokens: expect.any(Number),
      peakRiskScore: expect.any(Number),
    }))
    const markdownReport = formatPlatformGovernanceReportMarkdown(report)
    expect(markdownReport).toContain('# Nexus Data Governance Operations Report')
    expect(markdownReport).toContain('## Scorecards')
    expect(markdownReport).toContain('## Evidence Status')
    expect(markdownReport).toContain('## Risk Queue')
    expect(markdownReport).toContain('## Leaderboards')
    expect(markdownReport).toContain('search-demand')
    expect(markdownReport).toContain('provider-quota')
    expect(serializedReport).not.toContain('searcher@example.com')
    expect(serializedReport).not.toContain('admin@example.com')
    expect(serializedReport).not.toContain('storage-user@example.com')
    expect(serializedReport).not.toContain('provider-admin@example.com')
    expect(serializedReport).not.toContain(`failed-attempt-${marker}`)
    expect(serializedReport).not.toContain(sceneAssetFailedAttempt)
    expect(serializedReport).not.toContain(sceneAssetFailedResourceId)
    expect(serializedReport).not.toContain(`private/scene/raw-failed-object-${marker}.png`)
    expect(serializedReport).not.toContain(`pkg:${marker}`)
    expect(serializedReport).not.toContain('secure://')
    expect(markdownReport).not.toContain('searcher@example.com')
    expect(markdownReport).not.toContain('admin@example.com')
    expect(markdownReport).not.toContain('storage-user@example.com')
    expect(markdownReport).not.toContain('provider-admin@example.com')
    expect(markdownReport).not.toContain(`failed-attempt-${marker}`)
    expect(markdownReport).not.toContain(sceneAssetFailedAttempt)
    expect(markdownReport).not.toContain(sceneAssetFailedResourceId)
    expect(markdownReport).not.toContain(`private/scene/raw-failed-object-${marker}.png`)
    expect(markdownReport).not.toContain(`pkg:${marker}`)
    expect(markdownReport).not.toContain('secure://')

    const pluginAnalytics = await getPluginGovernanceAnalytics(h3Event, pluginId, { days: 30, limit: 5000, topLimit: 50 })
    expect(pluginAnalytics.downloads).toBe(2)
    expect(pluginAnalytics.installs).toBe(4)
    expect(pluginAnalytics.invocations).toBe(3)
    expect(pluginAnalytics.uniqueActors).toBe(1)
    expect(pluginAnalytics.conversion).toEqual({
      installRate: 200,
      invocationRate: 75,
      invocationsPerActor: 3,
    })
    expect(pluginAnalytics.conversionTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        downloads: 2,
        installs: 4,
        invocations: 3,
        uniqueActors: 1,
        installRate: 200,
        invocationRate: 75,
        invocationsPerActor: 3,
      }),
    ]))
    expect(pluginAnalytics.actionTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ key: 'download', quantity: 2 }),
          expect.objectContaining({ key: 'install', quantity: 4 }),
          expect.objectContaining({ key: 'invoke', quantity: 3 }),
        ]),
      }),
    ]))
    expect(pluginAnalytics.locationTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        countries: expect.arrayContaining([
          expect.objectContaining({ key: 'US', events: 3 }),
        ]),
        regions: expect.arrayContaining([
          expect.objectContaining({ key: 'CA', events: 3 }),
        ]),
      }),
    ]))
    expect(pluginAnalytics.channelTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ key: 'stable', events: 2, quantity: 6 }),
          expect.objectContaining({ key: 'feature-x', events: 1, quantity: 3 }),
        ]),
      }),
    ]))
    expect(pluginAnalytics.versionTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ key: '1.0.0', events: 2, quantity: 6 }),
        ]),
      }),
    ]))
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

  it('builds anonymized private plugin invocation health analytics', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(`plugin-invocation-${marker}`)
    const pluginId = `plugin_invocation_${marker}`

    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-caller-success@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'call',
      quantity: 3,
      metadata: {
        status: 'success',
        durationMs: 100,
        surface: 'corebox',
        countryCode: 'US',
        regionCode: 'CA',
        version: '1.0.0',
        localHour: 9,
        localDayOfWeek: 1,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-caller-failed@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'call',
      quantity: 1,
      metadata: {
        result: 'failed',
        latencyMs: 250,
        failureReason: 'adapter-timeout',
        surface: 'corebox',
        countryCode: 'US',
        regionCode: 'NY',
        version: '1.0.0',
        localTimeSlot: 'morning',
        localWeekday: 1,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-caller-redacted@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'beta',
      unit: 'call',
      quantity: 1,
      metadata: {
        success: false,
        elapsedMs: 400,
        reason: `user-${marker}@example.com/private/path`,
        surface: 'https://secret.example.com/workspace',
        countryCode: 'https://secret.example.com/country',
        regionCode: 'secret-token-region',
        version: `2.0.0/${marker}`,
        localTimeSlot: 'night',
        localDayOfWeek: 6,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-caller-skipped@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'call',
      quantity: 2,
      metadata: {
        outcome: 'skipped',
        durationMs: 20,
        surface: 'schedule',
        countryCode: 'JP',
        regionCode: 'tokyo',
        version: '1.1.0',
        localHour: 20,
        localDayOfWeek: 5,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'plugin',
      action: 'invoke',
      actorId: 'plugin-caller-unknown@example.com',
      resourceType: 'plugin',
      resourceId: pluginId,
      channel: 'stable',
      unit: 'call',
      quantity: 1,
    })

    const analytics = await getPluginGovernanceAnalytics(h3Event, pluginId, { days: 30, limit: 100, topLimit: 10 })
    const serializedHealth = JSON.stringify(analytics.invocationHealth)

    expect(analytics.invocationHealth).toEqual(expect.objectContaining({
      total: 8,
      successful: 3,
      failed: 2,
      skipped: 2,
      unknown: 1,
      uniqueActors: 5,
      successRate: 37.5,
      failureRate: 25,
      durationMs: {
        count: 4,
        average: 192.5,
        max: 400,
      },
    }))
    expect(analytics.invocationHealth.byStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'successful', events: 1, quantity: 3 }),
      expect.objectContaining({ key: 'failed', events: 2, quantity: 2 }),
      expect.objectContaining({ key: 'skipped', events: 1, quantity: 2 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1 }),
    ]))
    expect(analytics.invocationHealth.byFailureReason).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'adapter-timeout', events: 1, quantity: 1 }),
      expect.objectContaining({ key: 'redacted', events: 1, quantity: 1 }),
    ]))
    expect(analytics.invocationHealth.bySurface).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'corebox', events: 2, quantity: 4 }),
      expect.objectContaining({ key: 'schedule', events: 1, quantity: 2 }),
      expect.objectContaining({ key: 'redacted', events: 1, quantity: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1 }),
    ]))
    expect(analytics.invocationHealth.byCountry).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'us', events: 2, quantity: 4, uniqueActors: 2 }),
      expect.objectContaining({ key: 'jp', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'redacted', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.invocationHealth.byRegion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'ca', events: 1, quantity: 3, uniqueActors: 1 }),
      expect.objectContaining({ key: 'tokyo', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'ny', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'redacted', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.invocationHealth.byChannel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'stable', events: 4, quantity: 7, uniqueActors: 4 }),
      expect.objectContaining({ key: 'beta', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.invocationHealth.byVersion).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '1.0.0', events: 2, quantity: 4, uniqueActors: 2 }),
      expect.objectContaining({ key: '1.1.0', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'redacted', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.invocationHealth.byLocalTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'morning', events: 2, quantity: 4, uniqueActors: 2 }),
      expect.objectContaining({ key: 'evening', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'night', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.invocationHealth.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        total: 8,
        successful: 3,
        failed: 2,
        skipped: 2,
        unknown: 1,
        uniqueActors: 5,
        successRate: 37.5,
        failureRate: 25,
        durationMs: {
          count: 4,
          average: 192.5,
          max: 400,
        },
      }),
    ]))
    expect(analytics.usageTiming.byHour).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '09', events: 1, quantity: 3, uniqueActors: 1 }),
      expect.objectContaining({ key: '20', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 3, quantity: 3, uniqueActors: 3 }),
    ]))
    expect(analytics.usageTiming.byWeekday).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '1', events: 2, quantity: 4, uniqueActors: 2 }),
      expect.objectContaining({ key: '5', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: '6', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.usageTiming.byTimeSlot).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'morning', events: 2, quantity: 4, uniqueActors: 2 }),
      expect.objectContaining({ key: 'evening', events: 1, quantity: 2, uniqueActors: 1 }),
      expect.objectContaining({ key: 'night', events: 1, quantity: 1, uniqueActors: 1 }),
      expect.objectContaining({ key: 'unknown', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.usageTiming.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hours: expect.arrayContaining([
          expect.objectContaining({ key: '09', quantity: 3 }),
          expect.objectContaining({ key: '20', quantity: 2 }),
        ]),
        weekdays: expect.arrayContaining([
          expect.objectContaining({ key: '1', quantity: 4 }),
          expect.objectContaining({ key: '5', quantity: 2 }),
        ]),
        timeSlots: expect.arrayContaining([
          expect.objectContaining({ key: 'morning', quantity: 4 }),
          expect.objectContaining({ key: 'evening', quantity: 2 }),
        ]),
      }),
    ]))
    const serializedTiming = JSON.stringify(analytics.usageTiming)
    expect(serializedTiming).not.toContain('plugin-caller')
    expect(serializedTiming).not.toContain('example.com')
    expect(serializedTiming).not.toContain('secret-token-region')
    expect(serializedTiming).not.toContain(marker)
    expect(serializedHealth).not.toContain('plugin-caller')
    expect(serializedHealth).not.toContain('example.com')
    expect(serializedHealth).not.toContain('private/path')
    expect(serializedHealth).not.toContain('secret.example.com')
    expect(serializedHealth).not.toContain('secret-token-region')
    expect(serializedHealth).not.toContain(marker)
  })

  it('builds anonymized private plugin retention analytics', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(`plugin-retention-${marker}`)
    const pluginId = `plugin_retention_${marker}`

    const records = [
      ['retention-returning@example.com', 'download', 1, '2026-05-20T09:00:00.000Z'],
      ['retention-returning@example.com', 'invoke', 2, '2026-05-21T09:00:00.000Z'],
      ['retention-repeat@example.com', 'invoke', 1, '2026-05-20T10:00:00.000Z'],
      ['retention-repeat@example.com', 'invoke', 1, '2026-05-22T10:00:00.000Z'],
      ['retention-new@example.com', 'install', 1, '2026-05-22T11:00:00.000Z'],
    ] as const

    for (const [actorId, action, quantity, occurredAt] of records) {
      await recordPlatformGovernanceEvent(h3Event, {
        scope: 'plugin',
        action,
        actorId,
        resourceType: 'plugin',
        resourceId: pluginId,
        channel: 'stable',
        unit: action === 'invoke' ? 'call' : action,
        quantity,
        occurredAt,
      })
    }

    const analytics = await getPluginGovernanceAnalytics(h3Event, pluginId, { days: 30, limit: 100, topLimit: 10 })
    const serializedRetention = JSON.stringify(analytics.retention)

    expect(analytics.retention).toEqual(expect.objectContaining({
      activeActors: 3,
      newActors: 1,
      returningActors: 2,
      repeatActors: 2,
      invocationActors: 2,
      retentionRate: 66.67,
      repeatRate: 100,
      averageActiveDays: 1.67,
      averageInvocationsPerActor: 1.33,
      averageInvocationsPerReturningActor: 2,
    }))
    expect(analytics.retention.byActiveDays).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '2-3', events: 2, quantity: 2, uniqueActors: 2 }),
      expect.objectContaining({ key: '1', events: 1, quantity: 1, uniqueActors: 1 }),
    ]))
    expect(analytics.retention.trend).toEqual([
      expect.objectContaining({
        date: '2026-05-20',
        newActors: 2,
        returningActors: 0,
        activeActors: 2,
        invocationActors: 1,
        invocations: 1,
        retentionRate: 0,
      }),
      expect.objectContaining({
        date: '2026-05-21',
        newActors: 0,
        returningActors: 1,
        activeActors: 1,
        invocationActors: 1,
        invocations: 2,
        retentionRate: 100,
      }),
      expect.objectContaining({
        date: '2026-05-22',
        newActors: 1,
        returningActors: 1,
        activeActors: 2,
        invocationActors: 1,
        invocations: 1,
        retentionRate: 50,
      }),
    ])
    expect(serializedRetention).not.toContain('retention-returning@example.com')
    expect(serializedRetention).not.toContain('retention-repeat@example.com')
    expect(serializedRetention).not.toContain('retention-new@example.com')
  })

  it('builds aggregate private plugin owner action queue', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(`plugin-owner-action-${marker}`)
    const pluginId = `plugin_owner_action_${marker}`

    const records = [
      [`owner-download-${marker}@example.com`, 'download', 80, '2026-05-20T09:00:00.000Z'],
      [`owner-install-1-${marker}@example.com`, 'install', 1, '2026-05-21T09:00:00.000Z'],
      [`owner-install-2-${marker}@example.com`, 'install', 1, '2026-05-21T10:00:00.000Z'],
      [`owner-install-3-${marker}@example.com`, 'install', 1, '2026-05-21T11:00:00.000Z'],
      [`owner-install-4-${marker}@example.com`, 'install', 1, '2026-05-21T12:00:00.000Z'],
      [`owner-invoke-${marker}@example.com`, 'invoke', 5, '2026-05-22T09:00:00.000Z'],
    ] as const

    for (const [actorId, action, quantity, occurredAt] of records) {
      await recordPlatformGovernanceEvent(h3Event, {
        scope: 'plugin',
        action,
        actorId,
        resourceType: 'plugin',
        resourceId: pluginId,
        channel: 'stable',
        unit: action === 'invoke' ? 'call' : action,
        quantity,
        occurredAt,
        metadata: {
          countryCode: 'US',
          status: action === 'invoke' ? 'failed' : undefined,
        },
      })
    }

    const analytics = await getPluginGovernanceAnalytics(h3Event, pluginId, { days: 30, limit: 100, topLimit: 10 })
    const serializedQueue = JSON.stringify(analytics.actionQueue)

    expect(analytics.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'high-invocation-failure-rate',
        priority: 'high',
        suggestedAction: 'investigate-invocation-failures',
        reason: 'high-invocation-failure-rate',
        downloads: 80,
        installs: 4,
        invocations: 5,
        uniqueActors: 6,
        installRate: 5,
        invocationRate: 125,
        invocationsPerActor: 0.83,
        failureRate: 100,
        retentionRate: 0,
        topCountryKey: 'us',
        topCountryShare: 100,
        latestDate: '2026-05-22',
      }),
      expect.objectContaining({
        key: 'low-install-conversion',
        priority: 'high',
        suggestedAction: 'improve-install-conversion',
        reason: 'low-install-rate',
      }),
      expect.objectContaining({
        key: 'low-return-rate',
        priority: 'high',
        suggestedAction: 'improve-retention',
        reason: 'low-return-rate',
      }),
      expect.objectContaining({
        key: 'single-country-concentration',
        priority: 'medium',
        suggestedAction: 'expand-location-coverage',
        reason: 'single-country-concentration',
      }),
    ]))
    expect(analytics.actionQueue[0]?.priority).toBe('high')
    expect(serializedQueue).not.toContain('owner-download')
    expect(serializedQueue).not.toContain('owner-install')
    expect(serializedQueue).not.toContain('owner-invoke')
    expect(serializedQueue).not.toContain('example.com')
    expect(serializedQueue).not.toContain(marker)
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

    const policy = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `R2 pressure budget ${marker}`,
      channel: 'r2',
      provider: 'cloudflare-r2',
      targetId: resourceType,
      limits: {
        maxBytes: 1000,
        trafficBytes: 500,
        maxOperations: 4,
        alertBytes: 800,
      },
      warningThreshold: 70,
    }, 'admin')
    const idlePolicy = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'storage_channel',
      name: `Idle OSS pressure budget ${marker}`,
      channel: 'oss',
      provider: 'aliyun-oss',
      targetId: `unused-storage-${marker}`,
      config: {
        credentialRef: `secure://storage/idle-oss-${marker}`,
        bucket: 'idle-bucket',
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
      },
      limits: {
        maxBytes: 2048,
        trafficBytes: 4096,
        maxOperations: 10,
        alertBytes: 1536,
      },
      warningThreshold: 75,
    }, 'admin')

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
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'storage',
      action: 'storage.channel_smoke.ready',
      actorId: 'storage-admin@example.com',
      resourceType: 'storage_channel',
      resourceId: policy.id,
      channel: 'r2',
      unit: 'smoke',
      quantity: 1,
      metadata: {
        policyName: `R2 pressure budget ${marker}`,
        provider: 'cloudflare-r2',
        mode: 'dry-run',
        reason: 'storage-channel-resolved',
        operations: ['resolve'],
        credentialRequired: false,
        hasCredentialRef: false,
        hasCredential: null,
        bytesWritten: 0,
        bytesRead: 0,
        credentialRef: `secure://storage/r2-smoke-${marker}`,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'storage',
      action: 'storage.channel_smoke.sent',
      actorId: 'storage-admin@example.com',
      resourceType: 'storage_channel',
      resourceId: policy.id,
      channel: 'r2',
      unit: 'smoke',
      quantity: 1,
      metadata: {
        policyName: `R2 pressure budget ${marker}`,
        provider: 'cloudflare-r2',
        mode: 'write',
        reason: 'storage-channel-write-read-delete-ok',
        operations: ['resolve', 'write', 'read', 'delete'],
        credentialRequired: false,
        hasCredentialRef: false,
        hasCredential: null,
        bytesWritten: 21,
        bytesRead: 21,
        credentialRef: `secure://storage/r2-smoke-${marker}`,
      },
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.write',
      actorId: 'storage-admin@example.com',
      channel: 'memory',
      provider: 'memory',
      resourceType: `storage-smoke-local-${marker}`,
      resourceId: `storage-smoke:${policy.id}`,
      quantity: 21,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.read',
      actorId: 'storage-admin@example.com',
      channel: 'memory',
      provider: 'memory',
      resourceType: `storage-smoke-local-${marker}`,
      resourceId: `storage-smoke:${policy.id}`,
      quantity: 21,
    })
    await recordStorageChannelUsage(h3Event, {
      action: 'storage.delete',
      actorId: 'storage-admin@example.com',
      channel: 'memory',
      provider: 'memory',
      resourceType: `storage-smoke-local-${marker}`,
      resourceId: `storage-smoke:${policy.id}`,
      unit: 'operation',
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
    expect(analytics.storage.byResourceTypeUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `storage-smoke-local-${marker}`,
        storedBytes: 21,
        trafficBytes: 21,
        operations: 3,
        writes: 1,
        reads: 1,
        deletes: 1,
        uniqueActors: 1,
      }),
    ]))
    const memoryChannelBucket = analytics.storage.byChannelUsage.find(item => item.key === 'memory')
    expect(memoryChannelBucket?.storedBytes).toBeGreaterThanOrEqual(21)
    expect(memoryChannelBucket?.trafficBytes).toBeGreaterThanOrEqual(21)
    expect(memoryChannelBucket?.operations).toBeGreaterThanOrEqual(3)
    expect(memoryChannelBucket?.writes).toBeGreaterThanOrEqual(1)
    expect(memoryChannelBucket?.reads).toBeGreaterThanOrEqual(1)
    expect(memoryChannelBucket?.deletes).toBeGreaterThanOrEqual(1)

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

    const pressure = analytics.storage.channelPressure.find(item => item.policyId === policy.id)
    expect(pressure).toMatchObject({
      channel: 'r2',
      provider: 'cloudflare-r2',
      pressureStatus: 'warning',
      policyId: policy.id,
      policyName: `R2 pressure budget ${marker}`,
      policyReasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning']),
      highestUtilization: 90,
      remaining: expect.objectContaining({
        storedBytes: 100,
        trafficBytes: 200,
        operations: 1,
        alertBytes: 0,
      }),
      overage: expect.objectContaining({
        storedBytes: 0,
        trafficBytes: 0,
        operations: 0,
        alertBytes: 100,
      }),
      burnRate: expect.objectContaining({
        storedBytesPerDay: 30,
        trafficBytesPerDay: 10,
        operationsPerDay: 0.1,
      }),
      projectedExhaustionDays: expect.objectContaining({
        storedBytes: 3.33,
        trafficBytes: 20,
        operations: 10,
        alertBytes: 0,
      }),
    })
    expect(pressure?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(pressure?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(pressure?.operations).toBeGreaterThanOrEqual(3)
    expect(pressure?.writes).toBeGreaterThanOrEqual(1)
    expect(pressure?.reads).toBeGreaterThanOrEqual(1)
    expect(pressure?.deletes).toBeGreaterThanOrEqual(1)
    expect(pressure?.uniqueActors).toBeGreaterThanOrEqual(1)
    expect(pressure?.matchedPolicies).toBeGreaterThanOrEqual(1)
    expect(pressure?.policyAlerts).toBeGreaterThanOrEqual(1)
    const pressureTrend = pressure?.trend.at(-1)
    expect(pressureTrend?.storedBytes).toBeGreaterThanOrEqual(900)
    expect(pressureTrend?.trafficBytes).toBeGreaterThanOrEqual(300)
    expect(pressureTrend?.operations).toBeGreaterThanOrEqual(3)
    expect(pressureTrend?.uniqueActors).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        priority: 'high',
        suggestedAction: 'increase-operation-limit',
        reason: expect.stringMatching(/^(alert-bytes-reached|projected-exhaustion)$/),
        channel: 'r2',
        provider: 'cloudflare-r2',
        policyId: policy.id,
        policyName: `R2 pressure budget ${marker}`,
        pressureStatus: 'warning',
        highestUtilization: 90,
        policyAlerts: expect.any(Number),
        policyReasons: expect.arrayContaining(['alert-bytes-reached', 'max-bytes-warning']),
        remaining: expect.objectContaining({
          storedBytes: 100,
          trafficBytes: 200,
          operations: 1,
          alertBytes: 0,
        }),
        overage: expect.objectContaining({
          alertBytes: 100,
        }),
        burnRate: expect.objectContaining({
          storedBytesPerDay: 30,
          trafficBytesPerDay: 10,
          operationsPerDay: 0.1,
        }),
        projectedExhaustionDays: expect.objectContaining({
          storedBytes: 3.33,
          trafficBytes: 20,
          operations: 10,
          alertBytes: 0,
        }),
        latestTrendDate: expect.any(String),
      }),
    ]))
    expect(analytics.storage.actionQueue.find(item => item.policyId === policy.id)?.policyAlerts).toBeGreaterThanOrEqual(1)
    expect(analytics.storage.smokeEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: policy.id,
        policyName: `R2 pressure budget ${marker}`,
        channel: 'r2',
        provider: 'cloudflare-r2',
        mode: 'write',
        status: 'sent',
        reason: 'storage-channel-write-read-delete-ok',
        operations: ['resolve', 'write', 'read', 'delete'],
        bytesWritten: 21,
        bytesRead: 21,
        credentialRequired: false,
        hasCredentialRef: false,
        hasCredential: null,
        events: 1,
        ready: 0,
        sent: 1,
        failed: 0,
        uniqueActors: 1,
      }),
      expect.objectContaining({
        policyId: policy.id,
        mode: 'dry-run',
        status: 'ready',
        reason: 'storage-channel-resolved',
        operations: ['resolve'],
        events: 1,
        ready: 1,
        sent: 0,
        failed: 0,
        uniqueActors: 1,
      }),
    ]))

    const idlePressure = analytics.storage.channelPressure.find(item => item.policyId === idlePolicy.id)
    expect(idlePressure).toMatchObject({
      channel: 'oss',
      provider: 'aliyun-oss',
      events: 0,
      storedBytes: 0,
      trafficBytes: 0,
      operations: 0,
      writes: 0,
      reads: 0,
      deletes: 0,
      uniqueActors: 0,
      pressureStatus: 'ok',
      policyId: idlePolicy.id,
      policyName: `Idle OSS pressure budget ${marker}`,
      matchedPolicies: 1,
      policyAlerts: 0,
      policyReasons: [],
      highestUtilization: 0,
      remaining: expect.objectContaining({
        storedBytes: 2048,
        trafficBytes: 4096,
        operations: 10,
        alertBytes: 1536,
      }),
      overage: expect.objectContaining({
        storedBytes: 0,
        trafficBytes: 0,
        operations: 0,
        alertBytes: 0,
      }),
      burnRate: expect.objectContaining({
        storedBytesPerDay: 0,
        trafficBytesPerDay: 0,
        operationsPerDay: 0,
      }),
      projectedExhaustionDays: expect.objectContaining({
        storedBytes: null,
        trafficBytes: null,
        operations: null,
        alertBytes: null,
      }),
      trend: [],
    })
    expect(analytics.storage.actionQueue).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        policyId: idlePolicy.id,
      }),
    ]))
    expect(serialized).not.toContain('storage-user@example.com')
    expect(serialized).not.toContain('storage-admin@example.com')
    expect(serialized).not.toContain(resourceId)
    expect(serialized).not.toContain('diagnostics/storage-smoke')
    expect(serialized).not.toContain('tuff-storage-smoke-v1')
    expect(serialized).not.toContain(`secure://storage/idle-oss-${marker}`)
    expect(serialized).not.toContain(`secure://storage/r2-smoke-${marker}`)
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
        durationMs: 4,
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
        durationMs: 25,
        statusCode: 202,
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
        durationMs: 2,
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
        reason: 'adapter-http-error',
        durationMs: 75,
        statusCode: 502,
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      actorId: 'notification-admin@example.com',
      resourceType: 'notification_channel',
      resourceId: `channel-${marker}`,
      channel: 'email',
      unit: 'delivery',
      quantity: 1,
      metadata: {
        notificationAction: 'system.notification.test',
        configId: `channel-${marker}`,
        configName: `Resend channel ${marker}`,
        provider: `resend-test-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        reason: 'delivery-planned',
        durationMs: 3,
        context: {
          test: true,
          channelTestId: `channel-${marker}`,
          scenario: 'governance-channel-test',
          recipient: 'admin-recipient@example.com',
          credentialRef: `secure://notification/${marker}`,
        },
      },
    })
    await recordPlatformGovernanceEvent(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      actorId: 'notification-admin@example.com',
      resourceType: 'notification_channel',
      resourceId: `channel-${marker}`,
      channel: 'email',
      unit: 'delivery',
      quantity: 1,
      metadata: {
        notificationAction: 'system.notification.test',
        configId: `channel-${marker}`,
        configName: `Resend channel ${marker}`,
        provider: `resend-test-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        reason: 'delivery-sent',
        durationMs: 18,
        statusCode: 202,
        context: {
          test: true,
          channelTestId: `channel-${marker}`,
          scenario: 'governance-channel-test',
          body: 'notification body must not leak',
        },
      },
    })

    const analytics = await getPlatformGovernanceAnalytics(h3Event, { days: 30, limit: 5000, topLimit: 50 })
    const serialized = JSON.stringify(analytics)

    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('ops@example.com')
    expect(serialized).not.toContain('notification-admin@example.com')
    expect(serialized).not.toContain('admin-recipient@example.com')
    expect(serialized).not.toContain('notification body must not leak')
    expect(serialized).not.toContain('secure://')
    expect(analytics.notifications.deliveries.total).toBeGreaterThanOrEqual(3)
    expect(analytics.notifications.deliveries.planned).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.sent).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.skipped).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.failed).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.deliveries.plannedRate).toBeGreaterThan(0)
    expect(analytics.notifications.deliveries.sentRate).toBeGreaterThan(0)
    expect(analytics.notifications.deliveries.failureRate).toBeGreaterThan(0)
    expect(analytics.notifications.deliveries.durationMs).toEqual(expect.objectContaining({
      count: 6,
      average: 21.17,
      max: 75,
    }))
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'planned')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'sent')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'skipped')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byDeliveryStatus.find(item => item.key === 'failed')?.events).toBeGreaterThanOrEqual(1)
    expect(analytics.notifications.byProvider).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `resend-primary-${marker}`, events: 2 }),
      expect.objectContaining({ key: `resend-test-${marker}`, events: 2 }),
      expect.objectContaining({ key: `smtp-ops-${marker}`, events: 1 }),
    ]))
    expect(analytics.notifications.byAdapter).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email/resend', events: 4 }),
      expect.objectContaining({ key: 'email/smtp', events: 1 }),
    ]))
    expect(analytics.notifications.byReason).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'delivery-sent', events: 2 }),
      expect.objectContaining({ key: 'adapter-http-error', events: 1 }),
    ]))
    expect(analytics.notifications.byStatusCode).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: '202', events: 2 }),
      expect.objectContaining({ key: '502', events: 1 }),
    ]))
    expect(analytics.notifications.byNotificationAction.find(item => item.key === 'plugin.version.approved')?.events).toBeGreaterThanOrEqual(4)
    expect(analytics.notifications.byNotificationAction.find(item => item.key === 'system.notification.test')?.events).toBe(2)
    expect(analytics.notifications.deliveryTrend).toEqual(expect.arrayContaining([
      expect.objectContaining({
        planned: expect.any(Number),
        sent: expect.any(Number),
        skipped: expect.any(Number),
        failed: expect.any(Number),
        uniqueActors: expect.any(Number),
      }),
    ]))
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
        durationMs: expect.objectContaining({
          count: 2,
          average: 14.5,
          max: 25,
        }),
      }),
      expect.objectContaining({
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        failed: 1,
        sentRate: 0,
        failureRate: 100,
        latestFailureReason: 'adapter-http-error',
        latestFailureStatusCode: 502,
        latestFailureAt: expect.any(String),
        durationMs: expect.objectContaining({
          count: 1,
          average: 75,
          max: 75,
        }),
      }),
    ]))
    expect(analytics.notifications.deliveryEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `resend-primary-${marker}:plugin.version.approved:plugin`,
        notificationAction: 'plugin.version.approved',
        resourceType: 'plugin',
        channel: 'email',
        provider: `resend-primary-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        status: 'sent',
        reason: 'delivery-sent',
        durationMs: 25,
        statusCode: 202,
        events: 2,
        planned: 1,
        sent: 1,
        failed: 0,
        uniqueActors: 1,
      }),
      expect.objectContaining({
        key: `smtp-ops-${marker}:plugin.version.approved:plugin`,
        notificationAction: 'plugin.version.approved',
        resourceType: 'plugin',
        provider: `smtp-ops-${marker}`,
        status: 'failed',
        reason: 'adapter-http-error',
        failed: 1,
      }),
    ]))
    expect(analytics.notifications.deliveryEvidence).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        notificationAction: 'system.notification.test',
      }),
    ]))
    expect(analytics.notifications.testEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `channel-${marker}:system.notification.test`,
        configId: `channel-${marker}`,
        configName: `Resend channel ${marker}`,
        notificationAction: 'system.notification.test',
        channel: 'email',
        provider: `resend-test-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        status: 'sent',
        reason: 'delivery-sent',
        durationMs: 18,
        statusCode: 202,
        events: 2,
        planned: 1,
        sent: 1,
        failed: 0,
        uniqueActors: 1,
      }),
    ]))
    expect(analytics.notifications.testEvidence).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        notificationAction: 'plugin.version.approved',
      }),
    ]))
    expect(analytics.notifications.actionQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'delivery-health',
        priority: 'critical',
        suggestedAction: 'investigate-failures',
        reason: 'adapter-http-error',
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        channel: 'email',
        status: 'delivery-risk',
        total: 1,
        failed: 1,
        sentRate: 0,
        failureRate: 100,
        latestFailureReason: 'adapter-http-error',
        latestFailureStatusCode: 502,
        latestFailureAt: expect.any(String),
        durationMs: expect.objectContaining({
          count: 1,
          average: 75,
          max: 75,
        }),
      }),
      expect.objectContaining({
        source: 'delivery-health',
        priority: 'medium',
        suggestedAction: 'review-skipped-deliveries',
        reason: 'skipped-deliveries',
        provider: 'browser',
        providerType: 'browser',
        adapter: 'browser',
        skipped: 1,
      }),
    ]))
    expect(JSON.stringify(analytics.notifications.testEvidence)).not.toContain('notification-admin@example.com')
    expect(JSON.stringify(analytics.notifications.testEvidence)).not.toContain('admin-recipient@example.com')
    expect(JSON.stringify(analytics.notifications.testEvidence)).not.toContain('notification body must not leak')
    expect(JSON.stringify(analytics.notifications.testEvidence)).not.toContain('secure://')
    expect(JSON.stringify(analytics.notifications.deliveryEvidence)).not.toContain('reviewer@example.com')
    expect(JSON.stringify(analytics.notifications.deliveryEvidence)).not.toContain('ops@example.com')
    expect(JSON.stringify(analytics.notifications.deliveryEvidence)).not.toContain('secure://')
    expect(JSON.stringify(analytics.notifications.actionQueue)).not.toContain('reviewer@example.com')
    expect(JSON.stringify(analytics.notifications.actionQueue)).not.toContain('ops@example.com')
    expect(JSON.stringify(analytics.notifications.actionQueue)).not.toContain('secure://')
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
