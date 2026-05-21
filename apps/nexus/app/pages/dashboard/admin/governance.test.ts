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
    expect(page).toContain('analyticsData.uploads.stuckAttemptAgeMs')
    expect(page).toContain('analyticsData.uploads.stuckRate')
    expect(page).toContain('analyticsData.uploads.uploadDurationMs.average')
    expect(page).toContain('formatDurationMs(analyticsData.uploads.uploadDurationMs.average)')
    expect(page).toContain('analyticsData.uploads.byStatusCode')
    expect(page).toContain('analyticsData.uploads.bySurface')
    expect(page).toContain('analyticsData.uploads.byStorageProvider')
    expect(page).toContain('dashboard.governance.analytics.uploadStuckAttempts')
  })

  it('exposes browser push subscription analytics in the notification cockpit', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain('browserPushSubscriptions: {')
    expect(page).toContain('analyticsData.notifications.browserPushSubscriptions.total')
    expect(page).toContain('analyticsData.notifications.browserPushSubscriptions.registered')
    expect(page).toContain('analyticsData.notifications.browserPushSubscriptions.deleted')
    expect(page).toContain('analyticsData.notifications.browserPushSubscriptions.byEndpointHost')
    expect(page).toContain('analyticsData.notifications.browserPushSubscriptions.byAction')
    expect(page).toContain('dashboard.governance.analytics.browserPushSubscriptions')
  })

  it('exposes storage policy alerts for storage limit and traffic risk', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain('interface StoragePolicyAlert')
    expect(page).toContain('alerts: StoragePolicyAlert[]')
    expect(page).toContain('limitKey: StorageAlertLimitKey')
    expect(page).toContain('const derivedStoragePolicyAlerts = computed<StoragePolicyAlert[]>')
    expect(page).toContain('const storagePolicyAlerts = computed(() => storagePoliciesData.value?.alerts')
    expect(page).toContain("metric: 'storedBytes'")
    expect(page).toContain("metric: 'trafficBytes'")
    expect(page).toContain("metric: 'operations'")
    expect(page).toContain('dashboard.governance.storageAlerts.title')
    expect(page).toContain('storagePolicyAlerts.some(item => item.status ===')
    expect(page).toContain('formatStorageAlertValue(alert, alert.usage)')
  })

  it('exposes storage alert notification controls', () => {
    const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')

    expect(page).toContain("requestJson<StorageAlertNotifyResponse>('/api/dashboard/storage/alerts/notify'")
    expect(page).toContain("notifyStorageAlerts('plan')")
    expect(page).toContain("notifyStorageAlerts('send')")
    expect(page).toContain('storageAlertNotifyResult.dispatches')
    expect(page).toContain('dashboard.governance.storageAlerts.dryRun')
    expect(page).toContain('dashboard.governance.storageAlerts.send')
  })
})
