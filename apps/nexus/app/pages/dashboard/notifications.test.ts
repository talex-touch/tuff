import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readAppFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('dashboard notification inbox UI contract', () => {
  it('exposes notifications as an account navigation item', () => {
    const nav = readAppFile('components/dashboard/DashboardNav.vue')

    expect(nav).toContain("notifications: '/dashboard/notifications'")
    expect(nav).toContain("id: 'notifications'")
    expect(nav).toContain("route.path.startsWith('/dashboard/notifications')")
    expect(nav).toContain("requestJson<{ unreadCount?: unknown }>('/api/dashboard/notifications/inbox'")
    expect(nav).toContain("status: 'unread'")
    expect(nav).toContain('limit: 1')
    expect(nav).toContain("useState<number>('dashboard-notification-unread-count'")
    expect(nav).toContain("item.id === 'notifications' && notificationUnreadCount > 0")
    expect(nav).toContain('notificationUnreadBadgeText')
    expect(nav).toContain('dashboard.notifications.unreadBadgeLabel')
  })

  it('uses the browser notification inbox APIs for list and read actions', () => {
    const page = readFileSync(new URL('./notifications.vue', import.meta.url), 'utf8')

    expect(page).toContain("requestJson<InboxResponse>('/api/dashboard/notifications/inbox'")
    expect(page).toContain("requestJson('/api/dashboard/notifications/inbox/read'")
    expect(page).toContain("requestJson<BrowserPushSubscriptionsResponse>('/api/dashboard/notifications/push-subscriptions'")
    expect(page).toContain("requestJson('/api/dashboard/notifications/push-subscriptions'")
    expect(page).toContain('requestJson(`/api/dashboard/notifications/push-subscriptions/')
    expect(page).toContain("method: 'DELETE'")
    expect(page).toContain("useState<number>('dashboard-notification-unread-count'")
    expect(page).toContain('navigationUnreadCount.value = data.unreadCount')
    expect(page).toContain('body: { ids }')
    expect(page).toContain('body: { all: true }')
    expect(page).toContain("status: filter.value")
  })

  it('exposes a client-only browser notification permission and test flow', () => {
    const page = readFileSync(new URL('./notifications.vue', import.meta.url), 'utf8')

    expect(page).toContain("import { hasWindow } from '@talex-touch/utils/env'")
    expect(page).toContain("'Notification' in window")
    expect(page).toContain('window.Notification.permission')
    expect(page).toContain('window.Notification.requestPermission()')
    expect(page).toContain('new window.Notification')
    expect(page).toContain("tag: 'tuff-dashboard-notification-test'")
    expect(page).toContain("navigator.serviceWorker.register('/notification-sw.js')")
    expect(page).toContain('registration.pushManager.subscribe')
    expect(page).toContain('urlBase64ToArrayBuffer(browserPushPublicKey.value)')
    expect(page).toContain('runtimeConfig.public?.notificationWebPush?.publicKey')
    expect(page).toContain('browserPushStatusLabel')
    expect(page).toContain('browserNotificationActionDisabled')
    expect(page).toContain('browserNotificationPermissionLabel')
    expect(page).toContain('dashboard.notifications.browser.testSent')
    expect(page).toContain('dashboard.notifications.browser.webPushSubscribed')
    expect(page).toContain('dashboard.notifications.browser.webPushUnsubscribed')
  })
})
