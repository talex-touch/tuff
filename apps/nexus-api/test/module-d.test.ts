import { describe, expect, it } from 'vitest'
import adminUsageHandler from '../server/api/admin/usage.get'
import telemetryBatchHandler from '../server/api/telemetry/batch.post'
import telemetryIngestHandler from '../server/api/telemetry/ingest.post'
import telemetryRecordHandler from '../server/api/telemetry/record.post'
import { setUserPrivacySettings } from '../server/utils/authStore'
import { createAudit } from '../server/utils/intelligenceStore'
import {
  buildSessionCookieHeader,
  createSqliteD1Database,
  createTestEvent,
  seedTestUser,
} from './helpers/test-runtime'

describe('Module D: Minimal Telemetry Ingest + 6-Dimension Boss Usage Analytics', () => {
  it('ingests high-value events, maps legacy visit/search aliases, skips noise, enforces idempotency & privacy, and ignores forged userId', async () => {
    const db = createSqliteD1Database()
    const victim = await seedTestUser(db, { email: 'victim@example.com' })
    const optedOut = await seedTestUser(db, { email: 'private@example.com' })
    await setUserPrivacySettings(createTestEvent({ db }), optedOut.id, {
      analytics: false,
      crashReports: false,
      usageData: false,
    })

    // 1. Forged body.userId on unauthenticated request must NOT be attributed to victim
    const forgedRes = await telemetryRecordHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/record',
      cf: { country: 'US' },
      body: {
        eventType: 'visit',
        userId: victim.id,
        clientId: 'client-1',
        platform: 'darwin',
        arch: 'arm64',
        version: '2.5.0',
        isAnonymous: false,
        metadata: { kind: 'startup', idempotencyKey: 'startup-client-1-20261128' },
      },
    }))
    expect(forgedRes.accepted).toBe(1)
    expect(forgedRes.duplicate).toBe(false)

    const row = db.sqlite.prepare(`SELECT event_type, user_id, country_code, channel FROM telemetry_events WHERE client_id = 'client-1'`).get() as {
      event_type: string
      user_id: string | null
      country_code: string | null
      channel: string | null
    }
    expect(row.event_type).toBe('app_launch')
    expect(row.user_id).toBeNull()
    expect(row.country_code).toBe('US')
    expect(row.channel).toBe('RELEASE')

    // 2. Exact replay via metadata.idempotencyKey returns duplicate: true without adding a second row
    const replayRes = await telemetryRecordHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/record',
      cf: { country: 'US' },
      body: {
        eventType: 'visit',
        userId: victim.id,
        clientId: 'client-1',
        platform: 'darwin',
        arch: 'arm64',
        version: '2.5.0',
        isAnonymous: false,
        metadata: { kind: 'startup', idempotencyKey: 'startup-client-1-20261128' },
      },
    }))
    expect(replayRes.duplicate).toBe(true)

    // 3. Different payload with same X-Idempotency-Key -> 409 Conflict
    const batchKey = 'batch-key-20261128-abc'
    const batch1 = await telemetryBatchHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/batch',
      headers: { 'x-idempotency-key': batchKey },
      cf: { country: 'JP' },
      body: {
        events: [
          { eventType: 'search', clientId: 'client-2', platform: 'win32', arch: 'x64', version: '2.5.0-beta.1' },
          { eventType: 'performance', clientId: 'client-2', platform: 'win32', version: '2.5.0-beta.1' },
          { eventType: 'plugin_action', clientId: 'client-2', pluginId: 'touch-translate', platform: 'win32', version: '2.5.0-beta.1' },
        ],
      },
    }))
    expect(batch1.accepted).toBe(2)
    expect(batch1.skipped).toBe(1) // performance noise skipped
    expect(batch1.duplicate).toBe(false)

    await expect(telemetryBatchHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/batch',
      headers: { 'x-idempotency-key': batchKey },
      body: {
        events: [
          { eventType: 'error', clientId: 'client-2', platform: 'win32', version: '2.5.0-beta.1' },
        ],
      },
    }))).rejects.toMatchObject({ statusCode: 409 })

    // 4. Privacy opt-out skips writing events for opted-out authenticated user
    const optedOutCookie = await buildSessionCookieHeader({ userId: optedOut.id, email: optedOut.email })
    const optedOutRes = await telemetryIngestHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/ingest',
      headers: { cookie: optedOutCookie },
      body: {
        events: [
          { eventType: 'app_launch', clientId: 'private-client', version: '2.5.0' },
          { eventType: 'error', clientId: 'private-client', version: '2.5.0' },
        ],
      },
    }))
    expect(optedOutRes.accepted).toBe(0)
    expect(optedOutRes.skipped).toBe(2)
  })

  it('aggregates all 6 boss usage dimensions in pure SQL via GET /api/admin/usage', async () => {
    const db = createSqliteD1Database()
    const admin = await seedTestUser(db, { email: 'boss@example.com', role: 'admin' })
    const adminCookie = await buildSessionCookieHeader({ userId: admin.id, email: admin.email, role: 'admin' })

    // Ingest events across versions, OS/arch, countries, features, plugins, and errors
    await telemetryIngestHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/ingest',
      cf: { country: 'CN' },
      body: {
        events: [
          { eventType: 'app_launch', clientId: 'dev-a', platform: 'darwin', arch: 'arm64', version: '2.5.0' },
          { eventType: 'feature_use', clientId: 'dev-a', feature: 'corebox.search', platform: 'darwin', version: '2.5.0' },
          { eventType: 'plugin_action', clientId: 'dev-a', pluginId: 'touch-clipboard', platform: 'darwin', version: '2.5.0' },
          { eventType: 'error', clientId: 'dev-a', platform: 'darwin', version: '2.5.0', errorCode: 'E_SYNC' },
        ],
      },
    }))
    await telemetryIngestHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/telemetry/ingest',
      cf: { country: 'US' },
      body: {
        events: [
          { eventType: 'app_launch', clientId: 'dev-b', platform: 'win32', arch: 'x64', version: '2.5.1-beta.1' },
          { eventType: 'feature_use', clientId: 'dev-b', feature: 'corebox.search', platform: 'win32', version: '2.5.1-beta.1' },
        ],
      },
    }))

    // Seed AI gateway audit rows
    await createAudit(createTestEvent({ db }), {
      userId: admin.id,
      providerId: 'prov-openai',
      providerType: 'openai',
      model: 'gpt-4o-mini',
      latency: 180,
      success: true,
      metadata: { totalTokens: 100 },
    })

    const usage = await adminUsageHandler(createTestEvent({
      db,
      url: '/api/admin/usage?days=30',
      headers: { cookie: adminCookie },
    }))

    // 1. Active users & devices
    expect(usage.activeUsers.dau).toBe(2)
    expect(usage.activeUsers.wau).toBe(2)
    expect(usage.activeUsers.mau).toBe(2)
    expect(usage.activeUsers.activeDevices).toBe(2)
    expect(usage.activeUsers.totalRegisteredUsers).toBe(1)
    expect(usage.activeUsers.dailySeries.length).toBeGreaterThanOrEqual(1)

    // 2. Version/channel & OS/arch distribution
    expect(usage.distribution.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: '2.5.0', channel: 'RELEASE', count: 1 }),
        expect.objectContaining({ version: '2.5.1-beta.1', channel: 'BETA', count: 1 }),
      ]),
    )
    expect(usage.distribution.platforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'darwin', arch: 'arm64' }),
        expect.objectContaining({ platform: 'win32', arch: 'x64' }),
      ]),
    )

    // 3. Country/region Top N from cf.country
    expect(usage.regions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ countryCode: 'CN' }),
        expect.objectContaining({ countryCode: 'US' }),
      ]),
    )

    // 4. Top feature usage
    expect(usage.topFeatures[0]).toMatchObject({ feature: 'corebox.search', count: 2 })

    // 5. Top plugins & AI gateway
    expect(usage.ecosystem.topPlugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ pluginId: 'touch-clipboard', actions: 1 })]),
    )
    expect(usage.ecosystem.aiGateway.totalRequests).toBe(1)
    expect(usage.ecosystem.aiGateway.successRate).toBe(1)
    expect(usage.ecosystem.aiGateway.totalTokens).toBe(100)

    // 6. Stability / error rate by version
    expect(usage.stability.totalErrors).toBe(1)
    expect(usage.stability.totalLaunches).toBe(2)
    expect(usage.stability.errorRate).toBe(0.5)
    expect(usage.stability.byVersion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: '2.5.0', errors: 1, launches: 1, errorRate: 1 }),
      ]),
    )
  })
})
