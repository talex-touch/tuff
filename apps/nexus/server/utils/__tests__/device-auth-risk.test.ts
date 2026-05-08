import { describe, expect, it, vi } from 'vitest'
import { evaluateDeviceAuthLongTermPolicy, evaluateDeviceAuthRateLimit, recordDeviceAuthAudit } from '../authStore'

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare.env,
}))

interface DeviceAuthAuditRow {
  id: string
  action: string
  status: string
  user_id: string | null
  device_id: string | null
  device_code: string | null
  user_code: string | null
  client_type: string | null
  actor_user_id: string | null
  reason: string | null
  ip: string | null
  user_agent: string | null
  metadata: string | null
  created_at: string
}

interface DeviceRow {
  id: string
  user_id: string
  revoked_at: string | null
  trusted_at: string | null
}

interface LoginHistoryRow {
  user_id: string
  success: number
  country_code: string | null
  region_code: string | null
  city: string | null
  created_at: string
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

  async first<T>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T>() {
    return this.db.all(this.sql, this.args) as T
  }
}

class MockD1Database {
  audits: DeviceAuthAuditRow[] = []
  devices: DeviceRow[] = []
  loginHistory: LoginHistoryRow[] = []

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('INSERT INTO auth_device_auth_audits')) {
      const [
        id,
        action,
        status,
        userId,
        deviceId,
        deviceCode,
        userCode,
        clientType,
        actorUserId,
        reason,
        ip,
        userAgent,
        metadata,
        createdAt,
      ] = args
      this.audits.push({
        id,
        action,
        status,
        user_id: userId,
        device_id: deviceId,
        device_code: deviceCode,
        user_code: userCode,
        client_type: clientType,
        actor_user_id: actorUserId,
        reason,
        ip,
        user_agent: userAgent,
        metadata,
        created_at: createdAt,
      })
    }
    return { meta: { changes: 1 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('PRAGMA table_info')) {
      return null
    }
    if (sql.includes('SELECT COUNT(*) AS total') && sql.includes('FROM auth_device_auth_audits')) {
      return { total: this.filterAudits(sql, args).length }
    }
    if (sql.includes('SELECT revoked_at') && sql.includes('FROM auth_devices')) {
      const [deviceId, userId] = args
      return this.devices.find(row => row.id === deviceId && row.user_id === userId) ?? null
    }
    if (sql.includes('SELECT created_at') && sql.includes('FROM auth_device_auth_audits')) {
      const newest = this.filterAudits(sql, args)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      return newest ? { created_at: newest.created_at } : null
    }
    return null
  }

  all(sql: string, args: any[] = []) {
    if (sql.includes('PRAGMA table_info')) {
      return { results: [] }
    }
    if (sql.includes('SELECT country_code, region_code, city') && sql.includes('FROM auth_login_history')) {
      const [userId] = args
      return {
        results: this.loginHistory
          .filter(row => row.user_id === userId && row.success === 1)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }
    }
    return { results: [] }
  }

  private filterAudits(sql: string, args: any[]) {
    if (sql.includes('action = ?') && sql.includes('device_id = ?')) {
      const [action, deviceId, since] = args
      return this.audits.filter(row => row.action === action && row.device_id === deviceId && row.created_at >= since)
    }
    if (sql.includes('action = ?') && sql.includes('ip = ?')) {
      const [action, ip, since] = args
      return this.audits.filter(row => row.action === action && row.ip === ip && row.created_at >= since)
    }
    if (sql.includes('action = ?') && sql.includes('user_id = ?')) {
      const [action, userId, since] = args
      return this.audits.filter(row => row.action === action && row.user_id === userId && row.created_at >= since)
    }
    if (sql.includes('action IN') && sql.includes('device_id = ?')) {
      const [rejectAction, cancelAction, deviceId, since] = args
      return this.audits.filter(row =>
        (row.action === rejectAction || row.action === cancelAction)
        && (row.status === 'blocked' || row.status === 'success')
        && row.device_id === deviceId
        && row.created_at >= since
      )
    }
    if (sql.includes('action IN') && sql.includes('ip = ?')) {
      const [rejectAction, cancelAction, ip, since] = args
      return this.audits.filter(row =>
        (row.action === rejectAction || row.action === cancelAction)
        && (row.status === 'blocked' || row.status === 'success')
        && row.ip === ip
        && row.created_at >= since
      )
    }
    if (sql.includes('action IN') && sql.includes('user_id = ?')) {
      const [rejectAction, cancelAction, userId, since] = args
      return this.audits.filter(row =>
        (row.action === rejectAction || row.action === cancelAction)
        && (row.status === 'blocked' || row.status === 'success')
        && row.user_id === userId
        && row.created_at >= since
      )
    }
    return []
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
          'cf-ipcountry': 'US',
          'cf-region-code': 'CA',
          'cf-ipcity': 'San Francisco',
          'user-agent': 'vitest',
        },
      },
    },
  } as any
}

describe('device auth risk controls', () => {
  it('blocks device auth requests when device scoped rate limit is exceeded', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)

    for (let i = 0; i < 6; i++) {
      await recordDeviceAuthAudit(event, {
        action: 'request',
        status: 'success',
        deviceId: 'device-1',
        clientType: 'cli',
      })
    }

    const decision = await evaluateDeviceAuthRateLimit(event, { deviceId: 'device-1' })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('rate_limited')
    expect(decision.scope).toBe('device')
    expect(decision.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('enters cooldown after repeated reject or cancel audit records', async () => {
    const db = new MockD1Database()
    const event = createEvent(db)

    for (let i = 0; i < 3; i++) {
      await recordDeviceAuthAudit(event, {
        action: i === 0 ? 'cancel' : 'reject',
        status: i === 0 ? 'success' : 'blocked',
        userId: 'user-1',
        deviceId: 'device-2',
        clientType: 'cli',
        reason: 'test',
      })
    }

    const decision = await evaluateDeviceAuthRateLimit(event, { deviceId: 'device-2', userId: 'user-1' })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('cooldown')
    expect(decision.scope).toBe('device_cooldown')
  })

  it('requires a fresh signed browser session for long-term device authorization', async () => {
    const db = new MockD1Database()
    db.devices.push({ id: 'device-3', user_id: 'user-2', revoked_at: null, trusted_at: new Date().toISOString() })
    db.loginHistory.push({
      user_id: 'user-2',
      success: 1,
      country_code: 'US',
      region_code: 'CA',
      city: 'San Francisco',
      created_at: new Date().toISOString(),
    })
    const event = createEvent(db)

    const stale = await evaluateDeviceAuthLongTermPolicy(event, 'user-2', 'device-3', {
      sessionIssuedAt: Math.floor((Date.now() - 11 * 60 * 1000) / 1000),
    })
    const fresh = await evaluateDeviceAuthLongTermPolicy(event, 'user-2', 'device-3', {
      sessionIssuedAt: Math.floor(Date.now() / 1000),
    })

    expect(stale.allowLongTerm).toBe(false)
    expect(stale.reason).toBe('session_window')
    expect(fresh.allowLongTerm).toBe(true)
    expect(fresh.reason).toBeNull()
  })

  it('requires an explicitly trusted device for long-term device authorization', async () => {
    const db = new MockD1Database()
    db.devices.push({ id: 'device-4', user_id: 'user-3', revoked_at: null, trusted_at: null })
    db.loginHistory.push({
      user_id: 'user-3',
      success: 1,
      country_code: 'US',
      region_code: 'CA',
      city: 'San Francisco',
      created_at: new Date().toISOString(),
    })
    const event = createEvent(db)

    const policy = await evaluateDeviceAuthLongTermPolicy(event, 'user-3', 'device-4', {
      sessionIssuedAt: Math.floor(Date.now() / 1000),
    })

    expect(policy.allowLongTerm).toBe(false)
    expect(policy.deviceTrusted).toBe(false)
    expect(policy.reason).toBe('device')
  })
})
