import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface NotificationCredentialRow {
  auth_ref: string
  credential_type: string
  encrypted_value: string
  created_by: string
  created_at: string
  updated_at: string
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

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

class MockD1Database {
  credentials = new Map<string, NotificationCredentialRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO notification_secure_store')) {
      const [authRef, credentialType, encryptedValue, createdBy, createdAt, updatedAt] = args
      const existing = this.credentials.get(String(authRef))
      this.credentials.set(String(authRef), {
        auth_ref: String(authRef),
        credential_type: String(credentialType),
        encrypted_value: String(encryptedValue),
        created_by: String(createdBy),
        created_at: existing?.created_at ?? String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM notification_secure_store')) {
      const row = this.credentials.get(String(args[0]))
      if (!row)
        return null
      if (sql.includes('SELECT auth_ref') && !sql.includes('credential_type'))
        return { auth_ref: row.auth_ref }
      return row
    }
    return null
  }

  all(sql: string) {
    if (sql.includes('FROM notification_secure_store'))
      return [...this.credentials.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return []
  }
}

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

const importsMocks = vi.hoisted(() => ({
  useRuntimeConfig: vi.fn(() => ({
    notificationCredentials: {
      secureStoreKey: 'unit-test-notification-key',
    },
  })),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))
vi.mock('#imports', () => importsMocks)

let listCredentialsHandler: (event: any) => Promise<any>
let storeCredentialHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  listCredentialsHandler = (await import('../../../../server/api/dashboard/notifications/credentials.get')).default as (event: any) => Promise<any>
  storeCredentialHandler = (await import('../../../../server/api/dashboard/notifications/credentials.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/notifications/credentials',
    node: { req: { url: '/api/dashboard/notifications/credentials' } },
    context: {},
  }
}

describe('/api/dashboard/notifications/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    importsMocks.useRuntimeConfig.mockReturnValue({
      notificationCredentials: {
        secureStoreKey: 'unit-test-notification-key',
      },
    })
  })

  it('stores notification API key credentials encrypted and lists metadata only', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://notifications/resend-primary',
      credentialType: 'api_key',
      credentials: {
        apiKey: 're-unit-test-secret',
      },
    })

    const result = await storeCredentialHandler(makeEvent())
    const row = state.db?.credentials.get('secure://notifications/resend-primary')
    const listed = await listCredentialsHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result).toMatchObject({
      success: true,
      authRef: 'secure://notifications/resend-primary',
      credentialType: 'api_key',
      backend: 'd1-encrypted',
      degraded: false,
    })
    expect(row?.encrypted_value).toContain('A256GCM')
    expect(row?.encrypted_value).not.toContain('re-unit-test-secret')
    expect(listed.credentials).toEqual([
      expect.objectContaining({
        authRef: 'secure://notifications/resend-primary',
        credentialType: 'api_key',
        hasCredential: true,
      }),
    ])
    expect(JSON.stringify(listed)).not.toContain('re-unit-test-secret')
  })

  it('rejects invalid authRef and credential schema', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://providers/not-a-notification-ref',
      credentialType: 'api_key',
      credentials: {
        apiKey: 're-unit-test-secret',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secure://notifications'),
    })

    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://notifications/smtp-main',
      credentialType: 'smtp',
      credentials: {
        username: 'ops',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('host'),
    })
  })
})
