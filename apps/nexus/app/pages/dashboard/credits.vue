<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'
import { TxRadio, TxRadioGroup } from '@talex-touch/tuffex/radio'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { computed, ref } from 'vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'
import { useToast } from '~/composables/useToast'
import { requestJson, useTypedFetch } from '~/utils/request'

defineI18nRoute(false)

const { t, locale } = useI18n()
const toast = useToast()

const { data: summary, pending: summaryPending, refresh: refreshSummary } = useTypedFetch<any>('/api/credits/summary')
const { data: ledger, pending: ledgerPending, refresh: refreshLedger } = useTypedFetch<any[]>('/api/credits/ledger')
const { data: checkinStatus, pending: checkinPending, refresh: refreshCheckin } = useTypedFetch<any>('/api/credits/checkin/status')
const { data: checkinCalendar, pending: checkinCalendarPending, refresh: refreshCheckinCalendar } = useTypedFetch<any>('/api/credits/checkin/month')
const { data: models, pending: modelsPending, refresh: refreshModels } = useTypedFetch<any>('/api/credits/models')

type TrendWindowDays = 7 | 14 | 30

const creditTab = ref<'overview' | 'apis' | 'audits' | 'models'>('overview')
const trendWindowOptions: TrendWindowDays[] = [7, 14, 30]
const trendWindowDays = ref<TrendWindowDays>(7)
const checkinDialogVisible = ref(false)
const checkinTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const creditResetWindowMs = 30 * 24 * 60 * 60 * 1000
const { data: trend, pending: trendPending, refresh: refreshTrend } = useTypedFetch<any>('/api/credits/trend', {
  key: computed(() => `credits-trend-${trendWindowDays.value}`),
  query: computed(() => ({
    days: trendWindowDays.value,
  })),
})

const teamBalance = computed(() => summary.value?.team ?? null)
const userBalance = computed(() => summary.value?.user ?? null)
const teamContext = computed(() => summary.value?.teamContext ?? null)
const hasTeamPool = computed(() => teamContext.value?.type === 'organization' && teamContext.value?.hasTeamPool !== false)
const creditsSubtitle = computed(() => hasTeamPool.value
  ? t('dashboard.credits.subtitleWithTeam', '个人额度与团队池按月重置')
  : t('dashboard.credits.subtitle', '个人额度按月重置'))
const boost = computed(() => summary.value?.boost ?? null)
const boostRequirements = computed(() => boost.value?.requirements ?? {})
const canClaimBoost = computed(() => Boolean(boost.value?.canClaimNow))
const checkinToday = computed(() => Boolean(checkinStatus.value?.checkedInToday))
const checkinReward = computed(() => checkinStatus.value?.reward ?? 0)
const checkinDays = computed(() => new Set<string>((checkinCalendar.value?.days ?? []).filter(Boolean)))
const weekLabels = computed(() => ([
  t('dashboard.credits.signin.weekdays.sun', '日'),
  t('dashboard.credits.signin.weekdays.mon', '一'),
  t('dashboard.credits.signin.weekdays.tue', '二'),
  t('dashboard.credits.signin.weekdays.wed', '三'),
  t('dashboard.credits.signin.weekdays.thu', '四'),
  t('dashboard.credits.signin.weekdays.fri', '五'),
  t('dashboard.credits.signin.weekdays.sat', '六'),
]))
const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))

const calendarMonthKey = computed(() => {
  const month = checkinCalendar.value?.month
  if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month))
    return month
  const now = new Date()
  const year = now.getUTCFullYear()
  const monthIndex = `${now.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${monthIndex}`
})

const calendarLabel = computed(() => {
  const [yearText, monthText] = calendarMonthKey.value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (!Number.isFinite(year) || !Number.isFinite(month))
    return calendarMonthKey.value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat(localeTag.value, { year: 'numeric', month: 'long' }).format(date)
})

const calendarCells = computed(() => {
  const [yearText, monthText] = calendarMonthKey.value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return []
  }
  const monthIndex = month - 1
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const startDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const todayKey = new Date().toISOString().slice(0, 10)
  const cells = []
  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - startDay + 1
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push({
        day: null,
        key: `${calendarMonthKey.value}-${index}`,
        dateKey: null,
        checked: false,
        today: false,
      })
      continue
    }
    const dateKey = `${calendarMonthKey.value}-${`${dayNumber}`.padStart(2, '0')}`
    cells.push({
      day: dayNumber,
      key: dateKey,
      dateKey,
      checked: checkinDays.value.has(dateKey),
      today: todayKey === dateKey,
    })
  }
  return cells
})

const checkinCount = computed(() => checkinDays.value.size)

const userQuota = computed(() => userBalance.value?.quota ?? 0)
const creditUsageQuota = computed(() => userQuota.value)
const creditConsumptionEntries = computed(() => {
  const entries: Array<{ amount: number; date: Date | null }> = []
  for (const entry of ledger.value ?? []) {
    const delta = Number(entry?.delta)
    if (!Number.isFinite(delta) || delta >= 0)
      continue
    const date = entry?.created_at ? new Date(entry.created_at) : null
    entries.push({
      amount: Math.abs(delta),
      date: date && !Number.isNaN(date.getTime()) ? date : null,
    })
  }
  return entries
})
const consumedCredits = computed(() => creditConsumptionEntries.value.reduce((total, entry) => total + entry.amount, 0))
const creditUsagePercent = computed(() => {
  if (!creditUsageQuota.value)
    return 0
  return Math.min(100, Math.max(0, Math.round((consumedCredits.value / creditUsageQuota.value) * 100)))
})
const lastCreditUsageAt = computed(() => {
  let latest: Date | null = null
  for (const entry of creditConsumptionEntries.value) {
    if (!entry.date)
      continue
    if (!latest || entry.date.getTime() > latest.getTime())
      latest = entry.date
  }
  return latest
})
const nextCreditResetAt = computed(() => lastCreditUsageAt.value
  ? new Date(lastCreditUsageAt.value.getTime() + creditResetWindowMs)
  : null)
const nextCreditResetLabel = computed(() => {
  if (ledgerPending.value)
    return t('dashboard.credits.usage.resetLoading', '计算重置时间')
  if (!nextCreditResetAt.value)
    return t('dashboard.credits.usage.noUsageReset', '暂无使用记录')
  return t('dashboard.credits.usage.nextReset', { time: formatCreditResetTime(nextCreditResetAt.value) })
})

const trendTotalUsed = computed(() => trend.value?.totalUsed ?? 0)
const trendSubtitle = computed(() => t('dashboard.credits.trend.subtitle', { n: formatNumber(trendWindowDays.value) }))
const trendRangeLabels = computed(() => {
  const days = trend.value?.days ?? []
  if (!days.length)
    return ['', '', '']
  if (days.length === 1)
    return [days[0], days[0], days[0]]
  const middle = days[Math.floor(days.length / 2)]
  return [days[0], middle, days[days.length - 1]]
})
const trendSparkline = computed(() => {
  const values = trend.value?.values ?? []
  if (!values.length) {
    return { trend: '0%', values: [] }
  }
  const baseline = values[0] ?? 0
  const latest = values[values.length - 1] ?? 0
  const delta = latest - baseline
  const trendLabel = delta === 0
    ? '0%'
    : `${delta > 0 ? '+' : ''}${Math.round((delta / Math.max(1, baseline || 1)) * 100)}%`
  return {
    trend: trendLabel,
    values,
  }
})

const modelsRestricted = computed(() => Boolean(models.value?.restricted))
const modelGroups = computed(() => {
  const items = models.value?.models ?? []
  const map = new Map<string, {
    providerId: string
    provider: string
    providerType: string
    models: Array<{ id: string; multiplier: number }>
  }>()
  for (const item of items) {
    if (!map.has(item.providerId)) {
      map.set(item.providerId, {
        providerId: item.providerId,
        provider: item.provider,
        providerType: item.providerType,
        models: [],
      })
    }
    map.get(item.providerId)?.models.push({
      id: item.id,
      multiplier: item.multiplier,
    })
  }
  return Array.from(map.values())
})

const claimLoading = ref(false)
const checkinLoading = ref(false)

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number')
    return '0'
  return new Intl.NumberFormat().format(value)
}

function formatCreditAmount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return '0'
  return new Intl.NumberFormat().format(Math.abs(Math.round(value)))
}

function formatMultiplier(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return '1'
  const normalized = Number(value.toFixed(2))
  return `${normalized}`
}

function formatLedgerTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(localeTag.value)
}

function formatTrendWindowLabel(days: TrendWindowDays) {
  return t('dashboard.credits.trend.windowLabel', { n: days })
}

function formatCreditResetTime(value: Date) {
  return new Intl.DateTimeFormat(localeTag.value, {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value)
}

async function refreshOverview() {
  await Promise.all([
    refreshSummary(),
    refreshLedger(),
    refreshTrend(),
    refreshCheckin(),
    refreshCheckinCalendar(),
  ])
}

async function handleClaimBoost() {
  if (claimLoading.value)
    return
  claimLoading.value = true
  try {
    const res = await requestJson<{ claimed: boolean; reason?: string }>('/api/credits/claim', { method: 'POST' })
    if (res.claimed) {
      toast.success(t('dashboard.credits.boost.claimed', '已领取本月提升额度'))
    } else if (res.reason === 'already-claimed') {
      toast.info(t('dashboard.credits.boost.alreadyClaimed', '本月已领取过提升额度'))
    }
    await refreshSummary()
    await refreshLedger()
  }
  catch (error: any) {
    toast.error(t('dashboard.credits.boost.claimFailed', '领取提升额度失败'), error?.data?.statusMessage || error?.message)
  }
  finally {
    claimLoading.value = false
  }
}

async function handleCheckin() {
  if (checkinLoading.value)
    return
  checkinLoading.value = true
  try {
    const res = await requestJson<{ claimed: boolean; reward?: number }>('/api/credits/checkin', { method: 'POST' })
    if (res.claimed) {
      toast.success(t('dashboard.credits.checkin.claimed', '签到成功'), t('dashboard.credits.checkin.reward', { n: formatNumber(res.reward ?? checkinReward.value) }))
    } else {
      toast.info(t('dashboard.credits.checkin.already', '今日已签到'))
    }
    await refreshSummary()
    await refreshLedger()
    await refreshCheckin()
    await refreshCheckinCalendar()
  }
  catch (error: any) {
    toast.error(t('dashboard.credits.checkin.failed', '签到失败'), error?.data?.statusMessage || error?.message)
  }
  finally {
    checkinLoading.value = false
  }
}

function handleGoAccount() {
  navigateTo('/dashboard/account')
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.credits.title', 'AI 积分') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ creditsSubtitle }}
      </p>
    </header>

    <section class="apple-card-lg p-6">
      <TxTabs v-model="creditTab" placement="top" :content-scrollable="false">
        <TxTabItem name="overview">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-chart-line-smooth" aria-hidden="true" />
              <span>{{ t('dashboard.credits.tabs.overview', '概览') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <TxRadioGroup
                v-model="trendWindowDays"
                type="button"
                indicator-variant="glass"
                glass
              >
                <TxRadio
                  v-for="days in trendWindowOptions"
                  :key="days"
                  :value="days"
                  :label="formatTrendWindowLabel(days)"
                  class="min-w-14"
                >
                  {{ formatTrendWindowLabel(days) }}
                </TxRadio>
              </TxRadioGroup>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <TxButton
                  ref="checkinTriggerRef"
                  size="small"
                  variant="secondary"
                  :loading="checkinLoading || checkinPending"
                  @click="checkinDialogVisible = true"
                >
                  <span class="i-carbon-calendar text-sm" aria-hidden="true" />
                  {{ checkinToday ? t('dashboard.credits.checkin.done', '今日已签到') : t('dashboard.credits.checkin.cta', '签到领积分') }}
                </TxButton>
                <TxButton size="small" variant="secondary" @click="refreshOverview">
                  <span class="i-carbon-renew text-sm" aria-hidden="true" />
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div v-if="summaryPending" class="space-y-3">
                <div class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
                  <TxSpinner :size="16" />
                  {{ t('dashboard.credits.loading', '加载积分概览') }}
                </div>
                <TxSkeleton :loading="true" :lines="2" />
              </div>
              <div v-else class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.credits.usage.title', '额度使用') }}
                  </p>
                  <p class="text-xs font-medium text-black/45 dark:text-white/45">
                    {{ t('dashboard.credits.usage.consumed', { n: formatCreditAmount(consumedCredits) }) }}
                  </p>
                  <p class="text-sm font-semibold text-primary">
                    {{ t('dashboard.credits.usage.usedPercent', { n: creditUsagePercent }) }}
                  </p>
                </div>
                <TxProgressBar
                  class="credits-usage-progress"
                  :percentage="creditUsagePercent"
                  height="10px"
                  mask-background="glass"
                  flow-effect="shimmer"
                  tooltip
                  :tooltip-content="t('dashboard.credits.usage.usedPercent', { n: creditUsagePercent })"
                  :aria-label="t('dashboard.credits.usage.title', '额度使用')"
                />
                <p class="text-xs text-black/45 dark:text-white/45">
                  {{ nextCreditResetLabel }}
                </p>
              </div>
            </div>

            <div class="grid gap-4">
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <div class="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
                  <span>{{ t('dashboard.credits.trend.title', '消耗趋势') }}</span>
                  <span>{{ trendSparkline.trend }}</span>
                </div>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ t('dashboard.credits.usage.consumed', { n: formatCreditAmount(trendTotalUsed) }) }}
                </p>
                <p class="text-[11px] text-black/45 dark:text-white/45">
                  {{ trendSubtitle }}
                </p>

                <div v-if="trendPending" class="flex items-center justify-center py-6">
                  <TxSpinner :size="16" />
                </div>
                <div v-else-if="trendSparkline.values.length" class="mt-3">
                  <DashboardSparklineChart
                    :values="trendSparkline.values"
                    :labels="trendRangeLabels"
                    :height="96"
                    color="var(--tx-color-primary, #409eff)"
                    :aria-label="t('dashboard.credits.trend.title', '消耗趋势')"
                    show-grid
                  />
                  <div class="mt-2 flex items-center justify-between text-[11px] text-black/45 dark:text-white/45">
                    <span>{{ trendRangeLabels[0] }}</span>
                    <span>{{ trendRangeLabels[1] }}</span>
                    <span>{{ trendRangeLabels[2] }}</span>
                  </div>
                </div>
                <p v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.credits.trend.empty', '暂无趋势数据') }}
                </p>
              </div>
            </div>

            <div v-if="boost" class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <p class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.credits.boost.title', '认证提升额度') }}
              </p>
              <p class="mt-2 text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.credits.boost.subtitle', '完成邮箱验证、绑定 OAuth 与 Passkey 后会提升额度。') }}
              </p>
              <ul class="mt-3 space-y-1 text-xs text-black/45 dark:text-white/45">
                <li>
                  {{ t('dashboard.credits.boost.email', '邮箱验证') }}
                  <span class="ml-2">{{ boostRequirements?.emailVerified ? t('dashboard.credits.boost.ok', '已完成') : t('dashboard.credits.boost.pending', '未完成') }}</span>
                </li>
                <li>
                  {{ t('dashboard.credits.boost.oauth', 'OAuth 绑定') }}
                  <span class="ml-2">{{ boostRequirements?.oauthLinked ? t('dashboard.credits.boost.ok', '已完成') : t('dashboard.credits.boost.pending', '未完成') }}</span>
                </li>
                <li>
                  {{ t('dashboard.credits.boost.passkey', 'Passkey 绑定') }}
                  <span class="ml-2">{{ boostRequirements?.passkeyBound ? t('dashboard.credits.boost.ok', '已完成') : t('dashboard.credits.boost.pending', '未完成') }}</span>
                </li>
              </ul>
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <TxButton
                  v-if="boost?.eligible"
                  size="small"
                  :loading="claimLoading"
                  :disabled="!canClaimBoost"
                  @click="handleClaimBoost"
                >
                  {{
                    canClaimBoost
                      ? t('dashboard.credits.boost.claim', '领取本月提升额度')
                      : t('dashboard.credits.boost.claimedHint', '下月自动生效')
                  }}
                </TxButton>
                <TxButton
                  v-else
                  size="small"
                  variant="secondary"
                  @click="handleGoAccount"
                >
                  {{ t('dashboard.credits.boost.goBind', '前往绑定') }}
                </TxButton>
                <span
                  v-if="boost?.eligible && !canClaimBoost"
                  class="text-xs text-black/40 dark:text-white/40"
                >
                  {{ t('dashboard.credits.boost.alreadyClaimed', '本月已领取提升额度') }}
                </span>
              </div>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="apis">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-cloud-service-management" aria-hidden="true" />
              <span>{{ t('dashboard.credits.tabs.apis', 'APIs') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="rounded-2xl bg-black/[0.02] p-4 text-sm text-black/70 dark:bg-white/[0.03] dark:text-white/70">
              <p class="font-medium text-black dark:text-white">
                {{ t('dashboard.credits.apis.title', '开放接入') }}
              </p>
              <p class="mt-2 text-xs text-black/55 dark:text-white/55">
                {{ t('dashboard.credits.apis.subtitle', '插件与业务系统可通过 API/SDK 调用 AI 能力，额度仍按账户统一扣减。') }}
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.credits.apis.pluginTitle', '插件接入') }}
                </p>
                <p class="mt-2 text-xs text-black/55 dark:text-white/55">
                  {{ t('dashboard.credits.apis.pluginDesc', '通过插件或脚本调用内置模型，支持统一的额度与审计追踪。') }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.credits.apis.userTitle', '用户自定义 API') }}
                </p>
                <p class="mt-2 text-xs text-black/55 dark:text-white/55">
                  {{ t('dashboard.credits.apis.userDesc', '申请 API Key 后即可接入自有服务或自动化流程。') }}
                </p>
              </div>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="audits">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-document" aria-hidden="true" />
              <span>{{ t('dashboard.credits.tabs.audits', '审计') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.credits.audits.title', '积分审计日志') }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.credits.audits.subtitle', '记录每一次积分消耗与奖励变更') }}
                </p>
              </div>
              <TxButton size="small" variant="secondary" @click="() => { refreshSummary(); refreshLedger() }">
                {{ t('common.refresh', '刷新') }}
              </TxButton>
            </div>

            <div v-if="summaryPending || ledgerPending" class="space-y-3 py-4">
              <div class="flex items-center justify-center">
                <TxSpinner :size="18" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
            </div>

            <ul v-else-if="ledger?.length" class="space-y-2 text-sm">
              <li
                v-for="entry in ledger"
                :key="entry.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-black/[0.02] px-4 py-3 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
              >
                <div>
                  <p class="text-black dark:text-white">
                    {{ entry.reason }}
                  </p>
                  <p class="text-xs text-black/40 dark:text-white/40">
                    {{ formatLedgerTime(entry.created_at) }}
                  </p>
                </div>
                <span class="text-sm font-semibold text-black dark:text-white">
                  {{ entry.delta < 0 ? t('dashboard.credits.usage.entryConsumed', { n: formatCreditAmount(entry.delta) }) : t('dashboard.credits.usage.entryAdded', { n: formatCreditAmount(entry.delta) }) }}
                </span>
              </li>
            </ul>
            <p v-else class="text-sm text-black/40 dark:text-white/40">
              {{ t('dashboard.credits.empty', '暂无记录') }}
            </p>
          </div>
        </TxTabItem>

        <TxTabItem name="models">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-machine-learning-model" aria-hidden="true" />
              <span>{{ t('dashboard.credits.tabs.models', '模型') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.credits.models.title', '可用模型') }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.credits.models.subtitle', '当前账号可访问的模型与倍率') }}
                </p>
              </div>
              <TxButton size="small" variant="secondary" @click="() => { void refreshModels() }">
                {{ t('common.refresh', '刷新') }}
              </TxButton>
            </div>

            <div v-if="modelsRestricted" class="rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-200">
              {{ t('dashboard.credits.models.restricted', '检测到中国 IP，仅展示国内模型。') }}
            </div>

            <div v-if="modelsPending" class="flex items-center justify-center py-4">
              <TxSpinner :size="16" />
            </div>

            <div v-else-if="modelGroups.length" class="space-y-3">
              <div
                v-for="group in modelGroups"
                :key="group.providerId"
                class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]"
              >
                <div class="flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                  <span class="text-sm font-medium text-black dark:text-white">{{ group.provider }}</span>
                  <span>{{ group.providerType }}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2 text-xs">
                  <span
                    v-for="model in group.models"
                    :key="`${group.providerId}-${model.id}`"
                    class="rounded-full bg-black/[0.06] px-3 py-1 text-black/70 dark:bg-white/[0.08] dark:text-white/70"
                  >
                    {{ model.id }}
                    <span class="ml-2 text-black/45 dark:text-white/45">
                      x{{ formatMultiplier(model.multiplier) }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <p v-else class="text-sm text-black/40 dark:text-white/40">
              {{ t('dashboard.credits.models.empty', '暂无可用模型') }}
            </p>
          </div>
        </TxTabItem>
      </TxTabs>
    </section>

    <FlipDialog
      v-model="checkinDialogVisible"
      :reference="checkinTriggerRef?.$el || null"
      size="md"
      max-height="calc(86dvh - 24px)"
    >
      <template #default="{ close }">
        <div class="space-y-4 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-black dark:text-white">
                {{ t('dashboard.credits.signin.title', '签到日历') }}
              </h2>
              <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.credits.signin.subtitle', { n: formatNumber(checkinReward) }) }}
              </p>
            </div>
            <TxButton size="small" variant="secondary" @click="close">
              {{ t('common.close', '关闭') }}
            </TxButton>
          </div>

          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-black/50 dark:text-white/50">
              <span class="text-sm font-medium text-black dark:text-white">
                {{ calendarLabel }}
              </span>
              <span>{{ t('dashboard.credits.signin.total', { n: formatNumber(checkinCount) }) }}</span>
            </div>

            <div class="mt-3 grid grid-cols-7 gap-2 text-[11px] text-black/40 dark:text-white/40">
              <span v-for="label in weekLabels" :key="label" class="text-center">
                {{ label }}
              </span>
            </div>

            <div v-if="checkinCalendarPending" class="flex items-center justify-center py-6">
              <TxSpinner :size="16" />
            </div>
            <div v-else class="mt-2 grid grid-cols-7 gap-2 text-xs">
              <div
                v-for="cell in calendarCells"
                :key="cell.key"
                class="flex h-9 items-center justify-center rounded-lg"
                :class="[
                  cell.day ? 'text-black/80 dark:text-white/80' : 'text-black/20 dark:text-white/20',
                  cell.checked ? 'bg-primary/15 text-primary' : 'bg-black/[0.04] dark:bg-white/[0.05]',
                  cell.today && !cell.checked ? 'ring-1 ring-primary/40' : '',
                ]"
              >
                <span>{{ cell.day || '' }}</span>
              </div>
            </div>

            <p class="mt-3 text-[11px] text-black/45 dark:text-white/45">
              {{ t('dashboard.credits.checkin.today', '按 UTC 日期计算') }}
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-3">
            <TxButton size="small" variant="secondary" @click="close">
              {{ t('common.cancel', '取消') }}
            </TxButton>
            <TxButton
              size="small"
              :loading="checkinLoading || checkinPending"
              :disabled="checkinToday"
              @click="handleCheckin"
            >
              {{ checkinToday ? t('dashboard.credits.checkin.done', '今日已签到') : t('dashboard.credits.checkin.cta', '签到领积分') }}
            </TxButton>
          </div>
        </div>
      </template>
    </FlipDialog>
  </div>
</template>

<style scoped>
.credits-usage-progress :deep(.tx-progress-bar__track) {
  background: rgba(148, 163, 184, 0.18);
}

.credits-usage-progress :deep(.tx-progress-bar__mask) {
  background: rgba(148, 163, 184, 0.26);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.credits-usage-progress :deep(.tx-progress-bar__track::after) {
  border-color: rgba(148, 163, 184, 0.32);
}

:global(.dark) .credits-usage-progress :deep(.tx-progress-bar__track) {
  background: rgba(148, 163, 184, 0.2);
}

:global(.dark) .credits-usage-progress :deep(.tx-progress-bar__mask) {
  background: rgba(148, 163, 184, 0.28);
}
</style>
