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
  last_seen_ip: string | null
  last_seen_country_code: string | null
  last_seen_region_code: string | null
  last_seen_region_name: string | null
  last_seen_city: string | null
  last_seen_latitude: number | null
  last_seen_longitude: number | null
  last_seen_timezone: string | null
  last_seen_geo_source: string | null
  created_at: string
  revoked_at: string | null
  token_version: number
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
    return this.db.all(this.sql, this.args)
  }
}

class MockD1Database {
  readonly devices = new Map<string, DeviceRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  async run(sql: string, args: any[]) {
    if (sql.includes('UPDATE auth_devices') && sql.includes('reactivateRevoked')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('UPDATE auth_devices') && sql.includes('token_version = CASE WHEN ? AND revoked_at IS NOT NULL')) {
      const [
        deviceName,
        platform,
        clientType,
        userAgent,
        lastSeenAt,
        lastSeenIp,
        lastSeenCountryCode,
        lastSeenRegionCode,
        lastSeenRegionName,
        lastSeenCity,
        lastSeenLatitude,
        lastSeenLongitude,
        lastSeenTimezone,
        lastSeenGeoSource,
        reactivateRevoked,
        rotateOnReactivation,
        deviceId,
        userId,
      ] = args
      const key = `${userId}:${deviceId}`
      const row = this.devices.get(key)
      if (row) {
        const shouldReactivate = Boolean(reactivateRevoked)
        const shouldRotate = Boolean(rotateOnReactivation)
        const wasRevoked = Boolean(row.revoked_at)
        this.devices.set(key, {
          ...row,
          device_name: deviceName ?? row.device_name,
          platform: platform ?? row.platform,
          client_type: clientType ?? row.client_type,
          user_agent: userAgent ?? row.user_agent,
          last_seen_at: lastSeenAt,
          last_seen_ip: lastSeenIp,
          last_seen_country_code: lastSeenCountryCode,
          last_seen_region_code: lastSeenRegionCode,
          last_seen_region_name: lastSeenRegionName,
          last_seen_city: lastSeenCity,
          last_seen_latitude: lastSeenLatitude,
          last_seen_longitude: lastSeenLongitude,
          last_seen_timezone: lastSeenTimezone,
          last_seen_geo_source: lastSeenGeoSource,
          revoked_at: shouldReactivate ? null : row.revoked_at,
          token_version: shouldRotate && wasRevoked ? row.token_version + 1 : row.token_version,
        })
      }
      return { meta: { changes: row ? 1 : 0 } }
    }

    if (sql.includes('UPDATE auth_devices') && sql.includes('SET user_id = ?')) {
      const [
        userId,
        deviceName,
        platform,
        clientType,
        userAgent,
        lastSeenAt,
        lastSeenIp,
        lastSeenCountryCode,
        lastSeenRegionCode,
        lastSeenRegionName,
        lastSeenCity,
        lastSeenLatitude,
        lastSeenLongitude,
        lastSeenTimezone,
        lastSeenGeoSource,
        createdAt,
        deviceId,
      ] = args
      const previousEntry = [...this.devices.entries()].find(([, row]) => row.id === deviceId)
      const previousKey = previousEntry?.[0]
      const previous = previousEntry?.[1]
      if (!previous)
        return { meta: { changes: 0 } }

      if (previousKey)
        this.devices.delete(previousKey)
      this.devices.set(`${userId}:${deviceId}`, {
        ...previous,
        user_id: userId,
        device_name: deviceName,
        platform,
        client_type: clientType,
        trusted_at: null,
        user_agent: userAgent,
        last_seen_at: lastSeenAt,
        last_seen_ip: lastSeenIp,
        last_seen_country_code: lastSeenCountryCode,
        last_seen_region_code: lastSeenRegionCode,
        last_seen_region_name: lastSeenRegionName,
        last_seen_city: lastSeenCity,
        last_seen_latitude: lastSeenLatitude,
        last_seen_longitude: lastSeenLongitude,
        last_seen_timezone: lastSeenTimezone,
        last_seen_geo_source: lastSeenGeoSource,
        created_at: createdAt,
        revoked_at: null,
        token_version: previous.token_version + 1,
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO auth_devices')) {
      const [
        deviceId,
        userId,
        deviceName,
        platform,
        clientType,
        userAgent,
        lastSeenAt,
        lastSeenIp,
        lastSeenCountryCode,
        lastSeenRegionCode,
        lastSeenRegionName,
        lastSeenCity,
        lastSeenLatitude,
        lastSeenLongitude,
        lastSeenTimezone,
        lastSeenGeoSource,
        createdAt,
      ] = args
      this.devices.set(`${userId}:${deviceId}`, {
        id: deviceId,
        user_id: userId,
        device_name: deviceName,
        platform,
        client_type: clientType,
        trusted_at: null,
        user_agent: userAgent,
        last_seen_at: lastSeenAt,
        last_seen_ip: lastSeenIp,
        last_seen_country_code: lastSeenCountryCode,
        last_seen_region_code: lastSeenRegionCode,
        last_seen_region_name: lastSeenRegionName,
        last_seen_city: lastSeenCity,
        last_seen_latitude: lastSeenLatitude,
        last_seen_longitude: lastSeenLongitude,
        last_seen_timezone: lastSeenTimezone,
        last_seen_geo_source: lastSeenGeoSource,
        created_at: createdAt,
        revoked_at: null,
        token_version: 0,
      })
    }

    if (sql.includes('UPDATE auth_devices') && sql.includes('SET trusted_at = COALESCE(trusted_at')) {
      const [trustedAt, deviceId, userId] = args
      const key = `${userId}:${deviceId}`
      const row = this.devices.get(key)
      if (row && !row.revoked_at) {
        this.devices.set(key, {
          ...row,
          trusted_at: row.trusted_at ?? trustedAt,
        })
        return { meta: { changes: 1 } }
      }
    }

    return { meta: { changes: 0 } }
  }

  async first(sql: string, args: any[]) {
    if (sql.includes('SELECT COUNT(*) as total') && sql.includes('FROM auth_devices')) {
      const [userId] = args
      const total = [...this.devices.values()].filter(row => row.user_id === userId && !row.revoked_at).length
      return { total }
    }
    if (sql.includes('SELECT * FROM auth_devices WHERE id = ? AND user_id = ?')) {
      const [deviceId, userId] = args
      return this.devices.get(`${userId}:${deviceId}`) ?? null
    }
    if (sql.includes('SELECT * FROM auth_devices WHERE id = ?')) {
      const [deviceId] = args
      return [...this.devices.values()].find(row => row.id === deviceId) ?? null
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
          'last_seen_ip',
          'last_seen_country_code',
          'last_seen_region_code',
          'last_seen_region_name',
          'last_seen_city',
          'last_seen_latitude',
          'last_seen_longitude',
          'last_seen_timezone',
          'last_seen_geo_source',
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

function seedRevokedDevice(db: MockD1Database) {
  db.devices.set('user-1:device-1', {
    id: 'device-1',
    user_id: 'user-1',
    device_name: 'Old CLI',
    platform: 'darwin-arm64',
    client_type: 'cli',
    trusted_at: null,
    user_agent: 'old',
    last_seen_at: '2026-05-18T00:00:00.000Z',
    last_seen_ip: '203.0.113.10',
    last_seen_country_code: 'US',
    last_seen_region_code: 'CA',
    last_seen_region_name: 'California',
    last_seen_city: 'San Francisco',
    last_seen_latitude: 37.7749,
    last_seen_longitude: -122.4194,
    last_seen_timezone: 'America/Los_Angeles',
    last_seen_geo_source: 'header',
    created_at: '2026-05-18T00:00:00.000Z',
    revoked_at: '2026-05-18T01:00:00.000Z',
    token_version: 2,
  })
}

describe('auth device reactivation', () => {
  it('does not reactivate a revoked device during regular device upsert', async () => {
    const db = new MockD1Database()
    seedRevokedDevice(db)

    const { upsertDevice } = await import('../authStore')
    const device = await upsertDevice(createEvent(db), 'user-1', 'device-1', {
      deviceName: 'New CLI',
      platform: 'darwin-arm64',
      clientType: 'cli',
    })

    expect(device.revokedAt).toBe('2026-05-18T01:00:00.000Z')
    expect(device.tokenVersion).toBe(2)
    expect(device.deviceName).toBe('New CLI')
  })

  it('reactivates a revoked device and rotates token version on browser re-login', async () => {
    const db = new MockD1Database()
    seedRevokedDevice(db)

    const { upsertDevice } = await import('../authStore')
    const device = await upsertDevice(createEvent(db), 'user-1', 'device-1', {
      deviceName: 'New CLI',
      platform: 'darwin-arm64',
      clientType: 'cli',
      reactivateRevoked: true,
    })

    expect(device.revokedAt).toBeNull()
    expect(device.tokenVersion).toBe(3)
    expect(device.deviceName).toBe('New CLI')
  })

  it('moves a reused global device id to the current user without inheriting previous trust timestamp or revoked state', async () => {
    const db = new MockD1Database()
    db.devices.set('user-1:device-1', {
      id: 'device-1',
      user_id: 'user-1',
      device_name: 'Old Browser',
      platform: 'MacIntel',
      client_type: 'app',
      trusted_at: '2026-05-18T01:00:00.000Z',
      user_agent: 'old',
      last_seen_at: '2026-05-18T00:00:00.000Z',
      last_seen_ip: '203.0.113.10',
      last_seen_country_code: 'US',
      last_seen_region_code: 'CA',
      last_seen_region_name: 'California',
      last_seen_city: 'San Francisco',
      last_seen_latitude: 37.7749,
      last_seen_longitude: -122.4194,
      last_seen_timezone: 'America/Los_Angeles',
      last_seen_geo_source: 'header',
      created_at: '2026-05-18T00:00:00.000Z',
      revoked_at: '2026-05-18T02:00:00.000Z',
      token_version: 4,
    })

    const { upsertDevice } = await import('../authStore')
    const device = await upsertDevice(createEvent(db), 'user-2', 'device-1', {
      deviceName: 'New Browser',
      platform: 'MacIntel',
      clientType: 'app',
    })

    expect(db.devices.has('user-1:device-1')).toBe(false)
    expect(device.userId).toBe('user-2')
    expect(device.deviceName).toBe('New Browser')
    expect(device.trustedAt).toBeTruthy()
    expect(device.trustedAt).not.toBe('2026-05-18T01:00:00.000Z')
    expect(device.revokedAt).toBeNull()
    expect(device.tokenVersion).toBe(5)
  })
})
