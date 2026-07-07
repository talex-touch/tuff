import { describe, expect, it, vi } from 'vitest'
import { createDeviceAuthRequest, getDeviceAuthByDeviceCode } from '../authStore'

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

interface DeviceAuthRequestRow {
  device_code: string
  user_code: string
  device_id: string
  device_name: string | null
  device_platform: string | null
  client_type: string | null
  request_ip: string | null
  status: string
  grant_type: string
  reject_reason: string | null
  reject_message: string | null
  reject_request_ip: string | null
  reject_current_ip: string | null
  rejected_at: string | null
  browser_state: string
  browser_seen_at: string | null
  browser_closed_at: string | null
  user_id: string | null
  created_at: string
  expires_at: string
  approved_at: string | null
  cancelled_at: string | null
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
    return this.db.all(this.sql)
  }
}

class MockD1Database {
  requests: DeviceAuthRequestRow[] = []

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('INSERT INTO auth_device_auth_requests')) {
      const [
        deviceCode,
        userCode,
        deviceId,
        deviceName,
        devicePlatform,
        clientType,
        requestIp,
        status,
        grantType,
        rejectReason,
        rejectMessage,
        rejectRequestIp,
        rejectCurrentIp,
        rejectedAt,
        browserState,
        browserSeenAt,
        browserClosedAt,
        userId,
        createdAt,
        expiresAt,
        approvedAt,
        cancelledAt,
      ] = args

      this.requests.push({
        device_code: deviceCode,
        user_code: userCode,
        device_id: deviceId,
        device_name: deviceName,
        device_platform: devicePlatform,
        client_type: clientType,
        request_ip: requestIp,
        status,
        grant_type: grantType,
        reject_reason: rejectReason,
        reject_message: rejectMessage,
        reject_request_ip: rejectRequestIp,
        reject_current_ip: rejectCurrentIp,
        rejected_at: rejectedAt,
        browser_state: browserState,
        browser_seen_at: browserSeenAt,
        browser_closed_at: browserClosedAt,
        user_id: userId,
        created_at: createdAt,
        expires_at: expiresAt,
        approved_at: approvedAt,
        cancelled_at: cancelledAt,
      })
    }

    return { meta: { changes: 1 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('SELECT *') && sql.includes('FROM auth_device_auth_requests') && sql.includes('device_code = ?')) {
      const [deviceCode] = args
      return this.requests.find(row => row.device_code === deviceCode) ?? null
    }

    if (sql.includes('SELECT *') && sql.includes('FROM auth_device_auth_requests') && sql.includes('user_code = ?')) {
      const [userCode] = args
      return this.requests.find(row => row.user_code === userCode) ?? null
    }

    return null
  }

  all(sql: string) {
    if (sql.includes('PRAGMA table_info'))
      return { results: [] }

    return { results: [] }
  }
}

function createEvent(db: MockD1Database, ip = '203.0.113.10') {
  return {
    context: {
      cloudflare: {
        env: { DB: db },
      },
    },
    node: {
      req: {
        headers: {
          'cf-connecting-ip': ip,
          'user-agent': 'Vitest device auth client',
        },
      },
    },
  } as any
}

describe('device auth grant type selection', () => {
  it('uses long-term authorization for official app device requests', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)

    const request = await createDeviceAuthRequest(event, {
      deviceId: 'official-app-device',
      deviceName: 'Touch Desktop',
      devicePlatform: 'darwin-arm64',
      clientType: 'app',
      ttlMs: 2 * 60 * 1000,
    })
    const persisted = await getDeviceAuthByDeviceCode(event, request.deviceCode)

    expect(request.grantType).toBe('long')
    expect(persisted?.grantType).toBe('long')
    expect(persisted?.clientType).toBe('app')
  })

  it.each([
    { name: 'external client', clientType: 'external' as const, expectedClientType: 'external' },
    { name: 'CLI client', clientType: 'cli' as const, expectedClientType: 'cli' },
    { name: 'missing client type', clientType: null, expectedClientType: null },
  ])('keeps $name device requests short-term', async ({ clientType, expectedClientType }) => {
    const db = new MockD1Database()
    const event = createEvent(db)

    const request = await createDeviceAuthRequest(event, {
      deviceId: `device-${expectedClientType ?? 'missing'}`,
      deviceName: null,
      devicePlatform: null,
      clientType,
      ttlMs: 2 * 60 * 1000,
    })
    const persisted = await getDeviceAuthByDeviceCode(event, request.deviceCode)

    expect(request.grantType).toBe('short')
    expect(persisted?.grantType).toBe('short')
    expect(persisted?.clientType).toBe(expectedClientType)
  })
})
