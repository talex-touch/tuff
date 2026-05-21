import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchNotificationEvent } from '../../../../server/utils/notificationDispatcher'
import { listPlatformGovernanceEvents, upsertPlatformGovernanceConfig } from '../../../../server/utils/platformGovernanceStore'

interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint_hash: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time: number | null
  endpoint_origin: string
  endpoint_host: string
  user_agent: string | null
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
  pushSubscriptions = new Map<string, PushSubscriptionRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO browser_push_subscriptions')) {
      const [
        id,
        userId,
        endpointHash,
        endpoint,
        p256dh,
        auth,
        expirationTime,
        endpointOrigin,
        endpointHost,
        userAgent,
        createdAt,
        updatedAt,
      ] = args
      const existing = [...this.pushSubscriptions.values()]
        .find(row => row.user_id === String(userId) && row.endpoint_hash === String(endpointHash))
      const row: PushSubscriptionRow = {
        id: String(id),
        user_id: String(userId),
        endpoint_hash: String(endpointHash),
        endpoint: String(endpoint),
        p256dh: String(p256dh),
        auth: String(auth),
        expiration_time: expirationTime == null ? null : Number(expirationTime),
        endpoint_origin: String(endpointOrigin),
        endpoint_host: String(endpointHost),
        user_agent: userAgent == null ? null : String(userAgent),
        created_at: existing?.created_at ?? String(createdAt),
        updated_at: String(updatedAt),
      }
      this.pushSubscriptions.set(row.id, row)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM browser_push_subscriptions')) {
      const userId = String(args[0])
      const id = String(args[1])
      const row = this.pushSubscriptions.get(id)
      if (!row || row.user_id !== userId)
        return { meta: { changes: 0 } }
      this.pushSubscriptions.delete(id)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM browser_push_subscriptions')) {
      const userId = String(args[0])
      const endpointHash = String(args[1])
      const row = [...this.pushSubscriptions.values()]
        .find(item => item.user_id === userId && item.endpoint_hash === endpointHash)
      return row ? { created_at: row.created_at } : null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (!sql.includes('FROM browser_push_subscriptions'))
      return []

    const userId = String(args[0])
    const limit = Number(args[1]) || 20
    return [...this.pushSubscriptions.values()]
      .filter(row => row.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
  }
}

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  getQuery: vi.fn(),
  readBody: vi.fn(),
}))

const credentialMocks = vi.hoisted(() => ({
  getNotificationCredential: vi.fn(),
  notificationCredentialExists: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    getQuery: h3Mocks.getQuery,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))
vi.mock('../../../../server/utils/notificationCredentialStore', () => credentialMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

let listSubscriptionsHandler: (event: any) => Promise<any>
let upsertSubscriptionHandler: (event: any) => Promise<any>
let deleteSubscriptionHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  listSubscriptionsHandler = (await import('../../../../server/api/dashboard/notifications/push-subscriptions/index.get')).default as (event: any) => Promise<any>
  upsertSubscriptionHandler = (await import('../../../../server/api/dashboard/notifications/push-subscriptions/index.post')).default as (event: any) => Promise<any>
  deleteSubscriptionHandler = (await import('../../../../server/api/dashboard/notifications/push-subscriptions/[id].delete')).default as (event: any) => Promise<any>
})

function makeEvent(marker = 'push-subscriptions') {
  return {
    path: `/api/dashboard/notifications/push-subscriptions/${marker}`,
    node: {
      req: {
        url: `/api/dashboard/notifications/push-subscriptions/${marker}`,
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {
      params: {},
    },
  }
}

describe('/api/dashboard/notifications/push-subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = null
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_1',
      authSource: 'session',
    })
    h3Mocks.getHeader.mockReturnValue('vitest browser')
    h3Mocks.getQuery.mockReturnValue({})
    credentialMocks.getNotificationCredential.mockResolvedValue({
      url: 'https://push-relay.example.test/send',
      signingSecret: 'webpush-secret',
    })
    credentialMocks.notificationCredentialExists.mockResolvedValue(true)
    networkMocks.request.mockResolvedValue({
      status: 202,
      statusText: 'Accepted',
      ok: true,
      url: 'https://push-relay.example.test/send',
      headers: {},
      data: { ok: true },
    })
  })

  it('registers, lists, and deletes only sanitized browser push subscription summaries', async () => {
    const event = makeEvent()
    h3Mocks.readBody.mockResolvedValue({
      subscription: {
        endpoint: 'https://push.example.test/user-1/subscription-1',
        expirationTime: null,
        keys: {
          p256dh: 'p256dh-unit-test-key',
          auth: 'auth-unit-test-key',
        },
      },
    })

    const created = await upsertSubscriptionHandler(event)
    const listed = await listSubscriptionsHandler(event)
    event.context.params = { id: created.subscription.id }
    const deleted = await deleteSubscriptionHandler(event)
    const afterDelete = await listSubscriptionsHandler(event)

    expect(created.subscription).toEqual(expect.objectContaining({
      userId: 'user_1',
      endpointOrigin: 'https://push.example.test',
      endpointHost: 'push.example.test',
      hasKeys: true,
    }))
    expect(listed.subscriptions).toEqual([
      expect.objectContaining({
        id: created.subscription.id,
        endpointHost: 'push.example.test',
      }),
    ])
    expect(JSON.stringify(created)).not.toContain('https://push.example.test/user-1/subscription-1')
    expect(JSON.stringify(listed)).not.toContain('p256dh-unit-test-key')
    expect(JSON.stringify(listed)).not.toContain('auth-unit-test-key')
    expect(deleted.deleted).toBe(true)
    expect(afterDelete.subscriptions).toEqual([])

    const audit = await listPlatformGovernanceEvents(event, {
      scope: 'notification',
      resourceType: 'browser_push_subscription',
      resourceId: created.subscription.id,
      limit: 20,
    })
    const serialized = JSON.stringify(audit)
    expect(serialized).toContain('browser_push.subscription.upserted')
    expect(serialized).toContain('browser_push.subscription.deleted')
    expect(serialized).toContain('push.example.test')
    expect(serialized).not.toContain('https://push.example.test/user-1/subscription-1')
    expect(serialized).not.toContain('p256dh-unit-test-key')
    expect(serialized).not.toContain('auth-unit-test-key')
  })

  it('uses stored push subscriptions for webpush relay delivery without leaking subscription secrets into governance audit', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    h3Mocks.readBody.mockResolvedValue({
      subscription: {
        endpoint: `https://push.example.test/subscriptions/${marker}`,
        keys: {
          p256dh: 'stored-p256dh-key',
          auth: 'stored-auth-key',
        },
      },
    })
    await upsertSubscriptionHandler(event)

    const authRef = `secure://notifications/webpush-${marker}`
    await upsertPlatformGovernanceConfig(event, {
      configType: 'notification_channel',
      name: `Web Push ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: `webpush-${marker}`,
      config: {
        mode: 'send',
        providerType: 'webpush',
        credentialRef: authRef,
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        userId: 'user_1',
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        adapter: 'webpush',
        status: 'sent',
        reason: 'delivery-sent',
      }),
    ]))
    const request = networkMocks.request.mock.calls[0]?.[0]
    const body = JSON.parse(String(request.body))
    expect(body.subscriptions).toEqual([
      expect.objectContaining({
        endpoint: `https://push.example.test/subscriptions/${marker}`,
        keys: {
          p256dh: 'stored-p256dh-key',
          auth: 'stored-auth-key',
        },
      }),
    ])

    const audit = await listPlatformGovernanceEvents(event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(audit)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).toContain(`webpush-${marker}`)
    expect(serialized).not.toContain(`https://push.example.test/subscriptions/${marker}`)
    expect(serialized).not.toContain('stored-p256dh-key')
    expect(serialized).not.toContain('stored-auth-key')
    expect(serialized).not.toContain('webpush-secret')
    expect(serialized).not.toContain(authRef)
  })

  it('rejects invalid subscription payloads', async () => {
    h3Mocks.readBody.mockResolvedValue({
      subscription: {
        endpoint: 'http://push.example.test/not-secure',
        keys: {
          p256dh: 'p256dh-unit-test-key',
          auth: 'auth-unit-test-key',
        },
      },
    })

    await expect(upsertSubscriptionHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('https'),
    })
  })
})
