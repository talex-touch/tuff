<script setup lang="ts" name="VoiceInsights">
import type {
  VoiceInsights,
  VoiceRecognitionRecord
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type { CSSProperties } from 'vue'
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const DAY_MS = 24 * 60 * 60 * 1000
const INSIGHT_DAY_COUNT = 365

/** How many weeks the compact activity strip shows; the heatmap below still covers the year. */
const WEEKLY_BAR_COUNT = 12

/**
 * The waveform behind the empty state.
 *
 * Ornament, and it has to stay ornament: there is no data on this screen, so these curves are a
 * texture, not a reading. What makes them legible as sound rather than as decoration is that
 * every line is *continuous* — three earlier attempts drew sparse characters and every one of
 * them read as dust on the display.
 *
 * Canvas rather than DOM because this is 200-odd points per line per frame; the alternative is
 * an SVG path string rebuilt sixty times a second.
 */
const WAVE_LAYERS = [
  { amplitude: 0.26, frequency: 1.1, speed: 0.11, alpha: 0.5, width: 1.6 },
  { amplitude: 0.18, frequency: 1.9, speed: -0.16, alpha: 0.34, width: 1.3 },
  { amplitude: 0.12, frequency: 3.1, speed: 0.23, alpha: 0.22, width: 1.1 },
  { amplitude: 0.07, frequency: 5.3, speed: -0.31, alpha: 0.14, width: 1 }
]
/** Only redraw ~30 times a second: this is background texture, not an animation anyone watches. */
const WAVE_FRAME_MS = 33

const waveCanvas = ref<HTMLCanvasElement | null>(null)
let waveFrame: number | null = null
let waveObserver: ResizeObserver | null = null

function drawWave(canvas: HTMLCanvasElement, elapsed: number): void {
  const context = canvas.getContext('2d')
  // jsdom has no 2D context, and a themed canvas is not worth crashing a page over.
  if (!context) return

  const { width, height } = canvas
  const ratio = window.devicePixelRatio || 1
  context.clearRect(0, 0, width, height)
  context.strokeStyle = window.getComputedStyle(canvas).color
  context.lineCap = 'round'

  const centre = height / 2
  for (const layer of WAVE_LAYERS) {
    context.beginPath()
    context.globalAlpha = layer.alpha
    context.lineWidth = layer.width * ratio
    for (let x = 0; x <= width; x += 2 * ratio) {
      const position = x / width
      // Damped where the type sits, so the words stand in still air instead of over a wave.
      const envelope = 1 - Math.exp(-(((position - 0.5) * 2.6) ** 2))
      const phase = position * Math.PI * 2 * layer.frequency + elapsed * layer.speed
      const y = centre + Math.sin(phase) * layer.amplitude * centre * envelope
      if (x === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()
  }
  context.globalAlpha = 1
}

function resizeWave(canvas: HTMLCanvasElement): void {
  const ratio = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  // Measured from the element, never from the window: the canvas is inside a padded card whose
  // width has nothing to do with the viewport's.
  canvas.width = Math.max(1, Math.round(rect.width * ratio))
  canvas.height = Math.max(1, Math.round(rect.height * ratio))
}

function stopWave(): void {
  if (waveFrame !== null) {
    cancelAnimationFrame(waveFrame)
    waveFrame = null
  }
  waveObserver?.disconnect()
  waveObserver = null
}

function startWave(canvas: HTMLCanvasElement): void {
  stopWave()
  resizeWave(canvas)

  if (typeof ResizeObserver !== 'undefined') {
    waveObserver = new ResizeObserver(() => {
      resizeWave(canvas)
      drawWave(canvas, performance.now() / 1000)
    })
    waveObserver.observe(canvas)
  }

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (still) {
    // One frame, held. The shape is the point; the drift is the part that can be declined.
    drawWave(canvas, 0)
    return
  }

  let last = 0
  const tick = (now: number): void => {
    if (now - last >= WAVE_FRAME_MS) {
      last = now
      drawWave(canvas, now / 1000)
    }
    waveFrame = requestAnimationFrame(tick)
  }
  waveFrame = requestAnimationFrame(tick)
}

watch(waveCanvas, (canvas) => {
  if (canvas) startWave(canvas)
  else stopWave()
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

/**
 * The nav label, shown small above the heading.
 *
 * Passed in rather than read here: the sidebar owns that word, and a page that hardcodes its own
 * breadcrumb drifts from the menu that leads to it.
 */
const props = defineProps<{ eyebrow?: string }>()
const eyebrow = computed(() => props.eyebrow)

const { locale, t } = useI18n()
const transport = useTuffTransport()
const voiceSdk = createVoiceSdk(transport)

const insights = ref<VoiceInsights | null>(null)
const records = ref<VoiceRecognitionRecord[]>([])
const recordsClearing = ref(false)
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
const menuOpen = ref(false)
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
      // No unit: the label under it already says 字, and a card should not say it twice.
      unit: '',
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

/**
 * One number leads, the rest support it.
 *
 * Four equally sized cards make the reader choose what matters; this page has an answer — the
 * time not spent typing is the conclusion, and characters, rate and duration are the working.
 * The estimate basis rides with the headline number rather than sitting in a footnote, because
 * a figure this prominent is exactly the one that must not be mistaken for a measurement.
 */
/**
 * The equivalent sentence, split so its figure can carry weight.
 *
 * Interpolating through `t` yields one string, and the number is the only part of it worth
 * reading — the rest is scaffolding. Rendering the message once with a sentinel in place of the
 * count and splitting on that keeps a single translatable string and works whichever side of the
 * number a language puts its words on.
 */
const EQUIVALENT_SLOT = '\u0000'
const savedEquivalent = computed(() => {
  const value = insights.value
  if (!value) return null
  const [before, after] = t('voiceInsights.metrics.savedEquivalent', {
    count: EQUIVALENT_SLOT
  }).split(EQUIVALENT_SLOT)
  return {
    before: before ?? '',
    count: numberFormatter.value.format(value.totalCharacters),
    after: after ?? ''
  }
})

const heroMetric = computed(() => metrics.value.find((metric) => metric.key === 'saved') ?? null)
const supportMetrics = computed(() => metrics.value.filter((metric) => metric.key !== 'saved'))

/**
 * How much of the record exists, in days.
 *
 * Measured from when counting started, not from how often it was used. A person who started
 * three months ago and spoke twice has eleven genuinely empty weeks, and that emptiness is the
 * chart's finding. A person who started yesterday has eleven weeks that never happened — the
 * same picture, meaning the opposite thing.
 */
const recordedDays = computed(() => {
  const startedAt = insights.value?.startedAt
  if (!startedAt) return 0
  return Math.max(0, Math.floor((Date.now() - startedAt) / DAY_MS))
})

/**
 * A block appears once the span it charts is actually covered by the record.
 *
 * The page was laid out for a year of data and shipped showing it on day one: twelve bars where
 * only one had a value, three hundred and sixty-five cells where two were coloured. Neither was
 * comparing or showing anything — they just looked broken. Not rendering a chart says less than
 * a chart with nothing in it, and less is the honest amount here.
 */
const WEEKS_TIER_DAYS = 7
const showsWeeks = computed(() => recordedDays.value >= WEEKS_TIER_DAYS)

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
    const [next, nextRecords] = await Promise.all([
      voiceSdk.getInsights(),
      voiceSdk.getRecognitionRecords()
    ])
    if (revision !== loadRevision || disposed) return
    insights.value = next
    records.value = nextRecords ?? []
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
async function clearRecords(): Promise<void> {
  if (recordsClearing.value || clearing.value) return
  recordsClearing.value = true
  try {
    await voiceSdk.clearRecognitionRecords()
    records.value = []
    toast.success(t('voiceInsights.records.clearSuccess'))
  } catch {
    toast.error(t('voiceInsights.records.clearFailed'))
  } finally {
    if (!disposed) recordsClearing.value = false
  }
}
function recordDateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

function recordStatusLabel(status: VoiceRecognitionRecord['status']): string {
  return t(`voiceInsights.records.status.${status}`)
}

function recordTokenLabel(record: VoiceRecognitionRecord): string {
  const total = record.totalTokens
  if (total !== undefined) return t('voiceInsights.records.tokensValue', { count: total })
  if (record.inputTokens !== undefined || record.outputTokens !== undefined) {
    return t('voiceInsights.records.tokensSplit', {
      input: record.inputTokens ?? 0,
      output: record.outputTokens ?? 0
    })
  }
  return t('voiceInsights.records.tokensUnavailable')
}

function recordAudioLabel(record: VoiceRecognitionRecord): string {
  if (!record.audioUrl) return t('voiceInsights.records.audioUnavailable')
  return t('voiceInsights.records.audioMeta', {
    duration: record.audioDurationMs ? formatDuration(record.audioDurationMs) : '—',
    bytes: record.audioBytes ?? 0
  })
}

onMounted(() => {
  void loadInsights()
})

/**
 * Both of these are sections of this page, not other screens.
 *
 * Records and the recognition settings sit below a year's worth of charts, which is a long way to
 * scroll past on the way to a toggle. The header jumps instead of navigating: leaving the page to
 * come back to the same page is the worse of the two.
 */
function scrollTo(target: HTMLElement | null): void {
  // Queried rather than held in a `ref`: one of these is another component's card, and a template
  // ref on a component yields its instance, not the element `scrollIntoView` needs.
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function scrollToRecords(): void {
  scrollTo(document.querySelector<HTMLElement>('[data-testid="voice-insights-records"]'))
}

function scrollToSettings(): void {
  scrollTo(document.querySelector<HTMLElement>('[data-voice-settings]'))
}

/** A menu item closes the menu, then acts. Leaving it open over a dialog is its own bug. */
function runFromMenu(action: () => void | Promise<void>): void {
  menuOpen.value = false
  void action()
}

onBeforeUnmount(() => {
  disposed = true
  loadRevision += 1
  refreshing.value = false
  // The watcher only fires when the canvas goes away with the branch; leaving the page does not
  // go through it, and a loose rAF outlives the component that owns it.
  stopWave()
})
</script>

<template>
  <section
    class="VoiceInsights"
    data-testid="voice-insights-page"
    :aria-busy="!hasLoaded || refreshing || clearing"
  >
    <!--
      The whole header, in one row, owned by the content rather than the shell.
      The shell's title row could hold a heading and one thing beside it; this page's header is a
      heading, the date counting started, three actions and a status alert. Splitting it across
      two owners is what kept leaving a band of blank between the title and the buttons.
    -->
    <header class="VoiceInsights-Hero">
      <div class="VoiceInsights-HeroCopy">
        <p v-if="eyebrow" class="VoiceInsights-Eyebrow">{{ eyebrow }}</p>
        <h1>{{ t('voiceInsights.headline') }}</h1>
        <p v-if="insights" class="VoiceInsights-Boundary">{{ boundaryLabel }}</p>
      </div>
      <div class="VoiceInsights-HeroActions shell-chrome-safe-inline-end">
        <slot name="status" />
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
          :disabled="records.length === 0"
          data-testid="voice-insights-records-jump"
          @click="scrollToRecords"
        >
          <span class="i-ri-history-line" aria-hidden="true" />
          <span>{{ t('voiceInsights.actions.records') }}</span>
        </TxButton>
        <!--
          Share, settings and delete live behind the dots.

          Delete especially: clearing every number on the page is not undoable, and it used to sit
          one stray click from the refresh button. Opening a menu first is the whole safeguard.
        -->
        <TxPopover v-model="menuOpen" placement="bottom-end" :offset="6" :min-width="176">
          <template #reference>
            <TxButton
              variant="flat"
              :aria-label="t('voiceInsights.actions.more')"
              data-testid="voice-insights-more"
            >
              <span class="i-ri-more-fill" aria-hidden="true" />
            </TxButton>
          </template>
          <div class="VoiceInsights-Menu" role="menu">
            <button
              type="button"
              role="menuitem"
              :disabled="!hasData || refreshing || clearing || copyPending"
              data-testid="voice-insights-share"
              @click="runFromMenu(copyShareSummary)"
            >
              <span class="i-ri-share-forward-line" aria-hidden="true" />
              <span>{{ t('voiceInsights.actions.share') }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="voice-insights-settings"
              @click="runFromMenu(scrollToSettings)"
            >
              <span class="i-ri-settings-3-line" aria-hidden="true" />
              <span>{{ t('voiceInsights.actions.settings') }}</span>
            </button>
            <div class="VoiceInsights-MenuRule" role="separator" />
            <button
              type="button"
              role="menuitem"
              class="is-danger"
              :disabled="!hasData || refreshing || copyPending || clearing"
              data-testid="voice-insights-clear"
              @click="runFromMenu(requestClear)"
            >
              <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
              <span>{{ t('voiceInsights.actions.clear') }}</span>
            </button>
          </div>
        </TxPopover>
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
        <div class="VoiceInsights-Metrics" aria-hidden="true">
          <TxCard v-for="index in 3" :key="index" class="VoiceInsights-Metric" shadow="none">
            <TxSkeleton :width="148" :height="28" :radius="4" />
            <TxSkeleton :width="92" :height="12" :radius="4" />
          </TxCard>
        </div>
        <TxCard class="VoiceInsights-Activity" shadow="none" aria-hidden="true">
          <div class="VoiceInsights-HeatmapHeader">
            <div>
              <TxSkeleton :width="96" :height="16" :radius="4" />
              <TxSkeleton :width="248" :height="11" :radius="4" />
            </div>
          </div>
          <TxSkeleton width="100%" :height="156" :radius="10" />
        </TxCard>
      </template>
    </div>

    <div
      v-else-if="!loadFailed && !hasData && records.length === 0"
      class="VoiceInsights-Canvas VoiceInsights-Empty"
      data-testid="voice-insights-empty"
    >
      <!--
        Icon and one line over a waveform. The description restated the title, and the privacy
        sentence is already the page subtitle four inches above it — an empty state that
        explains itself twice reads as an apology for being empty.
      -->
      <canvas ref="waveCanvas" class="VoiceInsights-Wave" aria-hidden="true" />
      <span class="VoiceInsights-EmptyIcon i-ri-mic-line" aria-hidden="true" />
      <h2>{{ t('voiceInsights.empty.title') }}</h2>
    </div>

    <main v-else-if="insights" class="VoiceInsights-Canvas" data-testid="voice-insights-data">
      <section class="VoiceInsights-Headline" :aria-label="t('voiceInsights.metrics.label')">
        <article
          v-if="heroMetric"
          class="VoiceInsights-Hero2"
          data-testid="voice-insights-hero-metric"
          :data-metric="heroMetric.key"
        >
          <p class="VoiceInsights-Hero2Label">
            {{ heroMetric.label }}
            <!--
              The basis rides the label, not the body.
              It is a caveat about how the number was derived, not a second number, and printing
              it under the value made the one card that carries a caveat taller than the ones that
              do not. On hover it is still one gesture away, and the row stops being ragged.
            -->
            <TxTooltip v-if="heroMetric.note" :content="heroMetric.note">
              <span
                class="VoiceInsights-Hero2Basis i-carbon-information"
                data-testid="voice-insights-saved-basis"
                role="img"
                :aria-label="heroMetric.note"
                tabindex="0"
              />
            </TxTooltip>
          </p>
          <div class="VoiceInsights-Hero2Value">
            <strong><TxTextMorph :text="heroMetric.value" /></strong>
            <span v-if="savedEquivalent" class="VoiceInsights-Hero2Equivalent"
              >{{ savedEquivalent.before }}<strong>{{ savedEquivalent.count }}</strong
              >{{ savedEquivalent.after }}</span
            >
          </div>
        </article>

        <div class="VoiceInsights-Metrics">
          <TxCard
            v-for="metric in supportMetrics"
            :key="metric.key"
            class="VoiceInsights-Metric"
            shadow="none"
            :data-metric="metric.key"
          >
            <div class="VoiceInsights-MetricValue">
              <strong><TxTextMorph :text="metric.value" /></strong>
              <span v-if="metric.unit">{{ metric.unit }}</span>
            </div>
            <p>{{ metric.label }}</p>
          </TxCard>
        </div>
      </section>

      <!--
        Says the charts are coming, not that they are missing.
        Without it a shorter page is indistinguishable from a broken one, and the reader who saw
        a heatmap on someone else's screen has no way to tell which they are looking at.
      -->
      <p v-if="!showsWeeks" class="VoiceInsights-Tier" data-testid="voice-insights-tier-note">
        {{ t('voiceInsights.tiers.weeksPending') }}
      </p>

      <TxCard
        v-if="showsWeeks"
        class="VoiceInsights-Weeks"
        shadow="none"
        data-testid="voice-insights-weeks"
      >
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
      </TxCard>

      <TxCard class="VoiceInsights-Activity" shadow="none" data-testid="voice-insights-activity">
        <!--
          One heading. This card used to carry two, four words apart — "最近 365 个本地自然日的活动"
          over three streak tiles, then "最近 365 个本地自然日" over the calendar those tiles were
          counted from. The three tiles said the same number three times on a short record; they
          are one line now, under the one title.
        -->
        <div class="VoiceInsights-HeatmapHeader">
          <div>
            <h3>{{ t('voiceInsights.heatmap.title') }}</h3>
            <p v-if="insights" class="VoiceInsights-StreakLine">
              {{
                t('voiceInsights.streak.summary', {
                  current: numberFormatter.format(insights.currentStreak),
                  longest: numberFormatter.format(insights.longestStreak),
                  active: numberFormatter.format(insights.activeDays)
                })
              }}
            </p>
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
            <div class="VoiceInsights-HeatWeeks" :style="heatmapStyle">
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
      </TxCard>

      <TxCard class="VoiceInsights-Report" shadow="none" data-testid="voice-insights-report">
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
      </TxCard>
      <TxCard class="VoiceInsights-Records" shadow="none" data-testid="voice-insights-records">
        <header class="VoiceInsights-RecordsHeading">
          <div>
            <h3>{{ t('voiceInsights.records.title') }}</h3>
            <p>{{ t('voiceInsights.records.description') }}</p>
          </div>
          <TxButton
            variant="bare"
            type="danger"
            size="sm"
            :loading="recordsClearing"
            :disabled="records.length === 0 || recordsClearing || clearing"
            data-testid="voice-insights-records-clear"
            @click="clearRecords"
          >
            {{ t('voiceInsights.records.clear') }}
          </TxButton>
        </header>

        <div v-if="records.length === 0" class="VoiceInsights-RecordsEmpty">
          {{ t('voiceInsights.records.empty') }}
        </div>
        <div v-else class="VoiceInsights-RecordList">
          <details v-for="record in records" :key="record.id" class="VoiceInsights-Record">
            <summary>
              <span class="VoiceInsights-RecordSummaryMain">
                <strong>{{
                  record.text || record.rawText || t('voiceInsights.records.emptyText')
                }}</strong>
                <small>{{ recordDateLabel(record.capturedAt) }}</small>
              </span>
              <span class="VoiceInsights-RecordSummaryMeta">
                <span :data-status="record.status">{{ recordStatusLabel(record.status) }}</span>
                <span>{{ record.model || record.channel || '—' }}</span>
              </span>
            </summary>
            <div class="VoiceInsights-RecordDetails">
              <audio
                v-if="record.audioUrl"
                controls
                preload="none"
                :src="record.audioUrl"
                :aria-label="t('voiceInsights.records.audioLabel')"
              />
              <p class="VoiceInsights-RecordAudioMeta">{{ recordAudioLabel(record) }}</p>
              <dl>
                <div>
                  <dt>{{ t('voiceInsights.records.rawText') }}</dt>
                  <dd>{{ record.rawText || '—' }}</dd>
                </div>
                <div>
                  <dt>{{ t('voiceInsights.records.finalText') }}</dt>
                  <dd>{{ record.text || '—' }}</dd>
                </div>
                <div>
                  <dt>{{ t('voiceInsights.records.duration') }}</dt>
                  <dd>
                    {{ record.audioDurationMs ? formatDuration(record.audioDurationMs) : '—' }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('voiceInsights.records.recognitionDuration') }}</dt>
                  <dd>
                    {{
                      record.recognitionDurationMs
                        ? formatDuration(record.recognitionDurationMs)
                        : '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('voiceInsights.records.tokens') }}</dt>
                  <dd>{{ recordTokenLabel(record) }}</dd>
                </div>
                <div>
                  <dt>{{ t('voiceInsights.records.channel') }}</dt>
                  <dd>{{ record.channel || record.providerId || '—' }}</dd>
                </div>
                <div v-if="record.errorCode">
                  <dt>{{ t('voiceInsights.records.error') }}</dt>
                  <dd>{{ record.errorCode }}</dd>
                </div>
              </dl>
            </div>
          </details>
        </div>
      </TxCard>
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
/*
 * A section on a settings page, not a page.
 *
 * It kept the chrome from when it was one: its own scroll container, a full page's padding, and a
 * top inset for the window controls. Inside `SettingsPage` all three are already provided, so the
 * padding doubled into a band of blank above the first row and the second scroller clipped the
 * bottom of the page against a scrollbar nobody could see.
 */
.VoiceInsights {
  width: 100%;
  min-width: 0;
  color: var(--shell-text-primary);
}

/* Only the actions live here now, so they sit at the end rather than opposite a copy block. */
/*
 * The header row. It used to hold nothing but the buttons, right-aligned against an empty half —
 * which is what put a band of blank page between the title and the first number.
 */
.VoiceInsights-Hero {
  display: flex;
  gap: var(--shell-space-5);
  align-items: flex-end;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto var(--shell-space-5);
}

/* The heading never gives way; the row beside it wraps or truncates first. */
.VoiceInsights-HeroCopy {
  display: flex;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: var(--shell-space-1);

  h1 {
    margin: 0;
    font-size: var(--shell-fs-h1);
    font-weight: 600;
    line-height: 1.2;
    /* Chrome, and it sits in the window's drag strip where a stray selection is the usual result
       of trying to move the window. */
    user-select: none;
  }
}

.VoiceInsights-Eyebrow {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  font-weight: 600;
  user-select: none;
}

.VoiceInsights-Boundary {
  min-width: 0;
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.VoiceInsights-HeroActions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
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

/*
 * The stack the sections sit in. It used to be a dotted panel wrapping all of them — a card
 * holding cards, which is what put a second inset inside the page's own and left the metrics
 * floating on a texture while the calendar below them had a card of its own.
 */
.VoiceInsights-Canvas {
  display: flex;
  min-width: 0;
  max-width: 1440px;
  flex-direction: column;
  margin: 0 auto;
  gap: var(--shell-space-5);
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
}

.VoiceInsights-Hero2Label {
  display: flex;
  margin: 0;
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  gap: var(--shell-space-2);
}

/* Warning-coloured because the caveat is the point: the number under it is an estimate. */
.VoiceInsights-Hero2Basis {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--shell-warning);
  cursor: help;
}

.VoiceInsights-Hero2Value {
  display: flex;
  gap: var(--shell-space-3);
  align-items: baseline;
  flex-wrap: wrap;

  > strong {
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 600;
    line-height: 1.1;
  }

  > span {
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
  }

  /* The figure is the only part of the sentence anyone reads; the rest is scaffolding. */
  .VoiceInsights-Hero2Equivalent strong {
    color: var(--shell-text-primary);
    font-weight: 600;
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

/* Quiet on purpose: it explains an absence, and an absence should not shout. */
.VoiceInsights-Tier {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.VoiceInsights-MetricValue {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: baseline;
  min-width: 0;
  font-variant-numeric: tabular-nums;

  > strong {
    min-width: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  > span {
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-md);
    font-weight: 600;
  }
}

/*
 * The morph renders its own element inside the value, and it needs two things back.
 *
 * The rules above were descendant selectors, so `span` reached the morph's root and dressed the
 * figure in the unit's size, weight and colour — the number shrank to look like "字". And the
 * engine sets `vertical-align: top` on that root, which moves the row's baseline to the bottom
 * of an inline-block and drops the unit onto what looks like a second line. Both are only
 * visible in a browser: jsdom computes no layout, so nothing in the suite could see either.
 */
.VoiceInsights-MetricValue .tx-text-morph,
.VoiceInsights-Hero2Value .tx-text-morph {
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  vertical-align: baseline;
}

.VoiceInsights-Activity,
.VoiceInsights-Report {
  padding: var(--shell-space-6);
}

/* One line where three tiles used to be — on a short record all three read the same number. */
.VoiceInsights-StreakLine {
  margin: var(--shell-space-1) 0 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.VoiceInsights-HeatmapHeader {
  display: flex;
  gap: var(--shell-space-4);
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
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
/*
 * Renamed away from `VoiceInsights-Weeks`, which was also the 12-week bar card.
 *
 * One class, two unrelated things: the card picked up this grid — with a column count only the
 * calendar ever defines — and the calendar picked up the card's background, radius and shadow.
 * Both were wrong and neither looked like a typo.
 */
.VoiceInsights-HeatWeeks {
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
 * Sized by CSS, resolved by JS: the backing store is set from the element's own box times the
 * device ratio, so the curves are crisp on a retina display instead of scaled up from CSS pixels.
 * `color` is what the canvas strokes with, which is what keeps it on the theme.
 */
.VoiceInsights-Wave {
  position: absolute;
  width: 100%;
  height: 100%;
  color: var(--shell-primary);
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .VoiceInsights-Wave {
    opacity: 0.35;
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

/* The menu behind the dots. Plain buttons: a list of three needs no widget. */
.VoiceInsights-Menu {
  display: flex;
  flex-direction: column;
  gap: 2px;

  button {
    display: flex;
    align-items: center;
    padding: var(--shell-space-2) var(--shell-space-3);
    border: none;
    border-radius: var(--shell-radius-md);
    background: transparent;
    color: var(--shell-text-primary);
    font-family: inherit;
    font-size: var(--shell-fs-body);
    gap: var(--shell-space-3);
    cursor: pointer;
    text-align: left;

    &:hover:not(:disabled) {
      background: var(--shell-surface);
    }

    &:disabled {
      color: var(--shell-text-muted);
      cursor: not-allowed;
    }

    &.is-danger {
      color: var(--shell-danger);
    }
  }
}

/* The one irreversible item is fenced off from the two that are not. */
.VoiceInsights-MenuRule {
  height: 1px;
  margin: var(--shell-space-1) 0;
  background: var(--shell-border);
}

.VoiceInsights-Records {
  padding: var(--shell-space-6);
}

.VoiceInsights-RecordsHeading {
  display: flex;
  gap: var(--shell-space-4);
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: var(--shell-fs-lg);
  }

  p {
    max-width: 65ch;
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
  }
}

.VoiceInsights-RecordsEmpty {
  margin-top: var(--shell-space-4);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-body);
}

/*
 * `minmax(0, 1fr)`, not `1fr`.
 *
 * A grid item's default `min-width: auto` is its content's, and each record's title is a single
 * nowrap line. One long sentence pushed the track wider than the card and the whole list hung out
 * past its right edge — the ellipsis further down never got a chance, because nothing above it
 * was ever narrow enough to need one.
 */
.VoiceInsights-RecordList {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--shell-space-2);
  margin-top: var(--shell-space-4);
}

.VoiceInsights-Record {
  min-width: 0;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);

  summary {
    display: flex;
    gap: var(--shell-space-4);
    align-items: center;
    justify-content: space-between;
    padding: var(--shell-space-3) var(--shell-space-4);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }
}

.VoiceInsights-RecordSummaryMain,
.VoiceInsights-RecordSummaryMeta {
  display: flex;
  min-width: 0;
  gap: var(--shell-space-2);
  align-items: baseline;
}

.VoiceInsights-RecordSummaryMain {
  flex: 1 1 auto;
  flex-direction: column;

  strong {
    overflow: hidden;
    max-width: 100%;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-body);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }
}

.VoiceInsights-RecordSummaryMeta {
  flex: 0 0 auto;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.VoiceInsights-RecordDetails {
  display: grid;
  gap: var(--shell-space-3);
  padding: 0 var(--shell-space-4) var(--shell-space-4);

  audio {
    width: min(100%, 520px);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--shell-space-3) var(--shell-space-5);
    margin: 0;
  }

  dl > div {
    min-width: 0;
  }

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }

  dd {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}

.VoiceInsights-RecordAudioMeta {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

@media (max-width: 680px) {
  .VoiceInsights-Records {
    padding: var(--shell-space-5);
  }

  .VoiceInsights-RecordSummaryMeta {
    display: none;
  }

  .VoiceInsights-RecordDetails dl {
    grid-template-columns: minmax(0, 1fr);
  }
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
  .VoiceInsights-Activity,
  .VoiceInsights-Report {
    padding: var(--shell-space-5);
  }
}

@media (max-width: 680px) {
  .VoiceInsights-Hero,
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
