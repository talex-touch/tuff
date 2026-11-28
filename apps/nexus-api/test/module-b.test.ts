import { describe, expect, it } from 'vitest'
import storageIndexHandler from '../server/api/dashboard/storage/index.get'
import storageSessionsHandler from '../server/api/dashboard/storage/sessions.get'
import notificationsGetHandler from '../server/api/notifications/index.get'
import pushDeleteHandler from '../server/api/notifications/push/[id].delete'
import pushGetHandler from '../server/api/notifications/push.get'
import pushPostHandler from '../server/api/notifications/push.post'
import notificationsReadHandler from '../server/api/notifications/read.post'
import { storeBrowserNotification } from '../server/utils/browserNotificationInboxStore'
import { handshakeSyncSession } from '../server/utils/syncStoreV1'
import {
  buildSessionCookieHeader,
  createSqliteD1Database,
  createTestEvent,
  seedTestUser,
} from './helpers/test-runtime'

describe('Module B: Slim Notifications / WebPush + Sync Storage', () => {
  it('returns paginated notifications with unreadCount, marks read, and manages WebPush subscriptions', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, { email: 'notify@example.com' })
    const cookie = await buildSessionCookieHeader({ userId: user.id, email: user.email })

    const seedEvent = createTestEvent({ db })
    const n1 = await storeBrowserNotification(seedEvent, {
      userId: user.id,
      action: 'plugin.approved',
      title: 'Plugin Approved',
      body: 'v1.0.0 is live',
    })
    await storeBrowserNotification(seedEvent, {
      userId: user.id,
      action: 'release.published',
      title: 'New Release',
      body: 'v2.4.0 is out',
    })

    // GET /api/notifications returns list + unreadCount + pagination together
    const page1 = await notificationsGetHandler(createTestEvent({
      db,
      url: '/api/notifications?page=1&limit=1',
      headers: { cookie },
    }))
    expect(page1.notifications).toHaveLength(1)
    expect(page1.total).toBe(2)
    expect(page1.unreadCount).toBe(2)
    expect(page1.hasMore).toBe(true)

    // POST /api/notifications/read marks single item read
    const readOne = await notificationsReadHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/notifications/read',
      headers: { cookie },
      body: { ids: [n1.id] },
    }))
    expect(readOne.ok).toBe(true)
    expect(readOne.updated).toBe(1)
    expect(readOne.unreadCount).toBe(1)

    // POST /api/notifications/read with all=true clears remaining
    const readAll = await notificationsReadHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/notifications/read',
      headers: { cookie },
      body: { all: true },
    }))
    expect(readAll.updated).toBe(1)
    expect(readAll.unreadCount).toBe(0)

    // WebPush subscribe -> list -> delete
    const pushCreate = await pushPostHandler(createTestEvent({
      db,
      method: 'POST',
      url: '/api/notifications/push',
      headers: { cookie, 'user-agent': 'Vitest/1.0' },
      body: {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub-123',
          expirationTime: null,
          keys: {
            p256dh: 'BTestP256dhKeyValue',
            auth: 'TestAuthSecretValue',
          },
        },
      },
    }))
    expect(pushCreate.ok).toBe(true)
    const subId = pushCreate.subscription.id

    const pushList = await pushGetHandler(createTestEvent({
      db,
      url: '/api/notifications/push',
      headers: { cookie },
    }))
    expect(pushList.subscriptions).toHaveLength(1)
    expect(pushList.vapidPublicKey).toBe('BTestVapidPublicKey1234567890')
    expect(pushList.enabled).toBe(true)

    const pushDel = await pushDeleteHandler(createTestEvent({
      db,
      method: 'DELETE',
      url: `/api/notifications/push/${subId}`,
      params: { id: subId },
      headers: { cookie },
    }))
    expect(pushDel.deleted).toBe(true)

    const pushListAfter = await pushGetHandler(createTestEvent({
      db,
      url: '/api/notifications/push',
      headers: { cookie },
    }))
    expect(pushListAfter.subscriptions).toHaveLength(0)
  })

  it('returns consolidated sync storage status and device sync sessions', async () => {
    const db = createSqliteD1Database()
    const user = await seedTestUser(db, { email: 'sync@example.com' })
    const cookie = await buildSessionCookieHeader({ userId: user.id, email: user.email })

    await handshakeSyncSession(createTestEvent({ db }), user.id, 'device-mac-1')

    const status = await storageIndexHandler(createTestEvent({
      db,
      url: '/api/dashboard/storage',
      headers: { cookie },
    }))
    expect(status.quota.plan_tier).toBe('FREE')
    expect(status.keyrings).toEqual([])
    expect(status.latestSession?.device_id).toBe('device-mac-1')

    const sessions = await storageSessionsHandler(createTestEvent({
      db,
      url: '/api/dashboard/storage/sessions',
      headers: { cookie },
    }))
    expect(sessions.sessions).toHaveLength(1)
    expect(sessions.sessions[0].device_id).toBe('device-mac-1')
  })
})
