<script setup lang="ts">
import type {
  DashboardPlugin as Plugin,
  DashboardPluginAnalytics,
  DashboardPluginAnalyticsConversionTrendPoint,
  DashboardPluginAnalyticsMetric,
  DashboardPluginOwnerActionQueueItem,
  DashboardPluginReviewActionQueueItem,
  DashboardPluginReviewCommentQualityBucket,
  DashboardPluginReviewModerationTimingBucket,
  DashboardPluginReviewRatingTrendPoint,
  DashboardPluginReviewStatusTrendPoint,
  DashboardPluginAnalyticsTrendPoint,
  DashboardPluginInvocationHealthTrendPoint,
  DashboardPluginRetentionTrendPoint,
  DashboardPluginTimelineEvent,
  PluginChannel,
  DashboardPluginVersion as PluginVersion,
  VersionStatus,
} from '~/types/dashboard-plugin'
import { TxButton, TxStatusBadge, TxTag } from '@talex-touch/tuffex'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import DashboardMetricChart from '~/components/dashboard/DashboardMetricChart.client.vue'
import PluginMetaHeader from '~/components/dashboard/PluginMetaHeader.vue'

interface Props {
  isOpen: boolean
  source?: HTMLElement | DOMRect | null
  plugin: Plugin | null
  categoryLabel?: string
  isOwner?: boolean
  isAdmin?: boolean
  timeline?: DashboardPluginTimelineEvent[]
  timelineLoading?: boolean
  timelineError?: string | null
  analytics?: DashboardPluginAnalytics | null
  analyticsLoading?: boolean
  analyticsError?: string | null
  loading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit', plugin: Plugin, event: MouseEvent): void
  (e: 'delete', plugin: Plugin): void
  (e: 'publishVersion', plugin: Plugin): void
  (e: 'submitReview', plugin: Plugin): void
  (e: 'withdrawReview', plugin: Plugin): void
  (e: 'download-version', version: PluginVersion): void
  (e: 'deleteVersion', plugin: Plugin, version: PluginVersion): void
  (e: 'reeditVersion', plugin: Plugin, version: PluginVersion): void
}>()

const { t, locale } = useI18n()

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))
const shortDateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { month: 'short', day: 'numeric' }))

function formatNumber(count: number) {
  return numberFormatter.value.format(count)
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return dateFormatter.value.format(parsed)
}

function formatShortDate(value?: string | null) {
  if (!value)
    return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return shortDateFormatter.value.format(parsed)
}

function formatSize(bytes?: number | null) {
  if (!bytes)
    return '—'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function versionStatusTone(status: VersionStatus) {
  switch (status) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'danger'
    default:
      return 'warning'
  }
}

function channelTone(channel: PluginChannel) {
  switch (channel) {
    case 'RELEASE':
      return 'success'
    case 'BETA':
      return 'warning'
    default:
      return 'muted'
  }
}

function reviewActionQueuePriorityTone(priority: DashboardPluginReviewActionQueueItem['priority']) {
  if (priority === 'high')
    return 'warning'
  if (priority === 'medium')
    return 'info'
  return 'muted'
}

function ownerActionQueuePriorityTone(priority: DashboardPluginOwnerActionQueueItem['priority']) {
  if (priority === 'high')
    return 'warning'
  if (priority === 'medium')
    return 'info'
  return 'muted'
}

const canSubmitReview = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'draft' || props.plugin.status === 'rejected'
})

const canWithdrawReview = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'pending'
})

const canPublishVersion = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'approved'
})

const canEdit = computed(() => props.isOwner || props.isAdmin)
const canDelete = computed(() => props.isOwner || props.isAdmin)
const canViewTimeline = computed(() => props.isOwner || props.isAdmin)
const canViewAnalytics = computed(() => props.isOwner || props.isAdmin)

const analyticsHasData = computed(() => {
  const analytics = props.analytics
  if (!analytics)
    return false
  return analytics.events > 0
    || analytics.downloads > 0
    || analytics.installs > 0
    || analytics.invocations > 0
    || analytics.uniqueActors > 0
    || (analytics.reviews?.total ?? 0) > 0
})

const latestTrendPoint = computed(() => {
  const trend = props.analytics?.trend ?? []
  for (let index = trend.length - 1; index >= 0; index -= 1) {
    const point = trend[index]
    if (!point)
      continue
    if (isTrendPointActive(point))
      return point
  }
  return trend.at(-1) ?? null
})

const peakTrendPoint = computed(() => {
  const trend = props.analytics?.trend ?? []
  return trend.reduce<DashboardPluginAnalyticsTrendPoint | null>((current, point) => {
    if (!current)
      return point
    return point.quantity > current.quantity || (point.quantity === current.quantity && point.events > current.events)
      ? point
      : current
  }, null)
})

const analyticsStats = computed(() => {
  const analytics = props.analytics
  return [
    {
      key: 'downloads',
      icon: 'i-carbon-download',
      label: t('dashboard.sections.plugins.analytics.stats.downloads'),
      value: formatMetricValue(analytics?.downloads),
    },
    {
      key: 'installs',
      icon: 'i-carbon-package',
      label: t('dashboard.sections.plugins.analytics.stats.installs'),
      value: formatMetricValue(analytics?.installs),
    },
    {
      key: 'invocations',
      icon: 'i-carbon-function',
      label: t('dashboard.sections.plugins.analytics.stats.invocations'),
      value: formatMetricValue(analytics?.invocations),
    },
    {
      key: 'uniqueActors',
      icon: 'i-carbon-user-multiple',
      label: t('dashboard.sections.plugins.analytics.stats.uniqueActors'),
      value: formatMetricValue(analytics?.uniqueActors),
    },
    {
      key: 'reviews',
      icon: 'i-carbon-star',
      label: t('dashboard.sections.plugins.analytics.stats.reviews'),
      value: formatMetricValue(analytics?.reviews?.total),
    },
  ]
})

const reviewAnalytics = computed(() => props.analytics?.reviews ?? null)
const latestReviewTrendPoint = computed(() => {
  const trend = reviewAnalytics.value?.statusTrend ?? []
  return trend.at(-1) ?? null
})
const latestReviewRatingTrendPoint = computed(() => {
  const trend = reviewAnalytics.value?.ratingTrend ?? []
  return trend.at(-1) ?? null
})
const reviewStatusItems = computed(() => {
  const reviews = reviewAnalytics.value
  return [
    {
      key: 'approved',
      label: t('dashboard.sections.plugins.analytics.reviews.approved'),
      value: reviews?.approved ?? 0,
    },
    {
      key: 'pending',
      label: t('dashboard.sections.plugins.analytics.reviews.pending'),
      value: reviews?.pending ?? 0,
    },
    {
      key: 'rejected',
      label: t('dashboard.sections.plugins.analytics.reviews.rejected'),
      value: reviews?.rejected ?? 0,
    },
  ]
})
const reviewCommentItems = computed(() => {
  const comments = reviewAnalytics.value?.comments
  return [
    {
      key: 'titleCoverage',
      label: t('dashboard.sections.plugins.analytics.reviews.titleCoverage'),
      value: formatPercent(comments?.titleCoverageRate),
    },
    {
      key: 'contentCoverage',
      label: t('dashboard.sections.plugins.analytics.reviews.contentCoverage'),
      value: formatPercent(comments?.contentCoverageRate),
    },
    {
      key: 'averageLength',
      label: t('dashboard.sections.plugins.analytics.reviews.averageLength'),
      value: t('dashboard.sections.plugins.analytics.reviews.averageLengthValue', {
        count: formatMetricValue(comments?.averageContentLength),
      }),
    },
  ]
})
const latestReviewCommentTrendPoint = computed(() => reviewAnalytics.value?.comments?.trend.at(-1) ?? null)
const reviewCommentTrendMeta = computed(() => {
  const point = latestReviewCommentTrendPoint.value
  if (!point)
    return null
  return t('dashboard.sections.plugins.analytics.reviews.commentTrendMeta', {
    date: formatDate(point.date),
    contentCoverage: formatPercent(point.contentCoverageRate),
    averageLength: formatMetricValue(point.averageContentLength),
  })
})
const reviewCommentQualityBuckets = computed(() =>
  (reviewAnalytics.value?.comments?.qualityBuckets ?? []).filter(item => item.total > 0),
)
const reviewModerationTimingItems = computed(() => {
  const timing = reviewAnalytics.value?.moderationTiming
  return [
    {
      key: 'pending',
      label: t('dashboard.sections.plugins.analytics.reviews.moderationTiming.pending'),
      total: timing?.pending.total ?? 0,
      averageHours: timing?.pending.averageHours ?? 0,
      maxHours: timing?.pending.maxHours ?? 0,
    },
    {
      key: 'processed',
      label: t('dashboard.sections.plugins.analytics.reviews.moderationTiming.processed'),
      total: timing?.processed.total ?? 0,
      averageHours: timing?.processed.averageHours ?? 0,
      maxHours: timing?.processed.maxHours ?? 0,
    },
  ].filter(item => item.total > 0)
})
const reviewModerationTimingBuckets = computed(() =>
  (reviewAnalytics.value?.moderationTiming?.pending.buckets ?? [])
    .concat(reviewAnalytics.value?.moderationTiming?.processed.buckets ?? [])
    .filter(item => item.total > 0),
)
const reviewActionQueue = computed(() => reviewAnalytics.value?.actionQueue ?? [])

const analyticsConversionItems = computed(() => {
  const conversion = props.analytics?.conversion
  return [
    {
      key: 'installRate',
      label: t('dashboard.sections.plugins.analytics.conversion.installRate'),
      value: formatPercent(conversion?.installRate),
    },
    {
      key: 'invocationRate',
      label: t('dashboard.sections.plugins.analytics.conversion.invocationRate'),
      value: formatPercent(conversion?.invocationRate),
    },
    {
      key: 'invocationsPerActor',
      label: t('dashboard.sections.plugins.analytics.conversion.invocationsPerActor'),
      value: formatMetricValue(conversion?.invocationsPerActor),
    },
  ]
})
const ownerActionQueue = computed(() => props.analytics?.actionQueue ?? [])

const latestConversionTrendPoint = computed(() => {
  const trend = props.analytics?.conversionTrend ?? []
  for (let index = trend.length - 1; index >= 0; index -= 1) {
    const point = trend[index]
    if (!point)
      continue
    if (isConversionTrendPointActive(point))
      return point
  }
  return trend.at(-1) ?? null
})

const retentionAnalytics = computed(() => props.analytics?.retention ?? null)
const usageTiming = computed(() => props.analytics?.usageTiming ?? null)
const retentionItems = computed(() => {
  const retention = retentionAnalytics.value
  return [
    {
      key: 'retentionRate',
      label: t('dashboard.sections.plugins.analytics.retention.retentionRate'),
      value: formatPercent(retention?.retentionRate),
    },
    {
      key: 'returningActors',
      label: t('dashboard.sections.plugins.analytics.retention.returningActors'),
      value: formatMetricValue(retention?.returningActors),
    },
    {
      key: 'repeatRate',
      label: t('dashboard.sections.plugins.analytics.retention.repeatRate'),
      value: formatPercent(retention?.repeatRate),
    },
    {
      key: 'averageActiveDays',
      label: t('dashboard.sections.plugins.analytics.retention.averageActiveDays'),
      value: formatMetricValue(retention?.averageActiveDays),
    },
    {
      key: 'averageInvocationsPerActor',
      label: t('dashboard.sections.plugins.analytics.retention.averageInvocationsPerActor'),
      value: formatMetricValue(retention?.averageInvocationsPerActor),
    },
  ]
})
const latestRetentionTrendPoint = computed(() => {
  const trend = retentionAnalytics.value?.trend ?? []
  for (let index = trend.length - 1; index >= 0; index -= 1) {
    const point = trend[index]
    if (point?.activeActors || point?.invocations)
      return point
  }
  return trend.at(-1) ?? null
})

const invocationHealth = computed(() => props.analytics?.invocationHealth ?? null)
const latestInvocationTrendPoint = computed(() => {
  const trend = invocationHealth.value?.trend ?? []
  for (let index = trend.length - 1; index >= 0; index -= 1) {
    const point = trend[index]
    if (point?.total)
      return point
  }
  return trend.at(-1) ?? null
})
const invocationHealthItems = computed(() => {
  const health = invocationHealth.value
  return [
    {
      key: 'total',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.total'),
      value: formatMetricValue(health?.total),
    },
    {
      key: 'uniqueActors',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.uniqueActors'),
      value: formatMetricValue(health?.uniqueActors),
    },
    {
      key: 'successRate',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.successRate'),
      value: formatPercent(health?.successRate),
    },
    {
      key: 'failureRate',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.failureRate'),
      value: formatPercent(health?.failureRate),
    },
    {
      key: 'averageDuration',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.averageDuration'),
      value: formatDurationMs(health?.durationMs.average),
    },
  ]
})

const invocationContextBreakdowns = computed(() => {
  const health = invocationHealth.value
  return [
    {
      key: 'surfaces',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.surfaces'),
      items: health?.bySurface ?? [],
    },
    {
      key: 'countries',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.countries'),
      items: health?.byCountry ?? [],
    },
    {
      key: 'regions',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.regions'),
      items: health?.byRegion ?? [],
    },
    {
      key: 'channels',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.channels'),
      items: health?.byChannel ?? [],
    },
    {
      key: 'versions',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.versions'),
      items: health?.byVersion ?? [],
    },
    {
      key: 'localTimeSlots',
      title: t('dashboard.sections.plugins.analytics.invocationHealth.localTimeSlots'),
      items: health?.byLocalTimeSlot ?? [],
    },
  ]
})
const invocationStatusItems = computed(() => {
  const health = invocationHealth.value
  return [
    {
      key: 'successful',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.successful'),
      value: health?.successful ?? 0,
    },
    {
      key: 'failed',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.failed'),
      value: health?.failed ?? 0,
    },
    {
      key: 'skipped',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.skipped'),
      value: health?.skipped ?? 0,
    },
    {
      key: 'unknown',
      label: t('dashboard.sections.plugins.analytics.invocationHealth.unknown'),
      value: health?.unknown ?? 0,
    },
  ]
})

const recentActionTrend = computed(() => (props.analytics?.actionTrend ?? []).slice(-5).reverse())
const recentRetentionTrend = computed(() => (retentionAnalytics.value?.trend ?? []).slice(-5).reverse())
const recentUsageTimingTrend = computed(() => (usageTiming.value?.trend ?? []).slice(-5).reverse())
const recentLocationTrend = computed(() => (props.analytics?.locationTrend ?? []).slice(-5).reverse())
const recentChannelTrend = computed(() => (props.analytics?.channelTrend ?? []).slice(-5).reverse())
const recentVersionTrend = computed(() => (props.analytics?.versionTrend ?? []).slice(-5).reverse())

const analyticsTrendChart = computed(() => {
  const trend = props.analytics?.trend ?? []
  return {
    categories: trend.map(point => formatShortDate(point.date)),
    series: [
      {
        name: t('dashboard.sections.plugins.analytics.stats.downloads'),
        values: trend.map(point => point.downloads),
        color: '#2563eb',
      },
      {
        name: t('dashboard.sections.plugins.analytics.stats.installs'),
        values: trend.map(point => point.installs),
        color: '#16a34a',
      },
      {
        name: t('dashboard.sections.plugins.analytics.stats.invocations'),
        values: trend.map(point => point.invocations),
        color: '#f97316',
      },
    ],
  }
})

const conversionTrendChart = computed(() => {
  const trend = props.analytics?.conversionTrend ?? []
  return {
    categories: trend.map(point => formatShortDate(point.date)),
    series: [
      {
        name: t('dashboard.sections.plugins.analytics.conversion.installRate'),
        values: trend.map(point => point.installRate),
        color: '#2563eb',
      },
      {
        name: t('dashboard.sections.plugins.analytics.conversion.invocationRate'),
        values: trend.map(point => point.invocationRate),
        color: '#9333ea',
      },
    ],
  }
})

const retentionTrendChart = computed(() => {
  const trend = retentionAnalytics.value?.trend ?? []
  return {
    categories: trend.map(point => formatShortDate(point.date)),
    series: [
      {
        name: t('dashboard.sections.plugins.analytics.retention.returningActors'),
        values: trend.map(point => point.returningActors),
        color: '#16a34a',
      },
      {
        name: t('dashboard.sections.plugins.analytics.stats.invocations'),
        values: trend.map(point => point.invocations),
        color: '#2563eb',
      },
    ],
  }
})

const invocationHealthTrendChart = computed(() => {
  const trend = invocationHealth.value?.trend ?? []
  return {
    categories: trend.map(point => formatShortDate(point.date)),
    series: [
      {
        name: t('dashboard.sections.plugins.analytics.invocationHealth.successful'),
        values: trend.map(point => point.successful),
        type: 'bar' as const,
        stack: 'status',
        color: '#16a34a',
      },
      {
        name: t('dashboard.sections.plugins.analytics.invocationHealth.failed'),
        values: trend.map(point => point.failed),
        type: 'bar' as const,
        stack: 'status',
        color: '#dc2626',
      },
      {
        name: t('dashboard.sections.plugins.analytics.invocationHealth.skipped'),
        values: trend.map(point => point.skipped),
        type: 'bar' as const,
        stack: 'status',
        color: '#f59e0b',
      },
    ],
  }
})

const usageTimingHourChart = computed(() => ({
  categories: (usageTiming.value?.byHour ?? []).map(item => formatHourKey(item.key)),
  series: [
    {
      name: t('dashboard.sections.plugins.analytics.usageTiming.hours'),
      values: (usageTiming.value?.byHour ?? []).map(item => item.quantity),
      type: 'bar' as const,
      color: '#2563eb',
    },
  ],
}))

function createDimensionTrendChart(points: Array<{ date: string, items: DashboardPluginAnalyticsMetric[] }>) {
  const topKeys = Array.from(
    new Set(points.flatMap(point => point.items.slice(0, 3).map(item => item.key))),
  ).slice(0, 4)

  return {
    categories: points.map(point => formatShortDate(point.date)),
    series: topKeys.map((key, index) => ({
      name: formatMetricKey(key),
      values: points.map((point) => {
        return point.items.find(item => item.key === key)?.quantity ?? 0
      }),
      color: ['#2563eb', '#16a34a', '#f97316', '#9333ea'][index],
    })),
  }
}

const actionTrendChart = computed(() => createDimensionTrendChart(props.analytics?.actionTrend.map(point => ({
  date: point.date,
  items: point.actions,
})) ?? []))
const channelTrendChart = computed(() => createDimensionTrendChart(props.analytics?.channelTrend ?? []))
const versionTrendChart = computed(() => createDimensionTrendChart(props.analytics?.versionTrend ?? []))

const analyticsBreakdowns = computed(() => {
  const analytics = props.analytics
  return [
    {
      key: 'actions',
      title: t('dashboard.sections.plugins.analytics.breakdowns.actions'),
      items: analytics?.byAction ?? [],
    },
    {
      key: 'countries',
      title: t('dashboard.sections.plugins.analytics.breakdowns.countries'),
      items: analytics?.byCountry ?? [],
    },
    {
      key: 'regions',
      title: t('dashboard.sections.plugins.analytics.breakdowns.regions'),
      items: analytics?.byRegion ?? [],
    },
    {
      key: 'channels',
      title: t('dashboard.sections.plugins.analytics.breakdowns.channels'),
      items: analytics?.byChannel ?? [],
    },
    {
      key: 'versions',
      title: t('dashboard.sections.plugins.analytics.breakdowns.versions'),
      items: analytics?.byVersion ?? [],
    },
    {
      key: 'artifactTypes',
      title: t('dashboard.sections.plugins.analytics.breakdowns.artifactTypes'),
      items: analytics?.byArtifactType ?? [],
    },
  ]
})

const usageTimingBreakdowns = computed(() => [
  {
    key: 'hours',
    title: t('dashboard.sections.plugins.analytics.usageTiming.hours'),
    items: usageTiming.value?.byHour ?? [],
  },
  {
    key: 'weekdays',
    title: t('dashboard.sections.plugins.analytics.usageTiming.weekdays'),
    items: usageTiming.value?.byWeekday ?? [],
  },
  {
    key: 'timeSlots',
    title: t('dashboard.sections.plugins.analytics.usageTiming.timeSlots'),
    items: usageTiming.value?.byTimeSlot ?? [],
  },
])

const visibleModel = computed({
  get: () => props.isOpen,
  set: (nextVisible) => {
    if (!nextVisible)
      emit('close')
  },
})

function resolveStatusLabel(status?: string | null) {
  if (!status)
    return '—'
  if (status === 'draft' || status === 'pending' || status === 'approved' || status === 'rejected')
    return t(`dashboard.sections.plugins.statuses.${status}`)
  return status
}

function resolveTimelineActorLabel(actorRole: DashboardPluginTimelineEvent['actorRole']) {
  return t(`dashboard.sections.plugins.timelineActors.${actorRole}`)
}

function resolveTimelineVersionTag(event: DashboardPluginTimelineEvent) {
  const metaVersion = event.meta && typeof event.meta.version === 'string'
    ? event.meta.version
    : ''
  if (metaVersion)
    return metaVersion
  return ''
}

function resolveTimelineEventLabel(event: DashboardPluginTimelineEvent) {
  const from = resolveStatusLabel(event.fromStatus)
  const to = resolveStatusLabel(event.toStatus)
  const version = resolveTimelineVersionTag(event)

  switch (event.eventType) {
    case 'plugin.created':
      return t('dashboard.sections.plugins.timelineEvents.pluginCreated')
    case 'plugin.status.changed':
      return t('dashboard.sections.plugins.timelineEvents.pluginStatusChanged', { from, to })
    case 'version.created':
      return t('dashboard.sections.plugins.timelineEvents.versionCreated', { version: version || '-' })
    case 'version.status.changed':
      return t('dashboard.sections.plugins.timelineEvents.versionStatusChanged', {
        version: version || '-',
        from,
        to,
      })
    case 'version.reedited':
      return t('dashboard.sections.plugins.timelineEvents.versionReedited', { version: version || '-' })
    default:
      return event.eventType
  }
}

function isTrendPointActive(point: DashboardPluginAnalyticsTrendPoint) {
  return point.events > 0
    || point.downloads > 0
    || point.installs > 0
    || point.invocations > 0
    || point.uniqueActors > 0
}

function isConversionTrendPointActive(point: DashboardPluginAnalyticsConversionTrendPoint) {
  return point.downloads > 0
    || point.installs > 0
    || point.invocations > 0
    || point.uniqueActors > 0
}

function formatMetricValue(value?: number | null) {
  return formatNumber(value ?? 0)
}

function formatRating(value?: number | null) {
  if (!value)
    return '—'
  return value.toFixed(1)
}

function formatRatingShare(count: number) {
  const ratingCount = reviewAnalytics.value?.ratingCount ?? 0
  if (ratingCount <= 0)
    return '0%'
  return `${Math.round((count / ratingCount) * 100)}%`
}

function formatPercent(value?: number | null) {
  return `${Math.round((value ?? 0) * 100) / 100}%`
}

function formatDurationMs(value?: number | null) {
  return t('dashboard.sections.plugins.analytics.invocationHealth.durationValue', {
    duration: formatMetricValue(value),
  })
}

function formatMetricKey(key: string) {
  return key === 'unknown'
    ? t('dashboard.sections.plugins.analytics.unknown')
    : key
}

function formatHourKey(key: string) {
  if (key === 'unknown')
    return t('dashboard.sections.plugins.analytics.unknown')
  return t('dashboard.sections.plugins.analytics.usageTiming.hourValue', { hour: key })
}

function formatWeekdayKey(key: string) {
  if (key === 'unknown')
    return t('dashboard.sections.plugins.analytics.unknown')
  const day = Number(key)
  if (!Number.isFinite(day) || day < 0 || day > 6)
    return key
  return t(`dashboard.sections.plugins.analytics.usageTiming.weekdaysMap.${day}`)
}

function formatUsageTimingKey(group: string, key: string) {
  if (group === 'hours')
    return formatHourKey(key)
  if (group === 'weekdays')
    return formatWeekdayKey(key)
  return formatMetricKey(key)
}

function formatMetricMeta(metric: DashboardPluginAnalyticsMetric) {
  return t('dashboard.sections.plugins.analytics.metricMeta', {
    quantity: formatMetricValue(metric.quantity),
    actors: formatMetricValue(metric.uniqueActors),
    events: formatMetricValue(metric.events),
  })
}

function formatTrendMetricList(items: DashboardPluginAnalyticsMetric[]) {
  if (!items.length)
    return '—'
  return items
    .slice(0, 3)
    .map(item => `${formatMetricKey(item.key)} ${formatMetricValue(item.quantity)}`)
    .join(' · ')
}

function formatUsageTimingTrend(point: { hours: DashboardPluginAnalyticsMetric[], weekdays: DashboardPluginAnalyticsMetric[], timeSlots: DashboardPluginAnalyticsMetric[] }) {
  return t('dashboard.sections.plugins.analytics.usageTiming.trendMeta', {
    hours: formatTrendMetricList(point.hours),
    weekdays: point.weekdays.slice(0, 3).map(item => `${formatWeekdayKey(item.key)} ${formatMetricValue(item.quantity)}`).join(' · ') || '—',
    timeSlots: formatTrendMetricList(point.timeSlots),
  })
}

function formatTrendMeta(point: DashboardPluginAnalyticsTrendPoint) {
  return t('dashboard.sections.plugins.analytics.trendMeta', {
    downloads: formatMetricValue(point.downloads),
    installs: formatMetricValue(point.installs),
    invocations: formatMetricValue(point.invocations),
    actors: formatMetricValue(point.uniqueActors),
  })
}

function formatConversionTrendMeta(point: DashboardPluginAnalyticsConversionTrendPoint) {
  return t('dashboard.sections.plugins.analytics.conversion.trendMeta', {
    date: formatDate(point.date),
    installRate: formatPercent(point.installRate),
    invocationRate: formatPercent(point.invocationRate),
    invocationsPerActor: formatMetricValue(point.invocationsPerActor),
  })
}

function formatRetentionTrendMeta(point: DashboardPluginRetentionTrendPoint) {
  return t('dashboard.sections.plugins.analytics.retention.trendMeta', {
    date: formatDate(point.date),
    activeActors: formatMetricValue(point.activeActors),
    returningActors: formatMetricValue(point.returningActors),
    invocationActors: formatMetricValue(point.invocationActors),
    invocations: formatMetricValue(point.invocations),
    retentionRate: formatPercent(point.retentionRate),
  })
}

function formatReviewTrendMeta(point: DashboardPluginReviewStatusTrendPoint) {
  return t('dashboard.sections.plugins.analytics.reviews.trendMeta', {
    date: formatDate(point.date),
    approved: formatMetricValue(point.approved),
    pending: formatMetricValue(point.pending),
    rejected: formatMetricValue(point.rejected),
  })
}

function formatReviewRatingTrendMeta(point: DashboardPluginReviewRatingTrendPoint) {
  return t('dashboard.sections.plugins.analytics.reviews.ratingTrendMeta', {
    date: formatDate(point.date),
    averageRating: formatRating(point.averageRating),
    ratingCount: formatMetricValue(point.ratingCount),
    lowRatingRate: formatPercent(point.lowRatingRate),
  })
}

function formatReviewCommentQualityLabel(key: DashboardPluginReviewCommentQualityBucket['key']) {
  return t(`dashboard.sections.plugins.analytics.reviews.commentQualityBuckets.${key}`)
}

function formatReviewCommentQualityMeta(item: DashboardPluginReviewCommentQualityBucket) {
  return t('dashboard.sections.plugins.analytics.reviews.commentQualityMeta', {
    averageLength: formatMetricValue(item.averageContentLength),
    lowRatingRate: formatPercent(item.lowRatingRate),
    titleCoverageRate: formatPercent(item.titleCoverageRate),
    contentCoverageRate: formatPercent(item.contentCoverageRate),
  })
}

function formatHours(value?: number | null) {
  return t('dashboard.sections.plugins.analytics.reviews.moderationTiming.hoursValue', {
    hours: formatMetricValue(value),
  })
}

function formatReviewModerationTimingBucketLabel(key: DashboardPluginReviewModerationTimingBucket['key']) {
  return t(`dashboard.sections.plugins.analytics.reviews.moderationTiming.buckets.${key}`)
}

function formatReviewModerationTimingBucketMeta(item: DashboardPluginReviewModerationTimingBucket) {
  return t('dashboard.sections.plugins.analytics.reviews.moderationTiming.bucketMeta', {
    averageHours: formatHours(item.averageHours),
    maxHours: formatHours(item.maxHours),
  })
}

function formatReviewActionQueuePriority(priority: DashboardPluginReviewActionQueueItem['priority']) {
  return t(`dashboard.sections.plugins.analytics.reviews.actionQueue.priorities.${priority}`)
}

function formatReviewActionQueueSuggestedAction(action: DashboardPluginReviewActionQueueItem['suggestedAction']) {
  return t(`dashboard.sections.plugins.analytics.reviews.actionQueue.suggestedActions.${action}`)
}

function formatReviewActionQueueReason(reason: DashboardPluginReviewActionQueueItem['reason']) {
  return t(`dashboard.sections.plugins.analytics.reviews.actionQueue.reasons.${reason}`)
}

function formatReviewActionQueueMeta(item: DashboardPluginReviewActionQueueItem) {
  return t('dashboard.sections.plugins.analytics.reviews.actionQueue.itemMeta', {
    pending: formatMetricValue(item.pending),
    rejected: formatMetricValue(item.rejected),
    lowRatingRate: formatPercent(item.lowRatingRate),
    contentCoverageRate: formatPercent(item.contentCoverageRate),
    date: formatDate(item.latestDate),
  })
}

function formatOwnerActionQueuePriority(priority: DashboardPluginOwnerActionQueueItem['priority']) {
  return t(`dashboard.sections.plugins.analytics.actionQueue.priorities.${priority}`)
}

function formatOwnerActionQueueSuggestedAction(action: DashboardPluginOwnerActionQueueItem['suggestedAction']) {
  return t(`dashboard.sections.plugins.analytics.actionQueue.suggestedActions.${action}`)
}

function formatOwnerActionQueueReason(reason: DashboardPluginOwnerActionQueueItem['reason']) {
  return t(`dashboard.sections.plugins.analytics.actionQueue.reasons.${reason}`)
}

function formatOwnerActionQueueMeta(item: DashboardPluginOwnerActionQueueItem) {
  return t('dashboard.sections.plugins.analytics.actionQueue.itemMeta', {
    downloads: formatMetricValue(item.downloads),
    installs: formatMetricValue(item.installs),
    invocations: formatMetricValue(item.invocations),
    installRate: formatPercent(item.installRate),
    invocationRate: formatPercent(item.invocationRate),
    failureRate: formatPercent(item.failureRate),
    retentionRate: formatPercent(item.retentionRate),
    topCountry: item.topCountryKey ? formatMetricKey(item.topCountryKey) : '—',
    topCountryShare: formatPercent(item.topCountryShare),
    date: formatDate(item.latestDate),
  })
}

function formatInvocationTrendMeta(point: DashboardPluginInvocationHealthTrendPoint) {
  return t('dashboard.sections.plugins.analytics.invocationHealth.trendMeta', {
    date: formatDate(point.date),
    total: formatMetricValue(point.total),
    actors: formatMetricValue(point.uniqueActors),
    successRate: formatPercent(point.successRate),
    failureRate: formatPercent(point.failureRate),
    averageDuration: formatDurationMs(point.durationMs.average),
  })
}

</script>

<template>
  <FlipDialog
      v-model="visibleModel"
      :reference="source ?? null"
      size="lg"
    >
      <template #header-display>
        <div v-if="plugin" class="PluginDetailOverlay-CustomHeader">
          <PluginMetaHeader
            class="min-w-0 flex-1"
            :plugin="plugin"
            :category-label="categoryLabel"
          />
        </div>
        <div v-else class="PluginDetailOverlay-CustomHeader PluginDetailOverlay-CustomHeader--empty" />
      </template>
      <template #default>
        <div v-if="plugin" class="flex h-[min(86dvh,820px)] w-[min(960px,92vw)] flex-col">
          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-6 pb-2 pt-3">
            <!-- Summary -->
            <div class="border-b border-black/5 pb-4 dark:border-white/5">
              <p class="text-sm text-black/70 dark:text-white/70">
                {{ plugin.summary }}
              </p>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-1 gap-3 border-b border-black/[0.04] py-5 md:grid-cols-3 dark:border-white/[0.06]">
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.category') }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ categoryLabel || plugin.category }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.installs', { count: '' }).replace('{count}', '').trim() || 'Installs' }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ formatNumber(plugin.installs) }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.created') }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ formatDate(plugin.createdAt) }}
                </p>
              </div>
            </div>

            <!-- Analytics -->
            <div v-if="canViewAnalytics" class="border-b border-black/[0.04] py-5 dark:border-white/[0.06]">
              <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.analytics.title') }}
                  </p>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.sections.plugins.analytics.period', { days: analytics?.days ?? 30 }) }}
                  </p>
                </div>
                <p v-if="analytics?.packageSize.count" class="text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.plugins.analytics.averagePackageSize', { size: formatSize(analytics.packageSize.average) }) }}
                </p>
              </div>

              <div v-if="analyticsLoading" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                <span class="i-carbon-circle-dash animate-spin" />
                {{ t('dashboard.sections.plugins.analytics.loading') }}
              </div>
              <p v-else-if="analyticsError" class="text-xs text-rose-600 dark:text-rose-300">
                {{ analyticsError }}
              </p>
              <p v-else-if="!analyticsHasData" class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.analytics.empty') }}
              </p>
              <div v-else class="space-y-4">
                <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <div
                    v-for="item in analyticsStats"
                    :key="item.key"
                    class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]"
                  >
                    <div class="flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
                      <span :class="item.icon" />
                      <span>{{ item.label }}</span>
                    </div>
                    <p class="mt-2 text-xl font-semibold text-black dark:text-white">
                      {{ item.value }}
                    </p>
                  </div>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <DashboardMetricChart
                    :title="t('dashboard.sections.plugins.analytics.activityTrend')"
                    :categories="analyticsTrendChart.categories"
                    :series="analyticsTrendChart.series"
                    :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                    :aria-label="t('dashboard.sections.plugins.analytics.activityTrend')"
                  />
                </div>

                <div v-if="ownerActionQueue.length" class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.actionQueue.title') }}
                    </p>
                    <span class="text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.actionQueue.count', { count: formatMetricValue(ownerActionQueue.length) }) }}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2">
                    <div
                      v-for="item in ownerActionQueue.slice(0, 4)"
                      :key="`owner-action:${item.key}`"
                      class="rounded-lg border border-black/[0.05] bg-black/[0.02] p-3 text-xs dark:border-white/[0.06] dark:bg-white/[0.03]"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="font-medium text-black/70 dark:text-white/70">
                          {{ formatOwnerActionQueueSuggestedAction(item.suggestedAction) }}
                        </p>
                        <TxStatusBadge
                          :text="formatOwnerActionQueuePriority(item.priority)"
                          :status="ownerActionQueuePriorityTone(item.priority)"
                          size="sm"
                        />
                      </div>
                      <p class="mt-1 text-black/45 dark:text-white/45">
                        {{ formatOwnerActionQueueReason(item.reason) }}
                      </p>
                      <p class="mt-2 text-black/45 dark:text-white/45">
                        {{ formatOwnerActionQueueMeta(item) }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="apple-section-title">
                        {{ t('dashboard.sections.plugins.analytics.reviews.title') }}
                      </p>
                      <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                        {{ formatRating(reviewAnalytics?.averageRating) }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ t('dashboard.sections.plugins.analytics.reviews.averageMeta', { count: formatMetricValue(reviewAnalytics?.ratingCount) }) }}
                      </p>
                    </div>
                    <p v-if="reviewAnalytics?.latestAt" class="text-xs text-black/45 dark:text-white/45">
                      {{ t('dashboard.sections.plugins.analytics.reviews.latest', { date: formatDate(reviewAnalytics.latestAt) }) }}
                    </p>
                  </div>
                  <div class="mt-4 grid grid-cols-3 gap-2">
                    <div
                      v-for="item in reviewStatusItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ formatMetricValue(item.value) }}
                      </p>
                    </div>
                  </div>
                  <div v-if="reviewActionQueue.length" class="mt-4 grid gap-2 rounded-lg bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03]">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="font-medium text-black/65 dark:text-white/65">
                        {{ t('dashboard.sections.plugins.analytics.reviews.actionQueue.title') }}
                      </p>
                      <span class="text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.reviews.actionQueue.count', { count: formatMetricValue(reviewActionQueue.length) }) }}
                      </span>
                    </div>
                    <div
                      v-for="item in reviewActionQueue.slice(0, 4)"
                      :key="`review-action:${item.key}`"
                      class="rounded-lg border border-black/[0.05] p-2 dark:border-white/[0.06]"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="font-medium text-black/70 dark:text-white/70">
                          {{ formatReviewActionQueueSuggestedAction(item.suggestedAction) }}
                        </p>
                        <TxStatusBadge
                          :text="formatReviewActionQueuePriority(item.priority)"
                          :status="reviewActionQueuePriorityTone(item.priority)"
                          size="sm"
                        />
                      </div>
                      <p class="mt-1 text-black/45 dark:text-white/45">
                        {{ formatReviewActionQueueReason(item.reason) }}
                      </p>
                      <p class="mt-2 text-black/45 dark:text-white/45">
                        {{ formatReviewActionQueueMeta(item) }}
                      </p>
                    </div>
                  </div>
                  <div v-if="reviewAnalytics?.ratingCount" class="mt-4 space-y-2">
                    <div
                      v-for="bucket in reviewAnalytics.ratingDistribution"
                      :key="bucket.rating"
                      class="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 text-xs"
                    >
                      <span class="text-black/55 dark:text-white/55">
                        {{ bucket.rating }}★
                      </span>
                      <span class="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                        <span
                          class="block h-full rounded-full bg-amber-400"
                          :style="{ width: formatRatingShare(bucket.count) }"
                        />
                      </span>
                      <span class="text-right text-black/45 dark:text-white/45">
                        {{ formatMetricValue(bucket.count) }}
                      </span>
                    </div>
                  </div>
                  <p v-else class="mt-4 text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.analytics.reviews.noRatings') }}
                  </p>
                  <p v-if="latestReviewTrendPoint" class="mt-4 text-xs text-black/45 dark:text-white/45">
                    {{ formatReviewTrendMeta(latestReviewTrendPoint) }}
                  </p>
                  <div v-if="latestReviewRatingTrendPoint" class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]">
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ t('dashboard.sections.plugins.analytics.reviews.ratingTrend') }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ formatRating(latestReviewRatingTrendPoint.averageRating) }}
                      </p>
                    </div>
                    <div class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]">
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ t('dashboard.sections.plugins.analytics.reviews.lowRatingRate') }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ formatPercent(latestReviewRatingTrendPoint.lowRatingRate) }}
                      </p>
                    </div>
                    <div class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]">
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ t('dashboard.sections.plugins.analytics.reviews.ratingTrendCount') }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ formatMetricValue(latestReviewRatingTrendPoint.ratingCount) }}
                      </p>
                    </div>
                  </div>
                  <p v-if="latestReviewRatingTrendPoint" class="mt-3 text-xs text-black/45 dark:text-white/45">
                    {{ formatReviewRatingTrendMeta(latestReviewRatingTrendPoint) }}
                  </p>
                  <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div
                      v-for="item in reviewCommentItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ item.value }}
                      </p>
                    </div>
                  </div>
                  <p v-if="reviewCommentTrendMeta" class="mt-3 text-xs text-black/45 dark:text-white/45">
                    {{ reviewCommentTrendMeta }}
                  </p>
                  <div v-if="reviewCommentQualityBuckets.length" class="mt-4">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.reviews.commentQuality') }}
                    </p>
                    <div class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div
                        v-for="item in reviewCommentQualityBuckets"
                        :key="item.key"
                        class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <p class="text-xs font-semibold text-black dark:text-white">
                            {{ formatReviewCommentQualityLabel(item.key) }}
                          </p>
                          <span class="text-xs text-black/45 dark:text-white/45">
                            {{ formatMetricValue(item.total) }}
                          </span>
                        </div>
                        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                          {{ formatReviewCommentQualityMeta(item) }}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div v-if="reviewModerationTimingItems.length" class="mt-4">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.reviews.moderationTiming.title') }}
                    </p>
                    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div
                        v-for="item in reviewModerationTimingItems"
                        :key="`moderation-timing-${item.key}`"
                        class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                      >
                        <p class="text-[11px] text-black/45 dark:text-white/45">
                          {{ item.label }}
                        </p>
                        <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                          {{ formatHours(item.averageHours) }}
                        </p>
                        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                          {{ t('dashboard.sections.plugins.analytics.reviews.moderationTiming.summaryMeta', {
                            total: formatMetricValue(item.total),
                            maxHours: formatHours(item.maxHours),
                          }) }}
                        </p>
                      </div>
                    </div>
                    <div v-if="reviewModerationTimingBuckets.length" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div
                        v-for="item in reviewModerationTimingBuckets"
                        :key="`moderation-bucket-${item.key}-${item.pending}-${item.approved}-${item.rejected}`"
                        class="rounded-lg border border-black/[0.05] px-3 py-2 text-xs dark:border-white/[0.06]"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <p class="font-medium text-black/65 dark:text-white/65">
                            {{ formatReviewModerationTimingBucketLabel(item.key) }}
                          </p>
                          <span class="text-black/45 dark:text-white/45">
                            {{ formatMetricValue(item.total) }}
                          </span>
                        </div>
                        <p class="mt-1 text-black/45 dark:text-white/45">
                          {{ formatReviewModerationTimingBucketMeta(item) }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.latestDay') }}
                    </p>
                    <template v-if="latestTrendPoint">
                      <p class="mt-2 text-sm font-semibold text-black dark:text-white">
                        {{ formatDate(latestTrendPoint.date) }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ formatTrendMeta(latestTrendPoint) }}
                      </p>
                    </template>
                    <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.peakDay') }}
                    </p>
                    <template v-if="peakTrendPoint">
                      <p class="mt-2 text-sm font-semibold text-black dark:text-white">
                        {{ formatDate(peakTrendPoint.date) }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ formatTrendMeta(peakTrendPoint) }}
                      </p>
                    </template>
                    <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p class="apple-section-title">
                    {{ t('dashboard.sections.plugins.analytics.conversion.title') }}
                  </p>
                  <div class="mt-3">
                    <DashboardMetricChart
                      :categories="conversionTrendChart.categories"
                      :series="conversionTrendChart.series"
                      :height="180"
                      :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                      :aria-label="t('dashboard.sections.plugins.analytics.conversion.title')"
                    />
                  </div>
                  <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div
                      v-for="item in analyticsConversionItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ item.value }}
                      </p>
                    </div>
                  </div>
                  <p v-if="latestConversionTrendPoint" class="mt-3 text-xs text-black/45 dark:text-white/45">
                    {{ formatConversionTrendMeta(latestConversionTrendPoint) }}
                  </p>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="apple-section-title">
                        {{ t('dashboard.sections.plugins.analytics.retention.title') }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ t('dashboard.sections.plugins.analytics.retention.summary', {
                          activeActors: formatMetricValue(retentionAnalytics?.activeActors),
                          newActors: formatMetricValue(retentionAnalytics?.newActors),
                        }) }}
                      </p>
                    </div>
                    <p v-if="latestRetentionTrendPoint" class="text-xs text-black/45 dark:text-white/45">
                      {{ formatRetentionTrendMeta(latestRetentionTrendPoint) }}
                    </p>
                  </div>
                  <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <div
                      v-for="item in retentionItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ item.value }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4">
                    <DashboardMetricChart
                      :categories="retentionTrendChart.categories"
                      :series="retentionTrendChart.series"
                      :height="190"
                      :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                      :aria-label="t('dashboard.sections.plugins.analytics.retention.trend')"
                    />
                  </div>
                  <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                        {{ t('dashboard.sections.plugins.analytics.retention.activeDays') }}
                      </p>
                      <div v-if="retentionAnalytics?.byActiveDays.length" class="mt-2 space-y-2">
                        <div
                          v-for="metric in retentionAnalytics.byActiveDays.slice(0, 4)"
                          :key="`retention-active-days-${metric.key}`"
                          class="flex items-center justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 truncate text-black/70 dark:text-white/70">
                            {{ t('dashboard.sections.plugins.analytics.retention.activeDaysBucket', { bucket: formatMetricKey(metric.key) }) }}
                          </span>
                          <span class="shrink-0 text-right text-black/45 dark:text-white/45">
                            {{ formatMetricMeta(metric) }}
                          </span>
                        </div>
                      </div>
                      <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.noBreakdown') }}
                      </p>
                    </div>
                    <div>
                      <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                        {{ t('dashboard.sections.plugins.analytics.retention.trend') }}
                      </p>
                      <div v-if="recentRetentionTrend.length" class="mt-2 space-y-2">
                        <div
                          v-for="point in recentRetentionTrend"
                          :key="`retention-trend-${point.date}`"
                          class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                        >
                          <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                          <span class="truncate text-black/70 dark:text-white/70">
                            {{ t('dashboard.sections.plugins.analytics.retention.shortTrendMeta', {
                              activeActors: formatMetricValue(point.activeActors),
                              returningActors: formatMetricValue(point.returningActors),
                              retentionRate: formatPercent(point.retentionRate),
                            }) }}
                          </span>
                        </div>
                      </div>
                      <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="apple-section-title">
                        {{ t('dashboard.sections.plugins.analytics.usageTiming.title') }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ t('dashboard.sections.plugins.analytics.usageTiming.summary') }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div class="md:col-span-3">
                      <DashboardMetricChart
                        :categories="usageTimingHourChart.categories"
                        :series="usageTimingHourChart.series"
                        :height="170"
                        :empty-text="t('dashboard.sections.plugins.analytics.noBreakdown')"
                        :aria-label="t('dashboard.sections.plugins.analytics.usageTiming.hours')"
                      />
                    </div>
                    <div
                      v-for="breakdown in usageTimingBreakdowns"
                      :key="`usage-timing-${breakdown.key}`"
                    >
                      <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                        {{ breakdown.title }}
                      </p>
                      <div v-if="breakdown.items.length" class="mt-2 space-y-2">
                        <div
                          v-for="metric in breakdown.items.slice(0, 5)"
                          :key="`usage-timing-${breakdown.key}-${metric.key}`"
                          class="flex items-center justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 truncate text-black/70 dark:text-white/70">
                            {{ formatUsageTimingKey(breakdown.key, metric.key) }}
                          </span>
                          <span class="shrink-0 text-right text-black/45 dark:text-white/45">
                            {{ formatMetricMeta(metric) }}
                          </span>
                        </div>
                      </div>
                      <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.noBreakdown') }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                      {{ t('dashboard.sections.plugins.analytics.usageTiming.trend') }}
                    </p>
                    <div v-if="recentUsageTimingTrend.length" class="mt-2 space-y-2">
                      <div
                        v-for="point in recentUsageTimingTrend"
                        :key="`usage-timing-trend-${point.date}`"
                        class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                        <span class="truncate text-black/70 dark:text-white/70">
                          {{ formatUsageTimingTrend(point) }}
                        </span>
                      </div>
                    </div>
                    <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                </div>

                <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="apple-section-title">
                        {{ t('dashboard.sections.plugins.analytics.invocationHealth.title') }}
                      </p>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ t('dashboard.sections.plugins.analytics.invocationHealth.durationMeta', {
                          maxDuration: formatDurationMs(invocationHealth?.durationMs.max),
                        }) }}
                      </p>
                    </div>
                    <p v-if="latestInvocationTrendPoint" class="text-xs text-black/45 dark:text-white/45">
                      {{ formatInvocationTrendMeta(latestInvocationTrendPoint) }}
                    </p>
                  </div>
                  <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <div
                      v-for="item in invocationHealthItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ item.value }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div
                      v-for="item in invocationStatusItems"
                      :key="item.key"
                      class="rounded-lg bg-black/[0.02] px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <p class="text-[11px] text-black/45 dark:text-white/45">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-sm font-semibold text-black dark:text-white">
                        {{ formatMetricValue(item.value) }}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4">
                    <DashboardMetricChart
                      :categories="invocationHealthTrendChart.categories"
                      :series="invocationHealthTrendChart.series"
                      :height="190"
                      :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                      :aria-label="t('dashboard.sections.plugins.analytics.invocationHealth.title')"
                    />
                  </div>
                  <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                        {{ t('dashboard.sections.plugins.analytics.invocationHealth.failureReasons') }}
                      </p>
                      <div v-if="invocationHealth?.byFailureReason.length" class="mt-2 space-y-2">
                        <div
                          v-for="metric in invocationHealth.byFailureReason.slice(0, 4)"
                          :key="`failure-${metric.key}`"
                          class="flex items-center justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 truncate text-black/70 dark:text-white/70">
                            {{ formatMetricKey(metric.key) }}
                          </span>
                          <span class="shrink-0 text-right text-black/45 dark:text-white/45">
                            {{ formatMetricMeta(metric) }}
                          </span>
                        </div>
                      </div>
                      <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.noBreakdown') }}
                      </p>
                    </div>
                    <div
                      v-for="breakdown in invocationContextBreakdowns"
                      :key="breakdown.key"
                    >
                      <p class="text-[11px] font-medium uppercase tracking-wide text-black/35 dark:text-white/35">
                        {{ breakdown.title }}
                      </p>
                      <div v-if="breakdown.items.length" class="mt-2 space-y-2">
                        <div
                          v-for="metric in breakdown.items.slice(0, 4)"
                          :key="`invocation-${breakdown.key}-${metric.key}`"
                          class="flex items-center justify-between gap-3 text-xs"
                        >
                          <span class="min-w-0 truncate text-black/70 dark:text-white/70">
                            {{ formatMetricKey(metric.key) }}
                          </span>
                          <span class="shrink-0 text-right text-black/45 dark:text-white/45">
                            {{ formatMetricMeta(metric) }}
                          </span>
                        </div>
                      </div>
                      <p v-else class="mt-2 text-xs text-black/40 dark:text-white/40">
                        {{ t('dashboard.sections.plugins.analytics.noBreakdown') }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.actionTrend.title', 'Action trend') }}
                    </p>
                    <div class="mt-3">
                      <DashboardMetricChart
                        :categories="actionTrendChart.categories"
                        :series="actionTrendChart.series"
                        :height="170"
                        :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                        :aria-label="t('dashboard.sections.plugins.analytics.actionTrend.title', 'Action trend')"
                      />
                    </div>
                    <div v-if="recentActionTrend.length" class="mt-3 space-y-2">
                      <div
                        v-for="point in recentActionTrend"
                        :key="`action-trend-${point.date}`"
                        class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                        <span class="truncate text-black/70 dark:text-white/70">{{ formatTrendMetricList(point.actions) }}</span>
                      </div>
                    </div>
                    <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.locationTrend.title', 'Location trend') }}
                    </p>
                    <div v-if="recentLocationTrend.length" class="mt-3 space-y-2">
                      <div
                        v-for="point in recentLocationTrend"
                        :key="`location-trend-${point.date}`"
                        class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                        <span class="truncate text-black/70 dark:text-white/70">
                          {{ formatTrendMetricList(point.countries) }} · {{ formatTrendMetricList(point.regions) }}
                        </span>
                      </div>
                    </div>
                    <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.channelTrend.title', 'Channel trend') }}
                    </p>
                    <div class="mt-3">
                      <DashboardMetricChart
                        :categories="channelTrendChart.categories"
                        :series="channelTrendChart.series"
                        :height="170"
                        :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                        :aria-label="t('dashboard.sections.plugins.analytics.channelTrend.title', 'Channel trend')"
                      />
                    </div>
                    <div v-if="recentChannelTrend.length" class="mt-3 space-y-2">
                      <div
                        v-for="point in recentChannelTrend"
                        :key="`channel-trend-${point.date}`"
                        class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                        <span class="truncate text-black/70 dark:text-white/70">{{ formatTrendMetricList(point.items) }}</span>
                      </div>
                    </div>
                    <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                  <div class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <p class="apple-section-title">
                      {{ t('dashboard.sections.plugins.analytics.versionTrend.title', 'Version trend') }}
                    </p>
                    <div class="mt-3">
                      <DashboardMetricChart
                        :categories="versionTrendChart.categories"
                        :series="versionTrendChart.series"
                        :height="170"
                        :empty-text="t('dashboard.sections.plugins.analytics.noTrend')"
                        :aria-label="t('dashboard.sections.plugins.analytics.versionTrend.title', 'Version trend')"
                      />
                    </div>
                    <div v-if="recentVersionTrend.length" class="mt-3 space-y-2">
                      <div
                        v-for="point in recentVersionTrend"
                        :key="`version-trend-${point.date}`"
                        class="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <span class="text-black/45 dark:text-white/45">{{ formatDate(point.date) }}</span>
                        <span class="truncate text-black/70 dark:text-white/70">{{ formatTrendMetricList(point.items) }}</span>
                      </div>
                    </div>
                    <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noTrend') }}
                    </p>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div
                    v-for="group in analyticsBreakdowns"
                    :key="group.key"
                    class="rounded-xl border border-black/[0.04] bg-black/[0.015] p-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
                  >
                    <p class="apple-section-title">
                      {{ group.title }}
                    </p>
                    <div v-if="group.items.length" class="mt-3 space-y-2">
                      <div
                        v-for="metric in group.items.slice(0, 4)"
                        :key="`${group.key}-${metric.key}`"
                        class="flex items-center justify-between gap-3 text-xs"
                      >
                        <span class="min-w-0 truncate text-black/70 dark:text-white/70">
                          {{ formatMetricKey(metric.key) }}
                        </span>
                        <span class="shrink-0 text-right text-black/45 dark:text-white/45">
                          {{ formatMetricMeta(metric) }}
                        </span>
                      </div>
                    </div>
                    <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.analytics.noBreakdown') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Links -->
            <div v-if="plugin.homepage" class="border-b border-black/5 py-4 dark:border-white/5">
              <a
                :href="plugin.homepage"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 text-sm text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white"
              >
                <span class="i-carbon-logo-github" />
                {{ t('dashboard.sections.plugins.homepage') }}
                <span class="i-carbon-arrow-up-right text-xs" />
              </a>
            </div>

            <!-- Badges -->
            <div v-if="plugin.badges.length" class="border-b border-black/5 py-4 dark:border-white/5">
              <p class="mb-3 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.form.badges') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <TxTag v-for="badge in plugin.badges" :key="badge" :label="badge" />
              </div>
            </div>

            <!-- Versions -->
            <div class="py-4">
              <div class="mb-4 flex items-center justify-between">
                <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.plugins.versionHistory') }}
                </p>
                <TxButton v-if="canPublishVersion" type="primary" size="small" @click="emit('publishVersion', plugin)">
                  <span class="i-carbon-cloud-upload text-sm" />
                  {{ t('dashboard.sections.plugins.publishVersion') }}
                </TxButton>
              </div>

              <div v-if="plugin.versions?.length" class="space-y-3">
                <div
                  v-for="version in plugin.versions"
                  :key="version.id"
                  class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-5 transition-all duration-200 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-black dark:text-white">
                          v{{ version.version }}
                        </span>
                        <TxStatusBadge
                          :text="version.channel"
                          :status="channelTone(version.channel)"
                          size="sm"
                        />
                        <TxStatusBadge
                          :text="t(`dashboard.sections.plugins.versionStatuses.${version.status}`)"
                          :status="versionStatusTone(version.status)"
                          size="sm"
                        />
                      </div>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ formatDate(version.createdAt) }} · {{ formatSize(version.packageSize) }}
                      </p>
                      <p v-if="version.changelog" class="mt-2 text-xs text-black/60 dark:text-white/60">
                        {{ version.changelog }}
                      </p>
                      <p v-if="version.status === 'rejected' && version.rejectReason" class="mt-1 text-xs text-rose-600 dark:text-rose-300">
                        {{ t('dashboard.sections.plugins.rejectedReason') }}: {{ version.rejectReason }}
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <a
                        :href="version.packageUrl"
                        target="_blank"
                        rel="noopener"
                        class="flex size-7 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                        :title="t('dashboard.sections.plugins.downloadPackage')"
                      >
                        <span class="i-carbon-download text-sm" />
                      </a>
                      <TxButton
                        v-if="canEdit && version.status === 'rejected'"
                        variant="secondary"
                        size="mini"
                        :title="t('dashboard.sections.plugins.reeditVersion')"
                        @click="emit('reeditVersion', plugin, version)"
                      >
                        <span class="i-carbon-edit text-sm" />
                      </TxButton>
                      <TxButton
                        v-if="canDelete"
                        variant="secondary"
                        size="mini"
                        @click="emit('deleteVersion', plugin, version)"
                      >
                        <span class="i-carbon-trash-can text-sm" />
                      </TxButton>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-center text-sm text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.noVersions') }}
              </p>
            </div>

            <div v-if="canViewTimeline" class="border-t border-black/[0.04] py-4 dark:border-white/[0.06]">
              <p class="mb-3 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.timelineTitle') }}
              </p>

              <div v-if="timelineLoading" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                <span class="i-carbon-circle-dash animate-spin" />
                {{ t('dashboard.sections.plugins.timelineLoading') }}
              </div>
              <p v-else-if="timelineError" class="text-xs text-rose-600 dark:text-rose-300">
                {{ timelineError }}
              </p>
              <div v-else-if="timeline?.length" class="space-y-2">
                <div
                  v-for="item in timeline"
                  :key="item.id"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <p class="text-xs text-black/70 dark:text-white/70">
                    {{ resolveTimelineEventLabel(item) }}
                  </p>
                  <p class="mt-1 text-[11px] text-black/45 dark:text-white/45">
                    {{ formatDate(item.createdAt) }} · {{ resolveTimelineActorLabel(item.actorRole) }}
                  </p>
                  <p v-if="item.reason" class="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
                    {{ t('dashboard.sections.plugins.rejectReason') }}: {{ item.reason }}
                  </p>
                </div>
              </div>
              <p v-else class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.timelineEmpty') }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/[0.04] px-6 py-4 dark:border-white/[0.06]">
            <TxButton v-if="canSubmitReview" size="small" :disabled="loading" @click="emit('submitReview', plugin)">
              <span class="i-carbon-send text-sm" />
              {{ t('dashboard.sections.plugins.actions.submitReview') }}
            </TxButton>
            <TxButton v-if="canWithdrawReview" size="small" :disabled="loading" @click="emit('withdrawReview', plugin)">
              <span class="i-carbon-undo text-sm" />
              {{ t('dashboard.sections.plugins.actions.withdrawReview') }}
            </TxButton>
            <TxButton v-if="canEdit" size="small" @click="emit('edit', plugin, $event)">
              <span class="i-carbon-edit text-sm" />
              {{ t('dashboard.sections.plugins.editMetadata') }}
            </TxButton>
            <TxButton v-if="canDelete" type="danger" size="small" @click="emit('delete', plugin)">
              <span class="i-carbon-trash-can text-sm" />
              {{ t('dashboard.sections.plugins.delete') }}
            </TxButton>
          </div>
        </div>
      </template>
    </FlipDialog>
</template>

<style scoped>
.PluginDetailOverlay-CustomHeader {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.24)) 100%, transparent);
}

.PluginDetailOverlay-CustomHeader--empty {
  justify-content: flex-end;
}
</style>
