import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface InboxRow {
  id: string
  user_id: string
  action: string
  title: string
  body: string
  resource_type: string | null
  resource_id: string | null
  status: string
  metadata_json: string | null
  occurred_at: string
  created_at: string
  read_at: string | null
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
  inbox = new Map<string, InboxRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO browser_notification_inbox')) {
      const [
        id,
        userId,
        action,
        title,
        body,
        resourceType,
        resourceId,
        status,
        metadataJson,
        occurredAt,
        createdAt,
        readAt,
      ] = args
      this.inbox.set(String(id), {
        id: String(id),
        user_id: String(userId),
        action: String(action),
        title: String(title),
        body: String(body),
        resource_type: resourceType == null ? null : String(resourceType),
        resource_id: resourceId == null ? null : String(resourceId),
        status: String(status),
        metadata_json: metadataJson == null ? null : String(metadataJson),
        occurred_at: String(occurredAt),
        created_at: String(createdAt),
        read_at: readAt == null ? null : String(readAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE browser_notification_inbox')) {
      const userId = String(args[0])
      const readAt = String(args[1])
      const ids = new Set(args.slice(2).map(String))
      let changes = 0
      for (const row of this.inbox.values()) {
        if (row.user_id !== userId || row.status !== 'unread')
          continue
        if (ids.size > 0 && !ids.has(row.id))
          continue
        row.status = 'read'
        row.read_at = readAt
        changes += 1
      }
      return { meta: { changes } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('COUNT(*) AS count')) {
      const userId = String(args[0])
      return {
        count: [...this.inbox.values()].filter(row => row.user_id === userId && row.status === 'unread').length,
      }
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (!sql.includes('FROM browser_notification_inbox'))
      return []

    const userId = String(args[0])
    const statusFilter = sql.includes('status = ?') ? String(args[1]) : null
    const limit = Number(args[statusFilter ? 2 : 1]) || 50

    return [...this.inbox.values()]
      .filter(row => row.user_id === userId)
      .filter(row => !statusFilter || row.status === statusFilter)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
  }
}

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  readBody: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

let listInboxHandler: (event: any) => Promise<any>
let markReadHandler: (event: any) => Promise<any>
let storeBrowserNotification: typeof import('../../../../server/utils/browserNotificationInboxStore').storeBrowserNotification

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  const store = await import('../../../../server/utils/browserNotificationInboxStore')
  storeBrowserNotification = store.storeBrowserNotification
  listInboxHandler = (await import('../../../../server/api/dashboard/notifications/inbox/index.get')).default as (event: any) => Promise<any>
  markReadHandler = (await import('../../../../server/api/dashboard/notifications/inbox/read.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/notifications/inbox',
    node: { req: { url: '/api/dashboard/notifications/inbox' } },
    context: {},
  }
}

describe('/api/dashboard/notifications/inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockD1Database()
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_1',
      authSource: 'session',
    })
    h3Mocks.getQuery.mockReturnValue({})
  })

  it('lists only the signed-in user browser inbox and marks selected items read', async () => {
    const event = makeEvent()
    const own = await storeBrowserNotification(event, {
      userId: 'user_1',
      action: 'plugin.version.approved',
      title: 'Plugin approved',
      body: 'Tuff notification: plugin.version.approved',
      resourceType: 'plugin',
      resourceId: 'plugin_1',
      metadata: {
        pluginId: 'plugin_1',
        to: 'developer@example.com',
      },
    })
    await storeBrowserNotification(event, {
      userId: 'user_2',
      action: 'plugin.version.approved',
      title: 'Other plugin approved',
      body: 'Tuff notification: plugin.version.approved',
      resourceType: 'plugin',
      resourceId: 'plugin_2',
      metadata: {
        pluginId: 'plugin_2',
      },
    })

    const listed = await listInboxHandler(event)

    expect(listed.unreadCount).toBe(1)
    expect(listed.notifications).toEqual([
      expect.objectContaining({
        id: own.id,
        userId: 'user_1',
        status: 'unread',
        resourceId: 'plugin_1',
      }),
    ])
    expect(JSON.stringify(listed)).not.toContain('developer@example.com')
    expect(JSON.stringify(listed)).not.toContain('user_2')

    h3Mocks.readBody.mockResolvedValue({ ids: [own.id] })
    const marked = await markReadHandler(event)
    h3Mocks.getQuery.mockReturnValue({ status: 'all' })
    const after = await listInboxHandler(event)

    expect(marked.updated).toBe(1)
    expect(after.unreadCount).toBe(0)
    expect(after.notifications).toEqual([
      expect.objectContaining({
        id: own.id,
        status: 'read',
        readAt: expect.any(String),
      }),
    ])
  })

  it('rejects mark-read calls without ids or all=true', async () => {
    h3Mocks.readBody.mockResolvedValue({})

    await expect(markReadHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('ids or all=true'),
    })
  })
})
