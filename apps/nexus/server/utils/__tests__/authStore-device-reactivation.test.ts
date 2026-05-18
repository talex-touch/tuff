import { describe, expect, it, vi } from 'vitest'

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

interface DeviceRow {
  id: string
  user_id: string
  device_name: string | null
  platform: string | null
  client_type: string | null
  trusted_at: string | null
  user_agent: string | null
  last_seen_at: string | null
  created_at: string
  revoked_at: string | null
  token_version: number
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string
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
    return this.db.all(this.sql, this.args)
  }
}

class MockD1Database {
  readonly devices = new Map<string, DeviceRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  async run(sql: string, args: any[]) {
    if (sql.includes('UPDATE auth_devices') && sql.includes('token_version = CASE WHEN revoked_at IS NOT NULL')) {
      const [deviceName, platform, clientType, userAgent, lastSeenAt, deviceId, userId] = args
      const key = `${userId}:${deviceId}`
      const row = this.devices.get(key)
      if (row) {
        const wasRevoked = Boolean(row.revoked_at)
        this.devices.set(key, {
          ...row,
          device_name: deviceName ?? row.device_name,
          platform: platform ?? row.platform,
          client_type: clientType ?? row.client_type,
          user_agent: userAgent ?? row.user_agent,
          last_seen_at: lastSeenAt,
          revoked_at: null,
          token_version: wasRevoked ? row.token_version + 1 : row.token_version,
        })
      }
      return { meta: { changes: row ? 1 : 0 } }
    }

    if (sql.includes('INSERT INTO auth_devices')) {
      const [deviceId, userId, deviceName, platform, clientType, userAgent, lastSeenAt, createdAt] = args
      this.devices.set(`${userId}:${deviceId}`, {
        id: deviceId,
        user_id: userId,
        device_name: deviceName,
        platform,
        client_type: clientType,
        trusted_at: null,
        user_agent: userAgent,
        last_seen_at: lastSeenAt,
        created_at: createdAt,
        revoked_at: null,
        token_version: 0,
      })
    }

    return { meta: { changes: 0 } }
  }

  async first(sql: string, args: any[]) {
    if (sql.includes('SELECT * FROM auth_devices WHERE id = ? AND user_id = ?')) {
      const [deviceId, userId] = args
      return this.devices.get(`${userId}:${deviceId}`) ?? null
    }
    return null
  }

  async all(sql: string) {
    if (sql.includes('PRAGMA table_info')) {
      return {
        results: [
          'status',
          'email_state',
          'merged_to_user_id',
          'merged_at',
          'merged_by_user_id',
          'disabled_at',
          'allow_cli_ip_mismatch',
          'grant_type',
          'cancelled_at',
          'client_type',
          'request_ip',
          'reject_reason',
          'reject_message',
          'reject_request_ip',
          'reject_current_ip',
          'rejected_at',
          'browser_state',
          'browser_seen_at',
          'browser_closed_at',
          'trusted_at',
          'country_code',
          'region_code',
          'region_name',
          'city',
          'latitude',
          'longitude',
          'timezone',
          'geo_source',
        ].map(name => ({ name })),
      }
    }
    return { results: [] }
  }
}

function createEvent(db: MockD1Database) {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
  } as any
}

describe('auth device reactivation', () => {
  it('reactivates a revoked device and rotates token version on browser re-login', async () => {
    const db = new MockD1Database()
    db.devices.set('user-1:device-1', {
      id: 'device-1',
      user_id: 'user-1',
      device_name: 'Old CLI',
      platform: 'darwin-arm64',
      client_type: 'cli',
      trusted_at: null,
      user_agent: 'old',
      last_seen_at: '2026-05-18T00:00:00.000Z',
      created_at: '2026-05-18T00:00:00.000Z',
      revoked_at: '2026-05-18T01:00:00.000Z',
      token_version: 2,
    })

    const { upsertDevice } = await import('../authStore')
    const device = await upsertDevice(createEvent(db), 'user-1', 'device-1', {
      deviceName: 'New CLI',
      platform: 'darwin-arm64',
      clientType: 'cli',
    })

    expect(device.revokedAt).toBeNull()
    expect(device.tokenVersion).toBe(3)
    expect(device.deviceName).toBe('New CLI')
  })
})
