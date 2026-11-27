import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../../test/helpers/d1-sqlite'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../../test/helpers/d1-sqlite'

vi.mock('../cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

vi.mock('../storageObjectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storageObjectStore')>()
  return {
    ...actual,
    getStorageObject: vi.fn(async ({ memoryStorage, key }) => memoryStorage.get(key) ?? null),
    putStorageObject: vi.fn(async ({ memoryStorage, key, data, contentType }) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      memoryStorage.set(key, { data: buffer, contentType })
      return {
        key,
        size: buffer.byteLength,
        sha256: 'sha256',
        contentType,
        storageChannel: 'memory',
        storageProvider: 'memory',
      }
    }),
    deleteStorageObject: vi.fn(async ({ memoryStorage, key }) => {
      memoryStorage.delete(key)
    }),
  }
})

let d1: SqliteD1Database
let event: H3Event
let privacyStore: typeof import('../privacyDataStore')
let authStore: typeof import('../authStore')
let apiKeyStore: typeof import('../apiKeyStore')

function createEvent(db: SqliteD1Database): H3Event {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}

function expectNoPrivateKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value)
      expectNoPrivateKeys(item)
    return
  }
  if (!value || typeof value !== 'object')
    return

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    expect(key).not.toMatch(/secret|token|hash|password|credential/i)
    expectNoPrivateKeys(item)
  }
}

function seedExtraDomainTables(db: SqliteD1Database) {
  db.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      client_id TEXT,
      device_fingerprint TEXT,
      platform TEXT,
      version TEXT,
      region TEXT,
      ip TEXT,
      search_query TEXT,
      metadata TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS intelligence_audits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      model TEXT NOT NULL,
      endpoint TEXT,
      status INTEGER,
      latency INTEGER,
      success INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      trace_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asr_transcription_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      object_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      delivery_token_hash TEXT NOT NULL,
      delivery_expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      charged_credits INTEGER,
      billed_seconds INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_quotas_v1 (
      user_id TEXT PRIMARY KEY,
      plan_tier TEXT NOT NULL,
      storage_limit_bytes INTEGER NOT NULL,
      used_storage_bytes INTEGER NOT NULL,
      object_limit INTEGER NOT NULL,
      used_objects INTEGER NOT NULL,
      item_limit INTEGER NOT NULL,
      device_limit INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_items_v1 (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      payload_enc TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS sync_blobs_v1 (
      user_id TEXT NOT NULL,
      blob_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (user_id, blob_id)
    );
    CREATE TABLE IF NOT EXISTS sync_sessions_v1 (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

function seedUserWithCredentials(userId = 'user-1', email = 'owner@example.com', status = 'active') {
  const createdAt = '2026-06-01T00:00:00.000Z'
  d1.sqlite.prepare(`
    INSERT INTO auth_users (
      id, email, name, email_verified, email_state, role, locale, status,
      privacy_analytics, privacy_crash_reports, privacy_usage_data, privacy_personalization,
      created_at
    ) VALUES (?, ?, 'Owner Name', ?, 'verified', 'user', 'zh', ?, 1, 1, 0, 1, ?)
  `).run(userId, email, createdAt, status, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at)
    VALUES (?, ?, 'github', ?, ?)
  `).run(`acc-${userId}`, userId, `gh-${userId}`, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO auth_passkeys (id, user_id, credential_id, public_key, transports, created_at)
    VALUES (?, ?, ?, 'public-key-private', '["internal"]', ?)
  `).run(`pk-${userId}`, userId, `cred-${userId}`, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO auth_devices (id, user_id, device_name, platform, created_at, token_version)
    VALUES (?, ?, 'MacBook', 'darwin', ?, 1)
  `).run(`dev-${userId}`, userId, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO auth_login_tokens (token, user_id, reason, expires_at, created_at)
    VALUES (?, ?, 'magic', '2026-12-01T00:00:00.000Z', ?)
  `).run(`tok-${userId}`, userId, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO auth_login_history (id, user_id, device_id, ip, user_agent, success, reason, client_type, created_at)
    VALUES (?, ?, ?, '203.0.113.10', 'vitest', 1, 'password', 'web', ?)
  `).run(`lh-${userId}`, userId, `dev-${userId}`, createdAt)

  d1.sqlite.prepare(`
    INSERT INTO user_api_keys (id, user_id, name, key_prefix, key_hash, scopes, created_at)
    VALUES (?, ?, 'CLI Key', 'tuff_abc...', 'private-hash', '["plugin:publish"]', ?)
  `).run(`key-${userId}`, userId, createdAt)
}

function seedOwnedDomainRecords(userId = 'user-1') {
  seedExtraDomainTables(d1)
  d1.sqlite.prepare(`
    INSERT INTO telemetry_events (id, event_type, user_id, client_id, device_fingerprint, platform, version, region, ip, search_query, is_anonymous, created_at)
    VALUES ('tel-1', 'search', ?, 'cli-1', 'fp-secret', 'darwin', '2.4.15', 'US', '203.0.113.10', 'secret query', 0, '2026-06-10T00:00:00.000Z')
  `).run(userId)

  d1.sqlite.prepare(`
    INSERT INTO intelligence_audits (id, user_id, provider_id, provider_type, model, endpoint, status, latency, success, error_message, trace_id, metadata, created_at)
    VALUES ('ia-1', ?, 'prov-1', 'openai', 'gpt-4o', 'https://secret.endpoint', 200, 120, 1, NULL, 'trace-1', '{"prompt":"secret"}', '2026-06-11T00:00:00.000Z')
  `).run(userId)

  d1.sqlite.prepare(`
    INSERT INTO asr_transcription_requests (
      id, user_id, provider_id, capability, idempotency_key, request_hash, object_key,
      content_type, byte_size, duration_seconds, delivery_token_hash, delivery_expires_at,
      status, charged_credits, billed_seconds, created_at, updated_at
    ) VALUES (
      'asr-1', ?, 'dashscope', 'audio.transcribe', 'asr-idem-1', 'req-hash', 'asr/u1/1.wav',
      'audio/wav', 1024, 15, 'delivery-hash', '2026-06-12T00:00:00.000Z',
      'settled', 30, 15, '2026-06-11T00:00:00.000Z', '2026-06-11T00:01:00.000Z'
    )
  `).run(userId)

  d1.sqlite.prepare(`
    INSERT INTO sync_quotas_v1 (user_id, plan_tier, storage_limit_bytes, used_storage_bytes, object_limit, used_objects, item_limit, device_limit, updated_at)
    VALUES (?, 'PRO', 104857600, 4096, 50000, 2, 5242880, 3, '2026-06-11T00:00:00.000Z')
  `).run(userId)
  d1.sqlite.prepare(`
    INSERT INTO sync_items_v1 (user_id, item_id, type, schema_version, payload_enc, updated_at)
    VALUES (?, 'item-1', 'note', 1, 'encrypted-payload', '2026-06-11T00:00:00.000Z')
  `).run(userId)
  d1.sqlite.prepare(`
    INSERT INTO sync_blobs_v1 (user_id, blob_id, object_key, sha256, size_bytes, created_at, status)
    VALUES (?, 'blob-1', 'sync/user-1/blob-1', 'abc123', 128, '2026-06-11T00:00:00.000Z', 'ready')
  `).run(userId)
  d1.sqlite.prepare(`
    INSERT INTO sync_sessions_v1 (id, user_id, device_id, created_at)
    VALUES ('sess-1', ?, 'dev-user-1', '2026-06-11T00:00:00.000Z')
  `).run(userId)
}

function rowCount(table: string, userId = 'user-1'): number {
  const row = d1.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).get(userId) as { count: number }
  return Number(row.count)
}

beforeEach(async () => {
  vi.useRealTimers()
  vi.resetModules()
  d1 = createSqliteD1()
  event = createEvent(d1)
  authStore = await import('../authStore')
  apiKeyStore = await import('../apiKeyStore')
  privacyStore = await import('../privacyDataStore')
  await authStore.ensureAuthSchema(d1 as any)
  await apiKeyStore.ensureApiKeySchema(d1 as any)
  seedUserWithCredentials()
})

afterEach(() => {
  d1.close()
})

describe('privacy data store (atomic lifecycle & export coverage)', () => {
  it('advances a queued export job, includes telemetry/provider usage/sync, and redacts all private fields', async () => {
    seedOwnedDomainRecords()

    const created = await privacyStore.createPrivacyExportJob(event, 'user-1')
    expect(created.status).toBe('queued')

    const completed = await privacyStore.advancePrivacyExportJob(event, 'user-1', created.id)
    expect(completed?.status).toBe('succeeded')

    const payload = await privacyStore.getPrivacyExportPayload(event, 'user-1', created.id)
    const parsed = JSON.parse(payload.data.toString('utf8'))
    expect(parsed.account.email).toBe('owner@example.com')
    expect(parsed.telemetry).toEqual({
      totalCount: 1,
      recentEvents: [
        expect.objectContaining({
          id: 'tel-1',
          eventType: 'search',
          platform: 'darwin',
          version: '2.4.15',
          region: 'US',
          isAnonymous: false,
        }),
      ],
    })
    expect(parsed.providerUsage.intelligenceAudits).toHaveLength(1)
    expect(parsed.providerUsage.intelligenceAudits[0]).toMatchObject({
      id: 'ia-1',
      providerId: 'prov-1',
      model: 'gpt-4o',
      traceId: 'trace-1',
    })
    expect(parsed.providerUsage.asrRequests).toHaveLength(1)
    expect(parsed.providerUsage.asrRequests[0]).toMatchObject({
      id: 'asr-1',
      providerId: 'dashscope',
      chargedCredits: 30,
    })
    expect(parsed.syncSummary).toMatchObject({
      itemCount: 1,
      blobCount: 1,
      sessionCount: 1,
      quota: expect.objectContaining({ planTier: 'PRO', usedStorageBytes: 4096 }),
    })

    const serialized = JSON.stringify(parsed)
    expect(serialized).not.toContain('secret query')
    expect(serialized).not.toContain('fp-secret')
    expect(serialized).not.toContain('203.0.113.10')
    expect(serialized).not.toContain('https://secret.endpoint')
    expect(serialized).not.toContain('encrypted-payload')
    expectNoPrivateKeys(parsed)
  })

  it('rejects account deletion before the server-side reading window completes', async () => {
    const session = await privacyStore.createAccountDeletionTermsSession(event, 'user-1')

    await expect(
      privacyStore.submitAccountDeletion(event, 'user-1', session.id, privacyStore.ACCOUNT_DELETION_CONFIRM_PHRASE),
    ).rejects.toMatchObject({
      statusCode: 409,
      data: {
        remainingSeconds: expect.any(Number),
      },
    })
  })

  it('atomically marks deletion_pending, consumes terms session, and revokes all credentials in one batch', async () => {
    const session = await privacyStore.createAccountDeletionTermsSession(event, 'user-1')
    d1.sqlite
      .prepare('UPDATE account_deletion_terms_sessions SET earliest_confirm_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), session.id)

    const result = await privacyStore.submitAccountDeletion(
      event,
      'user-1',
      session.id,
      privacyStore.ACCOUNT_DELETION_CONFIRM_PHRASE,
    )

    expect(result.success).toBe(true)
    expect(result.user?.status).toBe('deletion_pending')
    expect(result.revokedDevices).toBe(1)
    expect(result.deletedApiKeys).toBe(1)

    const sessionRow = d1.sqlite
      .prepare('SELECT consumed_at FROM account_deletion_terms_sessions WHERE id = ?')
      .get(session.id) as { consumed_at: string | null }
    expect(sessionRow.consumed_at).toBeTruthy()
    expect(rowCount('auth_login_tokens')).toBe(0)
    expect(rowCount('user_api_keys')).toBe(0)

    const deviceRow = d1.sqlite
      .prepare('SELECT revoked_at, token_version FROM auth_devices WHERE user_id = ?')
      .get('user-1') as { revoked_at: string | null, token_version: number }
    expect(deviceRow.revoked_at).toBeTruthy()
    expect(deviceRow.token_version).toBe(2)
  })

  it('rejects a reused terms session with 409', async () => {
    const session = await privacyStore.createAccountDeletionTermsSession(event, 'user-1')
    d1.sqlite
      .prepare('UPDATE account_deletion_terms_sessions SET earliest_confirm_at = ?, consumed_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), new Date().toISOString(), session.id)

    await expect(
      privacyStore.submitAccountDeletion(event, 'user-1', session.id, privacyStore.ACCOUNT_DELETION_CONFIRM_PHRASE),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rolls back user status, terms consumption, devices, and tokens when API key deletion fails mid-batch', async () => {
    const session = await privacyStore.createAccountDeletionTermsSession(event, 'user-1')
    d1.sqlite
      .prepare('UPDATE account_deletion_terms_sessions SET earliest_confirm_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), session.id)

    d1.sqlite.exec(`
      CREATE TRIGGER fail_api_key_delete
      BEFORE DELETE ON user_api_keys
      BEGIN
        SELECT RAISE(ABORT, 'simulated api key delete failure');
      END;
    `)

    await expect(
      privacyStore.submitAccountDeletion(event, 'user-1', session.id, privacyStore.ACCOUNT_DELETION_CONFIRM_PHRASE),
    ).rejects.toThrow('simulated api key delete failure')

    // Every single table remained untouched — zero partial state.
    const user = await authStore.getUserById(event, 'user-1')
    expect(user?.status).toBe('active')
    const sessionRow = d1.sqlite
      .prepare('SELECT consumed_at FROM account_deletion_terms_sessions WHERE id = ?')
      .get(session.id) as { consumed_at: string | null }
    expect(sessionRow.consumed_at).toBeNull()
    expect(rowCount('auth_login_tokens')).toBe(1)
    expect(rowCount('user_api_keys')).toBe(1)
    const deviceRow = d1.sqlite
      .prepare('SELECT revoked_at, token_version FROM auth_devices WHERE user_id = ?')
      .get('user-1') as { revoked_at: string | null, token_version: number }
    expect(deviceRow.revoked_at).toBeNull()
    expect(deviceRow.token_version).toBe(1)
  })

  it('refuses non-active accounts without burning the terms session or revoking credentials', async () => {
    const session = await privacyStore.createAccountDeletionTermsSession(event, 'user-1')
    d1.sqlite
      .prepare('UPDATE account_deletion_terms_sessions SET earliest_confirm_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), session.id)
    d1.sqlite.prepare(`UPDATE auth_users SET status = 'disabled' WHERE id = 'user-1'`).run()

    await expect(
      privacyStore.submitAccountDeletion(event, 'user-1', session.id, privacyStore.ACCOUNT_DELETION_CONFIRM_PHRASE),
    ).rejects.toMatchObject({ statusCode: 409 })

    const sessionRow = d1.sqlite
      .prepare('SELECT consumed_at FROM account_deletion_terms_sessions WHERE id = ?')
      .get(session.id) as { consumed_at: string | null }
    expect(sessionRow.consumed_at).toBeNull()
    expect(rowCount('user_api_keys')).toBe(1)
  })

  it('finalizes expired deletion_pending accounts atomically, idempotently, and with redacted audits', async () => {
    seedOwnedDomainRecords()
    // Seed a credit ledger row to verify durable financial accounting records are preserved.
    d1.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        delta REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO credit_ledger VALUES ('led-1', 'user', 'user-1', -50, 'usage', '2026-06-11T00:00:00.000Z');
    `)

    const requestedAt = '2026-06-01T00:00:00.000Z'
    const scheduledAt = '2026-07-01T00:00:00.000Z'
    d1.sqlite.prepare(`
      UPDATE auth_users
      SET status = 'deletion_pending', deletion_requested_at = ?, deletion_scheduled_at = ?, deletion_terms_version = '2026-06-22'
      WHERE id = 'user-1'
    `).run(requestedAt, scheduledAt)

    // Early finalization before the 30-day window expires must be refused.
    await expect(
      privacyStore.finalizeAccountDeletion(event, 'user-1', { now: new Date('2026-06-30T23:59:59.000Z') }),
    ).rejects.toMatchObject({ statusCode: 409 })

    // Concurrent finalization after expiration executes cleanly once; losers resolve idempotently.
    const dueNow = new Date('2026-07-01T00:00:01.000Z')
    const outcomes = await Promise.all([
      privacyStore.finalizeAccountDeletion(event, 'user-1', { now: dueNow }),
      privacyStore.finalizeAccountDeletion(event, 'user-1', { now: dueNow }),
    ])
    expect(outcomes.filter(item => item.status === 'finalized')).toHaveLength(1)
    expect(outcomes.filter(item => item.status === 'already_finalized')).toHaveLength(1)

    // Serial replay is a pure idempotent no-op.
    const replay = await privacyStore.finalizeAccountDeletion(event, 'user-1', { now: dueNow })
    expect(replay.status).toBe('already_finalized')

    // User profile is disabled and anonymized (zero raw PII remaining).
    const finalizedUser = await authStore.getUserById(event, 'user-1')
    expect(finalizedUser?.status).toBe('disabled')
    expect(finalizedUser?.email).toMatch(/^deleted\+[a-f0-9]{24}@deleted\.invalid$/)
    expect(finalizedUser?.name).toBeNull()
    expect(finalizedUser?.privacySettings).toEqual({
      analytics: false,
      crashReports: false,
      usageData: false,
      personalization: false,
    })

    // Post-deletion queries across every user-owned domain return zero rows.
    for (const table of [
      'auth_accounts',
      'auth_passkeys',
      'auth_devices',
      'auth_login_history',
      'auth_login_tokens',
      'user_api_keys',
      'telemetry_events',
      'intelligence_audits',
      'asr_transcription_requests',
      'sync_items_v1',
      'sync_blobs_v1',
      'sync_quotas_v1',
      'sync_sessions_v1',
    ]) {
      expect(rowCount(table)).toBe(0)
    }

    // Durable financial ledger is preserved.
    const ledgerCount = (d1.sqlite.prepare(`SELECT COUNT(*) AS count FROM credit_ledger WHERE scope_id = 'user-1'`).get() as { count: number }).count
    expect(ledgerCount).toBe(1)

    // Audit record exists and leaks zero original email/name/credentials.
    const audit = await privacyStore.getAccountDeletionAudit(event, 'user-1')
    expect(audit).toMatchObject({
      userId: 'user-1',
      status: 'finalized',
      requestedAt,
      scheduledAt,
      summary: { financialRecordsPreserved: true },
    })
    expect(JSON.stringify(audit)).not.toContain('owner@example.com')
    expect(JSON.stringify(audit)).not.toContain('Owner Name')
  })

  it('rolls back completely and reports explicit failure when finalization fails mid-batch', async () => {
    seedOwnedDomainRecords()
    d1.sqlite.prepare(`
      UPDATE auth_users
      SET status = 'deletion_pending',
          deletion_requested_at = '2026-06-01T00:00:00.000Z',
          deletion_scheduled_at = '2026-07-01T00:00:00.000Z'
      WHERE id = 'user-1'
    `).run()

    d1.sqlite.exec(`
      CREATE TRIGGER fail_sync_items_delete
      BEFORE DELETE ON sync_items_v1
      BEGIN
        SELECT RAISE(ABORT, 'simulated sync cleanup failure');
      END;
    `)

    const batchResult = await privacyStore.finalizeExpiredAccountDeletions(event, {
      now: new Date('2026-07-02T00:00:00.000Z'),
    })
    expect(batchResult).toEqual({
      scanned: 1,
      finalized: 0,
      alreadyFinalized: 0,
      failed: 1,
      errors: [
        {
          userIdHash: expect.stringMatching(/^[a-f0-9]{16}$/),
          message: expect.stringContaining('simulated sync cleanup failure'),
        },
      ],
    })
    // Error report never exposes raw userId or email.
    expect(JSON.stringify(batchResult)).not.toContain('owner@example.com')
    expect(JSON.stringify(batchResult)).not.toContain('user-1')

    // Every table rolled back cleanly so the next maintenance run can retry.
    const user = await authStore.getUserById(event, 'user-1')
    expect(user?.status).toBe('deletion_pending')
    expect(user?.email).toBe('owner@example.com')
    expect(rowCount('telemetry_events')).toBe(1)
    expect(rowCount('sync_items_v1')).toBe(1)
    expect(await privacyStore.getAccountDeletionAudit(event, 'user-1')).toBeNull()

    // Retrying after the transient failure clears succeeds cleanly.
    d1.sqlite.exec('DROP TRIGGER fail_sync_items_delete;')
    const retried = await privacyStore.finalizeExpiredAccountDeletions(event, {
      now: new Date('2026-07-02T00:00:00.000Z'),
    })
    expect(retried).toEqual({
      scanned: 1,
      finalized: 1,
      alreadyFinalized: 0,
      failed: 0,
      errors: [],
    })
    expect(rowCount('telemetry_events')).toBe(0)
    expect(rowCount('sync_items_v1')).toBe(0)
  })
})
