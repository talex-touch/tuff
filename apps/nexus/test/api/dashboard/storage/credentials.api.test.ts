import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface StorageCredentialRow {
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
  credentials = new Map<string, StorageCredentialRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO storage_secure_store')) {
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
    if (sql.includes('FROM storage_secure_store')) {
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
    if (sql.includes('FROM storage_secure_store'))
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
    storageCredentials: {
      secureStoreKey: 'unit-test-storage-key',
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
  listCredentialsHandler = (await import('../../../../server/api/dashboard/storage/credentials.get')).default as (event: any) => Promise<any>
  storeCredentialHandler = (await import('../../../../server/api/dashboard/storage/credentials.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/storage/credentials',
    node: { req: { url: '/api/dashboard/storage/credentials' } },
    context: {},
  }
}

describe('/api/dashboard/storage/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    importsMocks.useRuntimeConfig.mockReturnValue({
      storageCredentials: {
        secureStoreKey: 'unit-test-storage-key',
      },
    })
  })

  it('stores S3-compatible access keys encrypted and lists metadata only', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://storage/s3-primary',
      credentialType: 'access_key',
      credentials: {
        accessKeyId: 'ak-unit-test',
        secretAccessKey: 'sk-unit-test-secret',
      },
    })

    const result = await storeCredentialHandler(makeEvent())
    const row = state.db?.credentials.get('secure://storage/s3-primary')
    const listed = await listCredentialsHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result).toMatchObject({
      success: true,
      authRef: 'secure://storage/s3-primary',
      credentialType: 'access_key',
      backend: 'd1-encrypted',
      degraded: false,
    })
    expect(row?.encrypted_value).toContain('A256GCM')
    expect(row?.encrypted_value).not.toContain('sk-unit-test-secret')
    expect(listed.credentials).toEqual([
      expect.objectContaining({
        authRef: 'secure://storage/s3-primary',
        credentialType: 'access_key',
        hasCredential: true,
      }),
    ])
    expect(JSON.stringify(listed)).not.toContain('sk-unit-test-secret')
  })

  it('rejects invalid storage authRef and access key schema', async () => {
    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://notifications/s3-primary',
      credentialType: 'access_key',
      credentials: {
        accessKeyId: 'ak-unit-test',
        secretAccessKey: 'sk-unit-test-secret',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secure://storage'),
    })

    h3Mocks.readBody.mockResolvedValue({
      authRef: 'secure://storage/s3-primary',
      credentialType: 'access_key',
      credentials: {
        accessKeyId: 'ak-unit-test',
      },
    })

    await expect(storeCredentialHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('secretAccessKey'),
    })
  })
})
