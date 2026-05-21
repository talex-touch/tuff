import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard data governance UI contract', () => {
  it('exposes notification channel test controls wired to the admin test API', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain("requestJson<NotificationChannelTestResponse>('/api/dashboard/notifications/channels/test'")
    expect(page).toContain("testNotificationChannel('plan')")
    expect(page).toContain("testNotificationChannel('send')")
    expect(page).toContain('notificationTestForm.configId')
    expect(page).toContain('notificationTestResult.deliveries')
    expect(page).toContain('dashboard.governance.notificationTest.dryRun')
    expect(page).toContain('dashboard.governance.notificationTest.send')
  })

  it('exposes granular anonymized search context analytics', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain('analyticsData.searches.byLocalHour')
    expect(page).toContain('analyticsData.searches.byContextAppCategory')
    expect(page).toContain('analyticsData.searches.byTriggerType')
    expect(page).toContain('analyticsData.searches.byUserPreferenceMode')
    expect(page).toContain('analyticsData.searches.byPluginId')
    expect(page).toContain('analyticsData.searches.byPluginCategory')
    expect(page).toContain('dashboard.governance.analytics.searchPreference')
  })

  it('exposes upload reliability diagnostics for stuck attempts and failures', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain('analyticsData.uploads.stuckAttempts')
    expect(page).toContain('analyticsData.uploads.stuckRate')
    expect(page).toContain('analyticsData.uploads.uploadDurationMs.average')
    expect(page).toContain('analyticsData.uploads.byStatusCode')
    expect(page).toContain('analyticsData.uploads.bySurface')
    expect(page).toContain('analyticsData.uploads.byStorageProvider')
    expect(page).toContain('dashboard.governance.analytics.uploadStuckAttempts')
  })
})
