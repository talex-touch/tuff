import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./governance.vue', import.meta.url), 'utf8')
const governanceTypes = readFileSync(new URL('../../../types/admin-governance.ts', import.meta.url), 'utf8')
const governanceFormatters = readFileSync(new URL('../../../utils/admin-governance.ts', import.meta.url), 'utf8')

function expectSourceContracts(source: string, contracts: string[]) {
  for (const contract of contracts)
    expect(source).toContain(contract)
}

describe('dashboard data governance UI contract', () => {
  it('keeps notification channel request, profile, and delivery contracts at their owning boundaries', () => {
    expectSourceContracts(governanceTypes, [
      'export interface NotificationChannelProfileTemplate',
      'export interface NotificationChannelEvaluation',
      'export interface NotificationChannelsResponse',
      'evaluations: NotificationChannelEvaluation[]',
      'profiles: NotificationChannelProfileTemplate[]',
      'export interface NotificationChannelTestResponse',
      'deliveries: NotificationDeliveryRecord[]',
      'export interface NotificationCredentialRecord',
    ])
    expectSourceContracts(governanceFormatters, [
      'function notificationChannelLabel',
      'function notificationChannelCredentialLabel',
      'function notificationChannelReadinessLabel',
      'function notificationDeliveryTone',
    ])
    expectSourceContracts(page, [
      "requestJson<NotificationChannelsResponse>('/api/dashboard/notifications/channels'",
      "requestJson<NotificationChannelTestResponse>('/api/dashboard/notifications/channels/test'",
      'notificationProfiles',
      'selectedNotificationProfile',
      'selectedNotificationChannelEvaluation',
      'applyNotificationProfile',
      'createNotificationCredentialTemplate',
      'notificationForm.profileId',
      'notificationCredentialForm.credentialsJson',
      'notificationTestForm.configId',
      'notificationTestResult.deliveries',
      "testNotificationChannel('plan')",
      "testNotificationChannel('send')",
      'dashboard.governance.notificationProfiles.credential',
      'dashboard.governance.notificationTest.dryRun',
      'dashboard.governance.notificationTest.send',
    ])
  })

  it('keeps granular anonymized search analytics schema separate from its dashboard presentation', () => {
    expectSourceContracts(governanceTypes, [
      'export interface GovernanceSearchTimeHeatmapPoint',
      'timeHeatmap: GovernanceSearchTimeHeatmapPoint[]',
      'export interface GovernanceSearchFrequencyCohort',
      'frequencyCohorts: GovernanceSearchFrequencyCohort[]',
      'pluginPreferenceByTimeSlot: GovernanceSearchPluginPreferenceByTimeSlot[]',
      'pluginPreferenceByContext: GovernanceSearchPluginPreferenceByContext[]',
      'contextSelectionMatrix: GovernanceSearchContextSelectionMatrixItem[]',
      'journey: GovernanceSearchJourney',
      'selectionSummary: {',
      'reliabilitySummary: {',
      'reliabilityTrend: Array<'
    ])
    expectSourceContracts(governanceFormatters, [
      'function formatHeatmapCellOpacity',
      'function formatWeekdayLabel',
      'function formatPercent',
    ])
    expectSourceContracts(page, [
      'analyticsData.searches.byLocalHour',
      'analyticsData.searches.byLocalDayOfWeek',
      'analyticsData.searches.byLocalTimeSlot',
      'analytics.value.searches.timeHeatmap',
      'analyticsData.searches.frequencyCohorts',
      'analyticsData.searches.byContextAppCategory',
      'analyticsData.searches.byTriggerType',
      'analyticsData.searches.byUserPreferenceMode',
      'analyticsData.searches.byPluginId',
      'analyticsData.searches.byPluginCategory',
      'analyticsData.searches.pluginPreferenceByTimeSlot',
      'analyticsData.searches.pluginPreferenceByContext',
      'analyticsData.searches.contextSelectionMatrix',
      'analyticsData.searches.journey.total',
      'analyticsData.searches.journey.withResultsRate',
      'analyticsData.searches.selectionSummary.selectionRate',
      'analyticsData.searches.reliabilitySummary.zeroResultRate',
      'analyticsData.searches.reliabilitySummary.problemRate',
      'analyticsData.searches.bySelectedProvider',
      'analyticsData.searches.bySelectedCategory',
      'analyticsData.searches.bySelectedPluginId',
      'analyticsData.searches.bySelectedRankBucket',
      'analyticsData.searches.byQueryLengthBucket',
      'analyticsData.searches.byResultCountBucket',
      'analyticsData.searches.byFirstResultLatencyBucket',
      'analyticsData.searches.byTotalDurationBucket',
      'formatHeatmapCellOpacity(cell.events, searchTimeHeatmapPeak)',
      'formatWeekdayLabel(item.dayOfWeek)',
      'dashboard.governance.analytics.searchTimeHeatmap',
      'dashboard.governance.analytics.searchFrequencyCohorts',
      'dashboard.governance.analytics.searchJourneyFunnel',
    ])
  })

  it('renders growth, hot-plugin, and operations data from the shared analytics schema', () => {
    expectSourceContracts(governanceTypes, [
      'export interface GovernanceGrowthTrendPoint',
      'signupGrowthTrend: GovernanceGrowthTrendPoint[]',
      'export interface PluginLeaderboardItem',
      'hotScore: number',
      'growthRate: number',
      'export interface GovernanceOperationsTimelinePoint',
      'operationsTimeline: GovernanceOperationsTimelinePoint[]',
      'leaderboards: {',
      'riskSummary: {',
    ])
    expectSourceContracts(governanceFormatters, [
      'function formatNumber',
      'function formatDelta',
      'function formatTrendWidth',
    ])
    expectSourceContracts(page, [
      'analyticsData.users.signupGrowthTrend',
      'formatNumber(item.cumulative)',
      'formatDelta(item.growthRate)',
      'dashboard.governance.analytics.userGrowthTrend',
      'dashboard.governance.analytics.userGrowthTotal',
      'formatNumber(item.hotScore)',
      'formatDelta(item.growth.growthRate)',
      'item.byAction.slice(0, 3)',
      'analyticsData.dashboard.growth.userSignups',
      'analyticsData.dashboard.growth.searches',
      'analyticsData.dashboard.growth.pluginInstalls',
      'analyticsData.dashboard.growth.providerUsage.tokens',
      'analyticsData.dashboard.growth.uploads.failureRate',
      'analyticsData.dashboard.leaderboards.hotPlugins',
      'analyticsData.dashboard.leaderboards.topModels',
      'analyticsData.dashboard.trends.operationsTimeline',
      'formatTrendWidth(item.searches, dashboardOperationsPeaks.searches)',
      'dashboard.governance.analytics.operationsDashboard',
      'dashboard.governance.analytics.dashboardOperationsCommandBoard',
      'dashboard.governance.analytics.dashboardHotPlugins',
      'dashboard.governance.analytics.dashboardModelDistribution',
    ])
  })

  it('keeps the governance report and D1 readiness models and formatters outside the page', () => {
    expectSourceContracts(governanceTypes, [
      'export interface PlatformGovernanceReportSnapshot',
      'export interface PlatformGovernanceReportScorecard',
      'export interface PlatformGovernanceReportRiskQueueItem',
      'export interface PlatformGovernanceReportEvidenceItem',
      'export interface PlatformGovernanceD1Readiness',
      'export interface PlatformGovernanceD1ReadinessCheck',
      'missingTables: number',
      'missingIndexes: number',
      'backfillRequired: number',
    ])
    expectSourceContracts(governanceFormatters, [
      'function reportStatusLabel',
      'function reportEvidenceLabel',
      'function reportPriorityTone',
      'function formatD1MissingObjects',
      'function d1ReadinessLabel',
    ])
    expectSourceContracts(page, [
      "requestJson<PlatformGovernanceReportSnapshot>('/api/dashboard/governance/report'",
      "requestJson<PlatformGovernanceD1Readiness>('/api/dashboard/governance/d1-readiness'",
      'governanceReport.report.scorecards',
      'governanceReport.report.evidenceStatus',
      'governanceReport.report.riskQueue',
      'governanceReport.report.trendSummary.peakProviderTokens',
      'reportStatusLabel(governanceReport.report.status)',
      'reportEvidenceLabel(item.status)',
      'reportPriorityTone(item.priority)',
      'd1Readiness.summary.missingTables',
      'd1Readiness.summary.missingIndexes',
      'd1Readiness.summary.backfillRequired',
      'formatD1MissingObjects(check)',
      'dashboard.governance.report.title',
      'dashboard.governance.d1Readiness.title',
    ])
  })

  it('renders visit and upload reliability analytics without inlining their payload types', () => {
    expectSourceContracts(governanceTypes, [
      'byRoute: GovernanceMetric[]',
      'bySurface: GovernanceMetric[]',
      'byLocalTimeSlot: GovernanceMetric[]',
      'byLocalDayOfWeek: GovernanceMetric[]',
      'byCountry: GovernanceMetric[]',
      'byRegion: GovernanceMetric[]',
      'byTimezone: GovernanceMetric[]',
      'export interface UploadSceneAssetHealthItem',
      'sceneAssetHealth: UploadSceneAssetHealthItem[]',
      'recoveredEvidence: Array<{',
      'actionQueue: Array<{',
      'failureMatrix: Array<{',
    ])
    expectSourceContracts(governanceFormatters, [
      'function formatDurationMs',
    ])
    expectSourceContracts(page, [
      'analyticsData.visits.byRoute',
      'analyticsData.visits.bySurface',
      'analyticsData.visits.byLocalTimeSlot',
      'analyticsData.visits.byLocalDayOfWeek',
      'analyticsData.visits.byCountry',
      'analyticsData.visits.byRegion',
      'analyticsData.visits.byTimezone',
      'analyticsData.visits.trend',
      'dashboard.governance.analytics.visitHotspot',
      'analyticsData.uploads.stuckAttempts',
      'analyticsData.uploads.stuckAttemptAgeMs',
      'analyticsData.uploads.stuckRate',
      'analyticsData.uploads.uploadDurationMs.average',
      'analyticsData.uploads.retrySummary.recoveredRetryRate',
      'analyticsData.uploads.sceneAssetHealth',
      'analyticsData.uploads.pipelineSummary',
      'analyticsData.uploads.failureMatrix',
      'analyticsData.uploads.actionQueue',
      'analyticsData.uploads.problemAttempts',
      'formatDurationMs(analyticsData.uploads.uploadDurationMs.average)',
      'dashboard.governance.analytics.uploadRecoveredEvidence',
      'dashboard.governance.analytics.uploadSceneAssetHealth',
      'dashboard.governance.analytics.uploadActionQueue',
      'dashboard.governance.analytics.uploadFailureMatrix',
    ])
  })

  it('renders notification health, evidence, and browser-push analytics from shared contracts', () => {
    expectSourceContracts(governanceTypes, [
      'export interface NotificationDeliveryAnalytics',
      'channelSummary: {',
      'channelRisks: Array<{',
      'actionQueue: NotificationActionQueueItem[]',
      'providerMix: Array<{',
      'providerHealth: Array<{',
      'deliveryTrend: Array<',
      'durationMs: GovernanceNumberStat',
      'byStatusCode: GovernanceMetric[]',
      'export interface NotificationDeliveryEvidenceItem',
      'deliveryEvidence: NotificationDeliveryEvidenceItem[]',
      'export interface NotificationTestEvidenceItem',
      'testEvidence: NotificationTestEvidenceItem[]',
      'browserPushSubscriptions: {',
    ])
    expectSourceContracts(governanceFormatters, [
      'function notificationActionQueueStatusLabel',
      'function notificationChannelCredentialLabel',
      'function notificationChannelReadinessLabel',
    ])
    expectSourceContracts(page, [
      'analyticsData.notifications.browserPushSubscriptions.total',
      'analyticsData.notifications.browserPushSubscriptions.byEndpointHost',
      'analyticsData.notifications.channelSummary.enabled',
      'analyticsData.notifications.channelSummary.credentialMissing',
      'analyticsData.notifications.channelSummary.productionReady',
      'analyticsData.notifications.actionQueue',
      'analyticsData.notifications.providerMix',
      'analyticsData.notifications.channelRisks',
      'analyticsData.notifications.deliveries.durationMs.average',
      'analyticsData.notifications.byStatusCode',
      'analyticsData.notifications.deliveryTrend',
      'analyticsData.notifications.providerHealth',
      'analyticsData.notifications.deliveryEvidence',
      'analyticsData.notifications.testEvidence',
      'notificationChannelLabel(channel.status)',
      'notificationChannelCredentialLabel(channel)',
      'notificationChannelReadinessLabel(channel)',
      'notificationDeliveryTone(item.status)',
      'dashboard.governance.analytics.browserPushSubscriptions',
      'dashboard.governance.analytics.notificationActionQueue',
      'dashboard.governance.analytics.notificationDeliveryEvidence',
      'dashboard.governance.analytics.notificationTestEvidence',
    ])
  })

  it('keeps storage policy, capacity, and alert payload contracts outside the page defaults', () => {
    expectSourceContracts(governanceTypes, [
      'export type StorageAlertMetric',
      'export interface StoragePolicyAlert',
      'alerts: StoragePolicyAlert[]',
      'limitKey: StorageAlertLimitKey',
      'export interface StorageUsageBreakdown',
      'export interface StorageChannelPressure',
      'export interface StorageActionQueueItem',
      'export interface StorageSmokeEvidenceItem',
      'smokeEvidence: StorageSmokeEvidenceItem[]',
      'policySummary: {',
      'remaining: {',
      'overage: {',
      'burnRate: {',
      'projectedExhaustionDays: {',
    ])
    expectSourceContracts(governanceFormatters, [
      'function formatStorageAlertValue',
      'function formatStorageBudgetValue',
      'function formatProjectedDays',
      'function storageEvaluationLabel',
      'function storageChannelPressureLabel',
      'function storageSmokeEvidenceLabel',
    ])
    expectSourceContracts(page, [
      "requestJson<StorageAlertNotifyResponse>('/api/dashboard/storage/alerts/notify'",
      "notifyStorageAlerts('plan')",
      "notifyStorageAlerts('send')",
      'storageAlertNotifyResult.dispatches',
      'derivedStoragePolicyAlerts',
      'storagePolicyAlerts.some(item => item.status ===',
      'formatStorageAlertValue(alert, alert.usage)',
      'analyticsData.storage.storedBytes',
      'analyticsData.storage.trafficBytes',
      'analyticsData.storage.operations',
      'analyticsData.storage.byChannelUsage',
      'analyticsData.storage.byProviderUsage',
      'analyticsData.storage.channelPressure',
      'analyticsData.storage.actionQueue',
      'analyticsData.storage.smokeEvidence',
      'analyticsData.storage.policySummary.blocked',
      'analyticsData.storage.policyRisks',
      'formatStorageBudgetValue',
      'formatProjectedDays',
      'dashboard.governance.storageAlerts.title',
      'dashboard.governance.analytics.storageUsage',
      'dashboard.governance.analytics.storageActionQueue',
      'dashboard.governance.analytics.storageChannelProjectedExhaustion',
    ])
  })

  it('keeps storage channel smoke and drill-down request contracts in the page', () => {
    expectSourceContracts(governanceTypes, [
      'export interface StorageChannelSmokeResponse',
      'export type StorageChannelSmokeMode',
      'export type StorageChannelAnalyticsResponse',
    ])
    expectSourceContracts(page, [
      "requestJson<StorageChannelSmokeResponse>('/api/dashboard/storage/channels/smoke'",
      "smokeStoragePolicy(item.policyId, 'dry-run')",
      "smokeStoragePolicy(item.policyId, 'write')",
      'storageSmokeResult.policyName',
      "requestJson<StorageChannelAnalyticsResponse>('/api/dashboard/storage/channels/analytics'",
      'storageChannelAnalyticsQuery',
      'selectedStorageChannelAnalytics',
      'storageChannelAnalyticsData.byResourceTypeUsage',
      'storageChannelAnalyticsData.byActionUsage',
      'selectedStorageChannelAnalytics.trend',
      'selectedStorageChannelAnalytics.evaluations',
      'dashboard.governance.analytics.storageChannelDetail',
    ])
  })

  it('renders provider quota utilization, risk, smoke evidence, and actions from shared types', () => {
    expectSourceContracts(governanceTypes, [
      'export type ProviderQuotaStatus',
      'export interface ProviderQuotaActionQueueItem',
      'quotaActionQueue: ProviderQuotaActionQueueItem[]',
      'export interface ProviderQuotaRiskItem',
      'quotaRiskItems: ProviderQuotaRiskItem[]',
      'export interface ProviderQuotaSmokeEvidenceItem',
      'quotaSmokeEvidence: ProviderQuotaSmokeEvidenceItem[]',
      'quotaSummary: {',
      'usageSummary: {',
      'export interface ProviderModelDistributionItem',
      'modelDistribution: ProviderModelDistributionItem[]',
      'export interface ProviderModelChannelDistributionItem',
      'modelChannelDistribution: ProviderModelChannelDistributionItem[]',
      'channelDistribution: ProviderChannelDistributionItem[]',
    ])
    expectSourceContracts(governanceFormatters, [
      'function providerQuotaLabel',
      'function providerQuotaTone',
      'function providerQuotaSmokeLabel',
      'function providerQuotaSmokeTone',
      'function providerQuotaActionReasonLabel',
      'function providerQuotaActionTone',
      'function providerQuotaRiskReasonLabel',
    ])
    expectSourceContracts(page, [
      'analyticsData.providers.channelDistribution',
      'analyticsData.providers.modelChannelDistribution',
      'analyticsData.providers.quotaActionQueue',
      'analyticsData.providers.quotaRiskItems',
      'analyticsData.providers.quotaSummary.requestOverage',
      'analyticsData.providers.quotaSummary.lowestRemainingTokens',
      'analyticsData.providers.quotaSmokeEvidence',
      'analyticsData.providers.usageSummary.tokens',
      'analyticsData.providers.usageSummary.requests',
      'analyticsData.providers.trend',
      'analyticsData.providers.modelDistribution',
      'analyticsData.providers.quotas',
      'providerQuotaActionReasonLabel(item.reason)',
      'providerQuotaRiskReasonLabel(item.riskReason)',
      'providerQuotaSmokeLabel(item.status)',
      'providerQuotaLabel(quota.status)',
      'formatRatio(quota.utilization.requests)',
      'formatRatio(quota.utilization.tokens)',
      'dashboard.governance.analytics.providerQuotaActionQueue',
      'dashboard.governance.analytics.providerQuotaRiskBudget',
      'dashboard.governance.analytics.providerQuotaSmokeEvidence',
      'dashboard.governance.analytics.providerQuotaProjectedExhaustion',
    ])
  })
})
