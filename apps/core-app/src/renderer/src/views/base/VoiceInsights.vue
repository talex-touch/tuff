<script setup lang="ts" name="VoiceInsights">
import type { VoiceInsights } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { CSSProperties } from 'vue'
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const DAY_MS = 24 * 60 * 60 * 1000
const INSIGHT_DAY_COUNT = 365

/** How many weeks the compact activity strip shows; the heatmap below still covers the year. */
const WEEKLY_BAR_COUNT = 12

/**
 * The ambient character field behind the empty state.
 *
 * Ornament, not a reading: there is no data here yet, and anything that looked like a waveform
 * would be drawing one out of nothing. Glyphs drifting past cannot be mistaken for a measurement
 * — which is exactly why they are allowed to fill the space a chart is not.
 *
 * Generated once from a fixed sequence rather than `Math.random`, so the field is the same on
 * every mount and nothing about it depends on when the page happened to open.
 */
const STREAM_GLYPHS = '·:-=+*~/\\|<>^'
const STREAM_ROW_COUNT = 9
const STREAM_ROW_LENGTH = 96

const streamRows = Array.from({ length: STREAM_ROW_COUNT }, (_, row) => {
  const glyphs = Array.from({ length: STREAM_ROW_LENGTH }, (_, column) => {
    const wave = Math.sin(column * 0.31 + row * 1.7) + Math.sin(column * 0.09 - row * 0.6)
    const index = Math.floor(((wave + 2) / 4) * STREAM_GLYPHS.length)
    // Gaps matter more than glyphs: a solid wall of characters reads as noise, a sparse one
    // reads as movement.
    return wave > 1.1 || wave < -1.1 ? ' ' : (STREAM_GLYPHS[index] ?? ' ')
  }).join('')
  // Doubled so the horizontal loop has no seam to hide.
  return {
    glyphs: glyphs + glyphs,
    duration: `${26 + row * 5}s`,
    direction: row % 2 === 0 ? 'normal' : ('reverse' as const)
  }
})

interface HeatmapCell {
  date: string
  characters: number
  durationMs: number
  sessions: number
  level: 0 | 1 | 2 | 3 | 4
  beforeTracking: boolean
}

interface HeatmapMonth {
  key: string
  label: string
  weekIndex: number
}

const { locale, t } = useI18n()
const transport = useTuffTransport()
const voiceSdk = createVoiceSdk(transport)

const insights = ref<VoiceInsights | null>(null)
const hasLoaded = ref(false)
const refreshing = ref(false)
const loadFailed = ref(false)
const copyPending = ref(false)
const copyFailed = ref(false)
const clearing = ref(false)
const clearConfirmVisible = ref(false)
const reportExpanded = ref(false)
const postClearRefreshFailed = ref(false)
const heatmapScroller = ref<HTMLElement | null>(null)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value && !loadFailed.value)
let loadRevision = 0
let disposed = false

const hasData = computed(() => {
  const value = insights.value
  return Boolean(
    value &&
    (value.sessionCount > 0 ||
      value.totalCharacters > 0 ||
      value.totalDurationMs > 0 ||
      value.days.some((day) => day.sessions > 0 || day.characters > 0 || day.durationMs > 0))
  )
})

const resolvedTimeZone = computed<string | undefined>(() => {
  const candidate = insights.value?.timezone
  if (!candidate) return undefined

  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(0)
    return candidate
  } catch {
    return undefined
  }
})

const numberFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 })
)
const compactNumberFormatter = computed(
  () =>
    new Intl.NumberFormat(locale.value, {
      notation: 'compact',
      maximumFractionDigits: 1
    })
)
const percentFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 })
)
const calendarKeyFormatter = computed(
  () =>
    new Intl.DateTimeFormat('en', {
      timeZone: resolvedTimeZone.value,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
)
const displayDateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
)
const monthFormatter = computed(
  () => new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', month: 'short' })
)
const weekdayFormatter = computed(
  () => new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', weekday: 'narrow' })
)

function dateKeyFromTimestamp(timestamp: number): string {
  const parts = calendarKeyFormatter.value.formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateKeyFromUtc(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function utcFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function formatDateKey(dateKey: string): string {
  return displayDateFormatter.value.format(new Date(utcFromDateKey(dateKey)))
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return t('voiceInsights.units.zeroMinutes')
  if (durationMs < 60_000) return t('voiceInsights.units.lessThanMinute')

  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return t('voiceInsights.units.minutes', { count: minutes })
  if (minutes === 0) return t('voiceInsights.units.hours', { count: hours })
  return t('voiceInsights.units.hoursMinutes', { hours, minutes })
}

function heatLevel(characters: number, maximum: number): 0 | 1 | 2 | 3 | 4 {
  if (characters <= 0 || maximum <= 0) return 0
  const scaled = Math.ceil((Math.log1p(characters) / Math.log1p(maximum)) * 4)
  return Math.min(4, Math.max(1, scaled)) as 1 | 2 | 3 | 4
}

const boundaryLabel = computed(() => {
  const value = insights.value
  if (!value?.startedAt) return t('voiceInsights.boundary.notStarted')
  return t('voiceInsights.boundary.since', {
    date: formatDateKey(dateKeyFromTimestamp(value.startedAt))
  })
})

const metrics = computed(() => {
  const value = insights.value
  if (!value) return []

  return [
    {
      key: 'characters',
      value: compactNumberFormatter.value.format(value.totalCharacters),
      unit: t('voiceInsights.units.characters'),
      label: t('voiceInsights.metrics.characters'),
      note: ''
    },
    {
      key: 'saved',
      value: formatDuration(value.estimatedSavedMs),
      unit: '',
      label: t('voiceInsights.metrics.saved'),
      note: t('voiceInsights.metrics.savedBasis', {
        count: numberFormatter.value.format(value.typingCharactersPerMinute)
      })
    },
    {
      key: 'rate',
      value:
        value.averageCharactersPerMinute === null
          ? '—'
          : numberFormatter.value.format(value.averageCharactersPerMinute),
      unit: t('voiceInsights.units.charactersPerMinute'),
      label: t('voiceInsights.metrics.rate'),
      note: ''
    },
    {
      key: 'duration',
      value: formatDuration(value.totalDurationMs),
      unit: '',
      label: t('voiceInsights.metrics.duration'),
      note: ''
    }
  ]
})

const streaks = computed(() => {
  const value = insights.value
  if (!value) return []

  return [
    { key: 'active', value: value.activeDays, label: t('voiceInsights.streak.activeDays') },
    { key: 'current', value: value.currentStreak, label: t('voiceInsights.streak.current') },
    { key: 'longest', value: value.longestStreak, label: t('voiceInsights.streak.longest') }
  ]
})

/**
 * One number leads, the rest support it.
 *
 * Four equally sized cards make the reader choose what matters; this page has an answer — the
 * time not spent typing is the conclusion, and characters, rate and duration are the working.
 * The estimate basis rides with the headline number rather than sitting in a footnote, because
 * a figure this prominent is exactly the one that must not be mistaken for a measurement.
 */
const heroMetric = computed(() => metrics.value.find((metric) => metric.key === 'saved') ?? null)
const supportMetrics = computed(() => metrics.value.filter((metric) => metric.key !== 'saved'))

/** The last 12 weeks of dictated characters, as a share of the busiest of them. */
const recentWeeks = computed(() => {
  const weeks = heatmapWeeks.value.slice(-WEEKLY_BAR_COUNT)
  const totals = weeks.map((week) =>
    week.reduce((sum, cell) => sum + (cell && !cell.beforeTracking ? cell.characters : 0), 0)
  )
  const peak = Math.max(...totals, 0)
  return totals.map((characters, index) => ({
    key: weeks[index]?.find((cell) => cell)?.date ?? String(index),
    characters,
    // A week with nothing in it still gets a visible sliver: an empty column and a missing
    // column look the same, and only one of them is true.
    ratio: peak > 0 ? Math.max(characters / peak, characters > 0 ? 0.08 : 0.02) : 0.02
  }))
})

const heatmapWeeks = computed<Array<Array<HeatmapCell | null>>>(() => {
  const value = insights.value
  if (!value) return []

  const todayKey = dateKeyFromTimestamp(Date.now())
  const todayUtc = utcFromDateKey(todayKey)
  const firstUtc = todayUtc - (INSIGHT_DAY_COUNT - 1) * DAY_MS
  const gridStartUtc = firstUtc - new Date(firstUtc).getUTCDay() * DAY_MS
  const totalGridDays = Math.ceil((todayUtc - gridStartUtc + DAY_MS) / (7 * DAY_MS)) * 7
  const dayMap = new Map(value.days.map((day) => [day.date, day]))
  const maximum = value.days.reduce((current, day) => Math.max(current, day.characters), 0)
  const trackingStartKey = value.startedAt ? dateKeyFromTimestamp(value.startedAt) : null
  const weeks: Array<Array<HeatmapCell | null>> = []

  for (let offset = 0; offset < totalGridDays; offset += 7) {
    const week: Array<HeatmapCell | null> = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const timestamp = gridStartUtc + (offset + weekday) * DAY_MS
      if (timestamp < firstUtc || timestamp > todayUtc) {
        week.push(null)
        continue
      }

      const date = dateKeyFromUtc(timestamp)
      const day = dayMap.get(date)
      const characters = day?.characters ?? 0
      week.push({
        date,
        characters,
        durationMs: day?.durationMs ?? 0,
        sessions: day?.sessions ?? 0,
        level: heatLevel(characters, maximum),
        beforeTracking: trackingStartKey === null || date < trackingStartKey
      })
    }
    weeks.push(week)
  }

  return weeks
})

const heatmapMonths = computed<HeatmapMonth[]>(() => {
  const seen = new Set<string>()
  const months: HeatmapMonth[] = []

  heatmapWeeks.value.forEach((week, weekIndex) => {
    const visibleCells = week.filter((cell): cell is HeatmapCell => cell !== null)
    const firstCell = visibleCells[0]
    const monthStarts = visibleCells.filter((cell) => cell.date.endsWith('-01'))
    const candidates = weekIndex === 0 && firstCell ? [firstCell, ...monthStarts] : monthStarts

    candidates.forEach((cell) => {
      const monthKey = cell.date.slice(0, 7)
      if (seen.has(monthKey)) return
      seen.add(monthKey)
      months.push({
        key: monthKey,
        label: monthFormatter.value.format(new Date(utcFromDateKey(`${monthKey}-01`))),
        weekIndex
      })
    })
  })

  return months
})

const heatmapStyle = computed<CSSProperties>(() => ({
  '--voice-heatmap-week-count': String(heatmapWeeks.value.length)
}))

const weekdayLabels = computed(() =>
  Array.from({ length: 7 }, (_, weekday) =>
    weekdayFormatter.value.format(new Date(Date.UTC(2024, 0, 7 + weekday)))
  )
)

const cleanupRate = computed(() => {
  const value = insights.value
  if (!value || value.sessionCount <= 0) return null
  return value.polishedSessionCount / value.sessionCount
})

const cleanupRateLabel = computed(() =>
  cleanupRate.value === null ? '—' : percentFormatter.value.format(cleanupRate.value)
)
const clearButtons = computed<DialogButton[]>(() => [
  { content: t('voiceInsights.actions.cancel'), type: 'info', onClick: () => true },
  {
    content: t('voiceInsights.clear.confirm'),
    type: 'error',
    onClick: confirmClear
  }
])

function heatmapCellLabel(cell: HeatmapCell): string {
  const date = formatDateKey(cell.date)
  if (cell.beforeTracking) return t('voiceInsights.heatmap.beforeTracking', { date })
  if (cell.sessions === 0 && cell.characters === 0 && cell.durationMs === 0) {
    return t('voiceInsights.heatmap.noActivity', { date })
  }
  return t('voiceInsights.heatmap.daySummary', {
    date,
    characters: numberFormatter.value.format(cell.characters),
    sessions: numberFormatter.value.format(cell.sessions),
    duration: formatDuration(cell.durationMs)
  })
}

function buildShareText(value: VoiceInsights): string {
  const averageRate =
    value.averageCharactersPerMinute === null
      ? t('voiceInsights.share.unavailable')
      : t('voiceInsights.share.rateValue', {
          count: numberFormatter.value.format(value.averageCharactersPerMinute)
        })

  return [
    t('voiceInsights.share.title'),
    boundaryLabel.value,
    t('voiceInsights.share.characters', {
      count: numberFormatter.value.format(value.totalCharacters)
    }),
    t('voiceInsights.share.saved', { duration: formatDuration(value.estimatedSavedMs) }),
    t('voiceInsights.share.rate', { rate: averageRate }),
    t('voiceInsights.share.duration', { duration: formatDuration(value.totalDurationMs) }),
    t('voiceInsights.share.activeDays', { count: numberFormatter.value.format(value.activeDays) }),
    t('voiceInsights.share.currentStreak', {
      count: numberFormatter.value.format(value.currentStreak)
    }),
    t('voiceInsights.share.longestStreak', {
      count: numberFormatter.value.format(value.longestStreak)
    }),
    t('voiceInsights.share.sessions', { count: numberFormatter.value.format(value.sessionCount) }),
    t('voiceInsights.share.polishedSessions', {
      count: numberFormatter.value.format(value.polishedSessionCount)
    }),
    t('voiceInsights.share.estimateBasis', {
      count: numberFormatter.value.format(value.typingCharactersPerMinute)
    })
  ].join('\n')
}

async function revealLatestHeatmap(): Promise<void> {
  await nextTick()
  if (disposed || !heatmapScroller.value) return
  heatmapScroller.value.scrollLeft =
    heatmapScroller.value.scrollWidth - heatmapScroller.value.clientWidth
}

async function loadInsights(background = false): Promise<void> {
  if (clearing.value || disposed) return

  const revision = ++loadRevision
  const recoveringClearedState = postClearRefreshFailed.value
  if (background) refreshing.value = true
  if (!insights.value) hasLoaded.value = false
  if (!recoveringClearedState) loadFailed.value = false
  copyFailed.value = false

  try {
    const next = await voiceSdk.getInsights()
    if (revision !== loadRevision || disposed) return
    insights.value = next
    hasLoaded.value = true
    loadFailed.value = false
    postClearRefreshFailed.value = false
    await revealLatestHeatmap()
  } catch {
    if (revision !== loadRevision || disposed) return
    hasLoaded.value = true
    if (recoveringClearedState) {
      postClearRefreshFailed.value = true
      loadFailed.value = false
    } else {
      loadFailed.value = true
    }
  } finally {
    if (revision === loadRevision && !disposed) refreshing.value = false
  }
}

async function copyShareSummary(): Promise<void> {
  if (!insights.value || !hasData.value || copyPending.value || clearing.value || disposed) return
  copyPending.value = true
  copyFailed.value = false

  try {
    await transport.send(ClipboardEvents.write, {
      type: 'text',
      value: buildShareText(insights.value)
    })
    if (!disposed) toast.success(t('voiceInsights.share.copied'))
  } catch {
    if (!disposed) {
      copyFailed.value = true
      toast.error(t('voiceInsights.share.copyFailed'))
    }
  } finally {
    if (!disposed) copyPending.value = false
  }
}

function requestClear(): void {
  if (!hasData.value || refreshing.value || copyPending.value || clearing.value) return
  clearConfirmVisible.value = true
}

function closeClearConfirm(): void {
  if (clearing.value) return
  clearConfirmVisible.value = false
}

async function confirmClear(): Promise<boolean> {
  if (clearing.value || disposed) return false

  clearing.value = true
  loadRevision += 1
  refreshing.value = false

  try {
    await voiceSdk.clearInsights()
  } catch {
    if (!disposed) toast.error(t('voiceInsights.clear.failed'))
    clearing.value = false
    return false
  }

  if (disposed) return true

  insights.value = null
  hasLoaded.value = true
  loadFailed.value = false
  postClearRefreshFailed.value = false
  reportExpanded.value = false
  toast.success(t('voiceInsights.clear.success'))

  try {
    const next = await voiceSdk.getInsights()
    if (!disposed) insights.value = next
  } catch {
    if (!disposed) postClearRefreshFailed.value = true
  } finally {
    if (!disposed) clearing.value = false
  }

  return true
}

onMounted(() => {
  void loadInsights()
})

onBeforeUnmount(() => {
  disposed = true
  loadRevision += 1
  refreshing.value = false
})
</script>

<template>
  <section
    class="VoiceInsights"
    data-testid="voice-insights-page"
    :aria-busy="!hasLoaded || refreshing || clearing"
    aria-labelledby="voice-insights-title"
  >
    <header class="VoiceInsights-Hero">
      <div class="VoiceInsights-HeroCopy">
        <h1 id="voice-insights-title">{{ t('voiceInsights.headline') }}</h1>
        <p>{{ t('voiceInsights.subtitle') }}</p>
      </div>

      <div class="VoiceInsights-HeroActions shell-chrome-safe-inline-end">
        <TxButton
          variant="secondary"
          :loading="refreshing"
          :disabled="!hasLoaded || clearing"
          data-testid="voice-insights-refresh"
          @click="loadInsights(true)"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
          <span>{{ t('voiceInsights.actions.refresh') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          :loading="copyPending"
          :disabled="!hasData || refreshing || clearing"
          data-testid="voice-insights-share"
          @click="copyShareSummary"
        >
          <span class="i-ri-share-forward-line" aria-hidden="true" />
          <span>{{ t('voiceInsights.actions.share') }}</span>
        </TxButton>
      </div>
    </header>

    <div
      v-if="loadFailed"
      class="VoiceInsights-Notice is-error"
      data-testid="voice-insights-error"
      role="alert"
    >
      <div>
        <strong>{{ t('voiceInsights.error.title') }}</strong>
        <span>{{ t('voiceInsights.error.description') }}</span>
      </div>
      <TxButton variant="flat" size="sm" :loading="refreshing" @click="loadInsights(true)">
        {{ t('voiceInsights.actions.retry') }}
      </TxButton>
    </div>

    <div
      v-if="copyFailed"
      class="VoiceInsights-Notice is-error"
      data-testid="voice-insights-copy-error"
      role="alert"
    >
      <span>{{ t('voiceInsights.share.copyFailed') }}</span>
      <TxButton variant="flat" size="sm" :loading="copyPending" @click="copyShareSummary">
        {{ t('voiceInsights.actions.retry') }}
      </TxButton>
    </div>

    <div
      v-if="postClearRefreshFailed"
      class="VoiceInsights-Notice is-warning"
      data-testid="voice-insights-clear-refresh-warning"
      role="status"
    >
      <div>
        <strong>{{ t('voiceInsights.clear.refreshNeededTitle') }}</strong>
        <span>{{ t('voiceInsights.clear.refreshNeededDescription') }}</span>
      </div>
      <TxButton variant="flat" size="sm" :loading="refreshing" @click="loadInsights(true)">
        {{ t('voiceInsights.actions.refresh') }}
      </TxButton>
    </div>

    <div
      v-if="!hasLoaded"
      class="VoiceInsights-Canvas VoiceInsights-Loading"
      data-testid="voice-insights-loading"
      role="status"
    >
      <span class="VoiceInsights-SrOnly">{{ t('voiceInsights.loading') }}</span>
      <template v-if="showSkeleton">
        <div class="VoiceInsights-SectionHeader" aria-hidden="true">
          <TxSkeleton :width="116" :height="24" :radius="4" />
          <TxSkeleton :width="164" :height="12" :radius="4" />
        </div>
        <div class="VoiceInsights-Metrics" aria-hidden="true">
          <article v-for="index in 4" :key="index" class="VoiceInsights-Metric">
            <TxSkeleton :width="148" :height="28" :radius="4" />
            <TxSkeleton :width="92" :height="12" :radius="4" />
          </article>
        </div>
        <article class="VoiceInsights-Activity" aria-hidden="true">
          <header class="VoiceInsights-ActivityHeading">
            <TxSkeleton :width="184" :height="16" :radius="4" />
            <TxSkeleton :width="248" :height="11" :radius="4" />
          </header>
          <div class="VoiceInsights-Streaks">
            <div v-for="index in 3" :key="index" class="VoiceInsights-Streak">
              <TxSkeleton :width="68" :height="26" :radius="4" />
              <TxSkeleton :width="96" :height="12" :radius="4" />
            </div>
          </div>
          <TxSkeleton width="100%" :height="156" :radius="10" />
        </article>
      </template>
    </div>

    <div
      v-else-if="!loadFailed && !hasData"
      class="VoiceInsights-Canvas VoiceInsights-Empty"
      data-testid="voice-insights-empty"
    >
      <!--
        Icon and one line, nothing else. The description restated the title, and the privacy
        sentence is already the page subtitle four inches above it — an empty state that
        explains itself twice reads as an apology for being empty.
      -->
      <div class="VoiceInsights-Stream" aria-hidden="true">
        <span
          v-for="(row, index) in streamRows"
          :key="index"
          :style="{ animationDuration: row.duration, animationDirection: row.direction }"
          >{{ row.glyphs }}</span
        >
      </div>
      <span class="VoiceInsights-EmptyIcon i-ri-mic-line" aria-hidden="true" />
      <h2>{{ t('voiceInsights.empty.title') }}</h2>
    </div>

    <main v-else-if="insights" class="VoiceInsights-Canvas" data-testid="voice-insights-data">
      <div class="VoiceInsights-SectionHeader">
        <div>
          <h2>{{ t('voiceInsights.sectionTitle') }}</h2>
          <p>{{ boundaryLabel }}</p>
        </div>
        <TxButton
          variant="bare"
          type="danger"
          size="sm"
          :disabled="refreshing || copyPending || clearing"
          data-testid="voice-insights-clear"
          @click="requestClear"
        >
          <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
          <span>{{ t('voiceInsights.actions.clear') }}</span>
        </TxButton>
      </div>

      <section class="VoiceInsights-Headline" :aria-label="t('voiceInsights.metrics.label')">
        <article
          v-if="heroMetric"
          class="VoiceInsights-Hero2"
          data-testid="voice-insights-hero-metric"
          :data-metric="heroMetric.key"
        >
          <p class="VoiceInsights-Hero2Label">{{ heroMetric.label }}</p>
          <div class="VoiceInsights-Hero2Value">
            <strong>{{ heroMetric.value }}</strong>
            <span v-if="insights">{{
              t('voiceInsights.metrics.savedEquivalent', {
                count: numberFormatter.format(insights.totalCharacters)
              })
            }}</span>
          </div>
          <small v-if="heroMetric.note">{{ heroMetric.note }}</small>
        </article>

        <div class="VoiceInsights-Metrics">
          <article
            v-for="metric in supportMetrics"
            :key="metric.key"
            class="VoiceInsights-Metric"
            :data-metric="metric.key"
          >
            <div class="VoiceInsights-MetricValue">
              <strong>{{ metric.value }}</strong>
              <span v-if="metric.unit">{{ metric.unit }}</span>
            </div>
            <p>{{ metric.label }}</p>
            <small v-if="metric.note">{{ metric.note }}</small>
          </article>
        </div>
      </section>

      <article class="VoiceInsights-Weeks" data-testid="voice-insights-weeks">
        <header class="VoiceInsights-WeeksHeading">
          <div>
            <h3>{{ t('voiceInsights.weeks.title') }}</h3>
            <p>{{ t('voiceInsights.weeks.note') }}</p>
          </div>
          <p v-if="insights" class="VoiceInsights-WeeksStreak">
            {{
              t('voiceInsights.weeks.streak', {
                current: numberFormatter.format(insights.currentStreak),
                longest: numberFormatter.format(insights.longestStreak),
                active: numberFormatter.format(insights.activeDays)
              })
            }}
          </p>
        </header>
        <div class="VoiceInsights-WeekBars" aria-hidden="true">
          <span
            v-for="week in recentWeeks"
            :key="week.key"
            :style="{ height: `${Math.round(week.ratio * 100)}%` }"
          />
        </div>
      </article>

      <article class="VoiceInsights-Activity" data-testid="voice-insights-activity">
        <header class="VoiceInsights-ActivityHeading">
          <h3>{{ t('voiceInsights.streak.title') }}</h3>
          <p>{{ t('voiceInsights.streak.windowNote') }}</p>
        </header>

        <div class="VoiceInsights-Streaks" :aria-label="t('voiceInsights.streak.label')">
          <div v-for="streak in streaks" :key="streak.key" class="VoiceInsights-Streak">
            <div>
              <strong>{{ numberFormatter.format(streak.value) }}</strong>
              <span>{{ t('voiceInsights.units.days') }}</span>
            </div>
            <p>{{ streak.label }}</p>
          </div>
        </div>

        <div class="VoiceInsights-HeatmapHeader">
          <div>
            <h3>{{ t('voiceInsights.heatmap.title') }}</h3>
            <p>{{ t('voiceInsights.heatmap.description') }}</p>
          </div>
          <div class="VoiceInsights-Legend" :aria-label="t('voiceInsights.heatmap.legend')">
            <span>{{ t('voiceInsights.heatmap.less') }}</span>
            <span v-for="level in [0, 1, 2, 3, 4]" :key="level" :class="`is-level-${level}`" />
            <span>{{ t('voiceInsights.heatmap.more') }}</span>
          </div>
        </div>

        <div
          class="VoiceInsights-Heatmap"
          data-testid="voice-insights-heatmap"
          role="group"
          :aria-label="t('voiceInsights.heatmap.accessibleLabel')"
        >
          <div class="VoiceInsights-WeekdayLabels" aria-hidden="true">
            <span v-for="(label, index) in weekdayLabels" :key="index">{{ label }}</span>
          </div>
          <div
            ref="heatmapScroller"
            class="VoiceInsights-HeatmapScroller"
            tabindex="0"
            :aria-label="t('voiceInsights.heatmap.scrollLabel')"
          >
            <div class="VoiceInsights-Months" :style="heatmapStyle" aria-hidden="true">
              <span
                v-for="month in heatmapMonths"
                :key="month.key"
                :style="{ gridColumnStart: month.weekIndex + 1 }"
              >
                {{ month.label }}
              </span>
            </div>
            <div class="VoiceInsights-Weeks" :style="heatmapStyle">
              <div
                v-for="(week, weekIndex) in heatmapWeeks"
                :key="weekIndex"
                class="VoiceInsights-Week"
              >
                <template v-for="(cell, weekday) in week" :key="weekday">
                  <span v-if="!cell" class="VoiceInsights-HeatCell is-outside" aria-hidden="true" />
                  <span
                    v-else
                    class="VoiceInsights-HeatCell"
                    :class="[
                      `is-level-${cell.level}`,
                      { 'is-before-tracking': cell.beforeTracking }
                    ]"
                    :title="heatmapCellLabel(cell)"
                    :aria-label="heatmapCellLabel(cell)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="VoiceInsights-Report" data-testid="voice-insights-report">
        <div class="VoiceInsights-ReportIntro">
          <div>
            <span class="VoiceInsights-ReportIcon i-ri-file-chart-line" aria-hidden="true" />
            <h3>{{ t('voiceInsights.report.title') }}</h3>
            <p>{{ t('voiceInsights.report.description') }}</p>
          </div>
          <TxButton
            variant="flat"
            size="sm"
            :aria-expanded="reportExpanded"
            aria-controls="voice-insights-methodology"
            data-testid="voice-insights-report-toggle"
            @click="reportExpanded = !reportExpanded"
          >
            <span>{{
              t(`voiceInsights.actions.${reportExpanded ? 'hideReport' : 'showReport'}`)
            }}</span>
            <span
              :class="reportExpanded ? 'i-ri-arrow-up-s-line' : 'i-ri-arrow-down-s-line'"
              aria-hidden="true"
            />
          </TxButton>
        </div>

        <div class="VoiceInsights-ReportStats">
          <div>
            <strong>{{ numberFormatter.format(insights.sessionCount) }}</strong>
            <span>{{ t('voiceInsights.report.successfulSessions') }}</span>
          </div>
          <div>
            <strong>{{ numberFormatter.format(insights.polishedSessionCount) }}</strong>
            <span>{{ t('voiceInsights.report.polishedSessions') }}</span>
          </div>
          <div>
            <strong>{{ cleanupRateLabel }}</strong>
            <span>{{ t('voiceInsights.report.cleanupRate') }}</span>
          </div>
        </div>

        <div class="VoiceInsights-LearningBoundary">
          <span class="i-ri-shield-check-line" aria-hidden="true" />
          <div>
            <strong>{{ t('voiceInsights.report.learningTitle') }}</strong>
            <p>{{ t('voiceInsights.report.learningUnavailable') }}</p>
          </div>
        </div>

        <div
          v-if="reportExpanded"
          id="voice-insights-methodology"
          class="VoiceInsights-Methodology"
          data-testid="voice-insights-methodology"
        >
          <h4>{{ t('voiceInsights.report.methodologyTitle') }}</h4>
          <ul>
            <li>{{ t('voiceInsights.report.successMethod') }}</li>
            <li>{{ t('voiceInsights.report.characterMethod') }}</li>
            <li>
              {{
                t('voiceInsights.report.savedMethod', {
                  count: numberFormatter.format(insights.typingCharactersPerMinute)
                })
              }}
            </li>
            <li>{{ t('voiceInsights.report.rateMethod') }}</li>
            <li>
              {{ t('voiceInsights.report.calendarMethod', { timezone: insights.timezone }) }}
            </li>
          </ul>
        </div>
      </article>
    </main>

    <TxBottomDialog
      v-if="clearConfirmVisible"
      :title="t('voiceInsights.clear.title')"
      :message="t('voiceInsights.clear.description')"
      :btns="clearButtons"
      :close="closeClearConfirm"
    />
  </section>
</template>

<style scoped lang="scss">
.VoiceInsights {
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  padding: calc(var(--shell-space-7) + var(--shell-window-controls-height)) var(--shell-space-7)
    var(--shell-space-7);
  color: var(--shell-text-primary);
}

.VoiceInsights-Hero {
  display: flex;
  gap: var(--shell-space-5);
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto var(--shell-space-7);
}

.VoiceInsights-HeroCopy {
  min-width: 0;

  h1 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.12;
    text-wrap: balance;
  }

  p {
    max-width: 70ch;
    margin: var(--shell-space-3) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-md);
    line-height: 1.6;
    text-wrap: pretty;
  }
}

.VoiceInsights-HeroActions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--shell-space-2);
}

.VoiceInsights-Notice {
  display: flex;
  gap: var(--shell-space-4);
  align-items: center;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto var(--shell-space-4);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  color: var(--shell-text-regular);

  &.is-error {
    border-color: var(--shell-danger-border);
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }

  &.is-warning {
    border-color: var(--shell-warning-border);
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: var(--shell-space-1);
  }

  strong,
  span {
    font-size: var(--shell-fs-body);
    line-height: 1.4;
  }
}

.VoiceInsights-Canvas {
  max-width: 1440px;
  min-width: 0;
  margin: 0 auto;
  padding: var(--shell-space-6);
  border-radius: var(--shell-radius-2xl);
  background-color: var(--shell-surface);
  background-image: radial-gradient(circle, var(--shell-border) 1px, transparent 1px);
  background-size: var(--shell-space-3) var(--shell-space-3);
}

.VoiceInsights-SectionHeader {
  display: flex;
  gap: var(--shell-space-4);
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: var(--shell-space-5);

  h2 {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-title);
    font-weight: 600;
    line-height: 1.2;
  }

  p {
    margin: var(--shell-space-2) 0 0;
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-body);
  }
}

.VoiceInsights-Headline {
  display: grid;
  gap: var(--shell-space-5);
}

/*
 * The conclusion, at the size of a conclusion.
 *
 * Its basis line sits inside the same card rather than under the section: a number this large is
 * the one most likely to be read as measured, and the sentence that says it is an estimate has
 * to be impossible to scroll past separately from it.
 */
.VoiceInsights-Hero2 {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);

  small {
    color: var(--shell-warning);
    font-size: var(--shell-fs-caption);
    line-height: 1.4;
  }
}

.VoiceInsights-Hero2Label {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.VoiceInsights-Hero2Value {
  display: flex;
  gap: var(--shell-space-3);
  align-items: baseline;
  flex-wrap: wrap;

  strong {
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 600;
    line-height: 1.1;
  }

  span {
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
  }
}

.VoiceInsights-Metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--shell-space-5);
}

/* Twelve weeks at a glance; the year is still below, for the reader who wants the whole shape. */
.VoiceInsights-WeeksHeading {
  display: flex;
  gap: var(--shell-space-4);
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;

  h3 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-body);
    font-weight: 600;
  }

  p {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }
}

.VoiceInsights-WeeksStreak {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.VoiceInsights-WeekBars {
  display: flex;
  height: 84px;
  gap: var(--shell-space-2);
  align-items: flex-end;
  margin-top: var(--shell-space-4);

  span {
    min-height: 2px;
    border-radius: var(--shell-radius-sm);
    background: var(--shell-primary);
    flex: 1;
  }
}

.VoiceInsights-Metric,
.VoiceInsights-Weeks,
.VoiceInsights-Activity,
.VoiceInsights-Report {
  border-radius: var(--shell-radius-xl);
  background: var(--shell-bg);
  box-shadow: 0 var(--shell-space-1) var(--shell-space-2) var(--shell-shadow);
}

.VoiceInsights-Metric {
  display: flex;
  min-width: 0;
  min-height: 116px;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--shell-space-5);

  > p {
    margin: var(--shell-space-2) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-md);
  }

  > small {
    margin-top: var(--shell-space-2);
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
    line-height: 1.4;
  }
}

.VoiceInsights-MetricValue {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: baseline;
  min-width: 0;
  font-variant-numeric: tabular-nums;

  strong {
    min-width: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  span {
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-md);
    font-weight: 600;
  }
}

.VoiceInsights-Activity,
.VoiceInsights-Report {
  margin-top: var(--shell-space-5);
  padding: var(--shell-space-6);
}

.VoiceInsights-ActivityHeading {
  margin-bottom: var(--shell-space-5);

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
    line-height: 1.3;
  }

  p {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
  }
}

.VoiceInsights-Streaks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--shell-space-5);
  margin-bottom: var(--shell-space-6);
}

.VoiceInsights-Streak {
  min-width: 0;

  > div {
    display: flex;
    gap: var(--shell-space-2);
    align-items: baseline;
    font-variant-numeric: tabular-nums;
  }

  strong {
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    line-height: 1.1;
  }

  span {
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-body);
    font-weight: 600;
  }

  p {
    margin: var(--shell-space-2) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-md);
  }
}

.VoiceInsights-HeatmapHeader {
  display: flex;
  gap: var(--shell-space-4);
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: var(--shell-space-5);
  border-top: 1px solid var(--shell-border);

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
    line-height: 1.3;
  }

  p {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
  }
}

.VoiceInsights-Legend {
  display: flex;
  flex: 0 0 auto;
  gap: var(--shell-space-1);
  align-items: center;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  > span:not(:first-child):not(:last-child) {
    width: var(--shell-space-3);
    height: var(--shell-space-3);
    border-radius: var(--shell-radius-sm);
  }
}

.VoiceInsights-Heatmap {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--shell-space-3);
  min-width: 0;
  margin-top: var(--shell-space-4);
}

.VoiceInsights-WeekdayLabels {
  display: grid;
  grid-template-rows: repeat(7, var(--shell-space-4));
  gap: var(--shell-space-1);
  padding-top: calc(var(--shell-fs-caption) + var(--shell-space-2));
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: var(--shell-space-4);
  text-align: center;
}

.VoiceInsights-HeatmapScroller {
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--shell-space-2);
  outline: none;
  overscroll-behavior-x: contain;

  &:focus-visible {
    border-radius: var(--shell-radius-sm);
    box-shadow: 0 0 0 2px var(--shell-primary-border);
  }
}

.VoiceInsights-Months,
.VoiceInsights-Weeks {
  display: grid;
  grid-template-columns: repeat(var(--voice-heatmap-week-count), var(--shell-space-4));
  gap: var(--shell-space-1);
  width: max-content;
}

.VoiceInsights-Months {
  height: calc(var(--shell-fs-caption) + var(--shell-space-2));
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  white-space: nowrap;
}

.VoiceInsights-Week {
  display: grid;
  grid-template-rows: repeat(7, var(--shell-space-4));
  gap: var(--shell-space-1);
}

.VoiceInsights-HeatCell {
  width: var(--shell-space-4);
  height: var(--shell-space-4);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);

  &.is-before-tracking {
    background-color: var(--shell-surface);
    background-image: repeating-linear-gradient(
      135deg,
      var(--shell-border) 0 1px,
      transparent 1px var(--shell-space-1)
    );
  }

  &.is-outside {
    background: transparent;
  }
}

.is-level-0 {
  background-color: var(--shell-surface-2);
}

.is-level-1 {
  background-color: color-mix(in srgb, var(--shell-primary) 22%, var(--shell-bg));
}

.is-level-2 {
  background-color: color-mix(in srgb, var(--shell-primary) 42%, var(--shell-bg));
}

.is-level-3 {
  background-color: color-mix(in srgb, var(--shell-primary) 68%, var(--shell-bg));
}

.is-level-4 {
  background-color: var(--shell-primary);
}

.VoiceInsights-ReportIntro {
  display: flex;
  gap: var(--shell-space-5);
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;

  > div {
    min-width: 0;
  }

  h3 {
    display: inline;
    margin: 0;
    font-size: var(--shell-fs-title);
    line-height: 1.25;
  }

  p {
    max-width: 70ch;
    margin: var(--shell-space-2) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
    line-height: 1.6;
  }
}

.VoiceInsights-ReportIcon {
  display: inline-block;
  width: var(--shell-space-5);
  height: var(--shell-space-5);
  margin-right: var(--shell-space-2);
  color: var(--shell-primary);
  font-size: var(--shell-space-5);
  vertical-align: text-bottom;
}

.VoiceInsights-ReportStats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--shell-space-5);
  margin-top: var(--shell-space-6);
  padding: var(--shell-space-5) 0;
  border-top: 1px solid var(--shell-border);
  border-bottom: 1px solid var(--shell-border);

  > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--shell-space-1);
  }

  strong {
    font-size: var(--shell-fs-h1);
    font-variant-numeric: tabular-nums;
  }

  span {
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
  }
}

.VoiceInsights-LearningBoundary {
  display: flex;
  gap: var(--shell-space-3);
  align-items: flex-start;
  margin-top: var(--shell-space-5);
  padding: var(--shell-space-4);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-info-soft);
  color: var(--shell-info);

  > span {
    flex: 0 0 auto;
    width: var(--shell-space-5);
    height: var(--shell-space-5);
    font-size: var(--shell-space-5);
  }

  strong {
    font-size: var(--shell-fs-body);
  }

  p {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
  }
}

.VoiceInsights-Methodology {
  margin-top: var(--shell-space-5);

  h4 {
    margin: 0;
    font-size: var(--shell-fs-md);
  }

  ul {
    display: grid;
    gap: var(--shell-space-2);
    max-width: 75ch;
    margin: var(--shell-space-3) 0 0;
    padding-left: var(--shell-space-5);
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
    line-height: 1.55;
  }
}

/*
 * Streams drifting past, thinned out toward the middle so the type sits in still air.
 *
 * The mask is what makes it read as flow rather than as wallpaper: the field is densest at the
 * edges and gone where the icon and the sentence are, so the eye is pulled inward without
 * anything actually moving toward the centre.
 */
.VoiceInsights-Stream {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: var(--shell-space-5) 0;
  box-sizing: border-box;
  color: var(--shell-text-muted);
  font-family: var(--shell-font-mono, ui-monospace, monospace);
  font-size: 13px;
  inset: 0;
  line-height: 1.9;
  mask-image: radial-gradient(ellipse 46% 58% at 50% 50%, transparent 40%, #000 78%);
  opacity: 0.32;
  pointer-events: none;
  user-select: none;

  span {
    display: block;
    animation: voice-insights-stream 30s linear infinite;
    white-space: pre;
    will-change: transform;
  }
}

@keyframes voice-insights-stream {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(-50%, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .VoiceInsights-Stream span {
    animation: none;
  }
}

.VoiceInsights-Empty {
  position: relative;
  display: flex;
  min-height: 420px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  text-align: center;

  h2 {
    margin: var(--shell-space-4) 0 var(--shell-space-2);
    font-size: var(--shell-fs-title);
  }

  p {
    max-width: 58ch;
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-md);
    line-height: 1.6;
  }

  > span:last-child {
    max-width: 58ch;
    margin-top: var(--shell-space-3);
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
  }
}

.VoiceInsights-EmptyIcon {
  width: var(--shell-space-7);
  height: var(--shell-space-7);
  color: var(--shell-primary);
  font-size: var(--shell-space-7);
}

.VoiceInsights-Loading {
  min-height: 640px;
}

.VoiceInsights-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .VoiceInsights {
    padding-right: var(--shell-space-5);
    padding-bottom: var(--shell-space-6);
    padding-left: var(--shell-space-5);
  }

  .VoiceInsights-Hero {
    margin-bottom: var(--shell-space-6);
  }

  .VoiceInsights-Canvas {
    padding: var(--shell-space-5);
  }

  .VoiceInsights-Activity,
  .VoiceInsights-Report {
    padding: var(--shell-space-5);
  }
}

@media (max-width: 680px) {
  .VoiceInsights-Hero,
  .VoiceInsights-SectionHeader,
  .VoiceInsights-HeatmapHeader,
  .VoiceInsights-ReportIntro {
    flex-direction: column;
  }

  .VoiceInsights-HeroActions {
    width: 100%;
    margin-right: 0;

    > * {
      flex: 1 1 0;
    }
  }

  .VoiceInsights-Metrics {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--shell-space-4);
  }

  .VoiceInsights-Streaks {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .VoiceInsights-Streak:first-child {
      grid-column: 1 / -1;
    }
  }

  .VoiceInsights-Legend {
    align-self: flex-start;
  }

  .VoiceInsights-ReportIntro > :last-child {
    align-self: flex-start;
  }

  .VoiceInsights-Notice {
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .VoiceInsights {
    padding-right: var(--shell-space-4);
    padding-left: var(--shell-space-4);
  }

  .VoiceInsights-HeroActions,
  .VoiceInsights-Notice,
  .VoiceInsights-ReportStats {
    flex-direction: column;
  }

  .VoiceInsights-Notice {
    display: flex;
  }

  .VoiceInsights-ReportStats {
    display: flex;
  }
}
</style>
