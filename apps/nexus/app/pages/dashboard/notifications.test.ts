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
  })

  it('uses the browser notification inbox APIs for list and read actions', () => {
    const page = readFileSync(new URL('./notifications.vue', import.meta.url), 'utf8')

    expect(page).toContain("requestJson<InboxResponse>('/api/dashboard/notifications/inbox'")
    expect(page).toContain("requestJson('/api/dashboard/notifications/inbox/read'")
    expect(page).toContain('body: { ids }')
    expect(page).toContain('body: { all: true }')
    expect(page).toContain("status: filter.value")
  })
})
