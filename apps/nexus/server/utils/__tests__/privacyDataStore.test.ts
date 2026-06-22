import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const userState = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    email: 'owner@example.com',
    name: 'Owner',
    image: null,
    emailVerified: '2026-06-01T00:00:00.000Z',
    emailState: 'verified',
    role: 'user',
    locale: 'zh',
    status: 'active',
    createdAt: '2026-06-01T00:00:00.000Z',
    deletionRequestedAt: null as string | null,
    deletionScheduledAt: null as string | null,
    deletionCancelledAt: null as string | null,
    deletionTermsVersion: null as string | null,
    privacySettings: { analytics: true, crashReports: true, usageData: false, personalization: true },
    allowCliIpMismatch: false,
  },
  requestedDeletionTermsVersion: null as string | null,
}))

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

vi.mock('../authStore', () => ({
  clearUserAuthEphemeralTokens: vi.fn(async () => undefined),
  getUserById: vi.fn(async () => userState.user),
  listDevices: vi.fn(async () => [{ id: 'device-1', tokenVersion: 7, deviceToken: 'private-token' }]),
  listLoginHistory: vi.fn(async () => [{
    id: 'login-1',
    device_id: 'device-1',
    ip_masked: '203.0.*.*',
    ip: '203.0.113.10',
    user_agent: 'vitest',
    success: true,
    reason: 'password',
    client_type: 'web',
    created_at: '2026-06-21T00:00:00.000Z',
    country_code: 'US',
    region_code: 'CA',
    region_name: 'California',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles',
    geo_source: 'cf',
  }]),
  listPasskeys: vi.fn(async () => [{
    id: 'passkey-1',
    credential_id: 'credential-private',
    public_key: 'public-key-private',
    transports: '["internal"]',
    created_at: '2026-06-01T00:00:00.000Z',
    last_used_at: null,
  }]),
  listUserLinkedAccounts: vi.fn(async () => [{ provider: 'github', providerAccountId: 'gh-1', accessToken: 'private-token' }]),
  requestUserDeletion: vi.fn(async (_event: any, _userId: string, termsVersion: string) => {
    userState.requestedDeletionTermsVersion = termsVersion
    userState.user = {
      ...userState.user,
      status: 'deletion_pending',
      deletionRequestedAt: new Date().toISOString(),
      deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      deletionTermsVersion: termsVersion,
    }
    return userState.user
  }),
  revokeAllDevicesForUser: vi.fn(async () => 1),
}))

vi.mock('../apiKeyStore', () => ({
  deleteApiKeysForUser: vi.fn(async () => 1),
  listApiKeys: vi.fn(async () => [{ id: 'key-1', keyPrefix: 'tuff_abc...', keyHash: 'private-hash', secretKey: 'private-secret' }]),
}))

vi.mock('../creditsStore', () => ({
  listCreditLedger: vi.fn(async () => [{ id: 'ledger-1', amount: 1, refreshToken: 'private-token' }]),
  listUserTeams: vi.fn(async () => [{ id: 'team-1', name: 'Team', credentialSecret: 'private-secret' }]),
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
  }
})

interface ExportJobRow {
  id: string
  user_id: string
  status: string
  result_key: string | null
  error: string | null
  created_at: string
  updated_at: string
  expires_at: string
}

interface TermsSessionRow {
  id: string
  user_id: string
  terms_version: string
  started_at: string
  earliest_confirm_at: string
  expires_at: string
  consumed_at: string | null
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first() {
    return this.db.first(this.sql, this.args)
  }

  async all() {
    return this.db.all()
  }
}

class MockD1Database {
  readonly exportJobs = new Map<string, ExportJobRow>()
  readonly termsSessions = new Map<string, TermsSessionRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO privacy_export_jobs')) {
      const [id, userId, createdAt, updatedAt, expiresAt] = args
      this.exportJobs.set(id, {
        id,
        user_id: userId,
        status: 'queued',
        result_key: null,
        error: null,
        created_at: createdAt,
        updated_at: updatedAt,
        expires_at: expiresAt,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes("SET status = 'running'")) {
      const [updatedAt, jobId, userId] = args
      const row = this.exportJobs.get(jobId)
      if (!row || row.user_id !== userId || row.status !== 'queued')
        return { meta: { changes: 0 } }
      row.status = 'running'
      row.updated_at = updatedAt
      return { meta: { changes: 1 } }
    }

    if (sql.includes("SET status = 'succeeded'")) {
      const [resultKey, updatedAt, jobId, userId] = args
      const row = this.exportJobs.get(jobId)
      if (!row || row.user_id !== userId)
        return { meta: { changes: 0 } }
      row.status = 'succeeded'
      row.result_key = resultKey
      row.error = null
      row.updated_at = updatedAt
      return { meta: { changes: 1 } }
    }

    if (sql.includes("SET status = 'failed'")) {
      const [error, updatedAt, jobId, userId] = args
      const row = this.exportJobs.get(jobId)
      if (!row || row.user_id !== userId)
        return { meta: { changes: 0 } }
      row.status = 'failed'
      row.error = error
      row.updated_at = updatedAt
      return { meta: { changes: 1 } }
    }

    if (sql.includes("SET status = 'expired'")) {
      const [updatedAt, jobId, userId] = args
      const row = this.exportJobs.get(jobId)
      if (!row || row.user_id !== userId)
        return { meta: { changes: 0 } }
      row.status = 'expired'
      row.updated_at = updatedAt
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO account_deletion_terms_sessions')) {
      const [id, userId, termsVersion, startedAt, earliestConfirmAt, expiresAt] = args
      this.termsSessions.set(id, {
        id,
        user_id: userId,
        terms_version: termsVersion,
        started_at: startedAt,
        earliest_confirm_at: earliestConfirmAt,
        expires_at: expiresAt,
        consumed_at: null,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE account_deletion_terms_sessions')) {
      const [consumedAt, sessionId, userId] = args
      const row = this.termsSessions.get(sessionId)
      if (!row || row.user_id !== userId || row.consumed_at)
        return { meta: { changes: 0 } }
      row.consumed_at = consumedAt
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM privacy_export_jobs')) {
      const [jobId, userId] = args
      const row = this.exportJobs.get(jobId)
      return row?.user_id === userId ? row : null
    }
    if (sql.includes('FROM account_deletion_terms_sessions')) {
      const [sessionId, userId] = args
      const row = this.termsSessions.get(sessionId)
      return row?.user_id === userId ? row : null
    }
    return null
  }

  all() {
    return { results: [] }
  }
}

function createEvent(db: MockD1Database) {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
    node: { req: { headers: {} } },
  } as any
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

describe('privacy data store', () => {
  beforeEach(() => {
    vi.useRealTimers()
    userState.requestedDeletionTermsVersion = null
    userState.user = {
      ...userState.user,
      status: 'active',
      deletionRequestedAt: null,
      deletionScheduledAt: null,
      deletionTermsVersion: null,
    }
  })

  it('advances a queued export job to succeeded and redacts private fields from payload', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const { advancePrivacyExportJob, createPrivacyExportJob, getPrivacyExportPayload } = await import('../privacyDataStore')

    const created = await createPrivacyExportJob(event, 'user-1')
    expect(created.status).toBe('queued')

    const completed = await advancePrivacyExportJob(event, 'user-1', created.id)
    expect(completed?.status).toBe('succeeded')

    const payload = await getPrivacyExportPayload(event, 'user-1', created.id)
    const parsed = JSON.parse(payload.data.toString('utf8'))
    expect(parsed.account.email).toBe('owner@example.com')
    expectNoPrivateKeys(parsed)
  })

  it('rejects account deletion before the server-side reading window completes', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const {
      ACCOUNT_DELETION_CONFIRM_PHRASE,
      createAccountDeletionTermsSession,
      submitAccountDeletion,
    } = await import('../privacyDataStore')

    const session = await createAccountDeletionTermsSession(event, 'user-1')

    await expect(submitAccountDeletion(event, 'user-1', session.id, ACCOUNT_DELETION_CONFIRM_PHRASE)).rejects.toMatchObject({
      statusCode: 409,
      data: {
        remainingSeconds: expect.any(Number),
      },
    })
  })

  it('marks the user deletion_pending after the reading window and exact phrase', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const {
      ACCOUNT_DELETION_CONFIRM_PHRASE,
      createAccountDeletionTermsSession,
      submitAccountDeletion,
    } = await import('../privacyDataStore')

    const session = await createAccountDeletionTermsSession(event, 'user-1')
    const row = db.termsSessions.get(session.id)!
    row.earliest_confirm_at = new Date(Date.now() - 1000).toISOString()

    const result = await submitAccountDeletion(event, 'user-1', session.id, ACCOUNT_DELETION_CONFIRM_PHRASE)

    expect(result.success).toBe(true)
    expect(result.user?.status).toBe('deletion_pending')
    expect(row.consumed_at).toBeTruthy()
    expect(userState.requestedDeletionTermsVersion).toBe(session.termsVersion)
  })

  it('rejects a reused terms session', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)
    const {
      ACCOUNT_DELETION_CONFIRM_PHRASE,
      createAccountDeletionTermsSession,
      submitAccountDeletion,
    } = await import('../privacyDataStore')

    const session = await createAccountDeletionTermsSession(event, 'user-1')
    const row = db.termsSessions.get(session.id)!
    row.earliest_confirm_at = new Date(Date.now() - 1000).toISOString()
    row.consumed_at = new Date().toISOString()

    await expect(submitAccountDeletion(event, 'user-1', session.id, ACCOUNT_DELETION_CONFIRM_PHRASE)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})
