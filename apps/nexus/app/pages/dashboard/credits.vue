<script setup lang="ts">
import { TxButton, TxStatCard, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useToast } from '~/composables/useToast'

defineI18nRoute(false)

const { t } = useI18n()
const toast = useToast()

const { data: summary, pending: summaryPending, refresh: refreshSummary } = useFetch<any>('/api/credits/summary')
const { data: ledger, pending: ledgerPending, refresh: refreshLedger } = useFetch<any[]>('/api/credits/ledger')
const { data: checkinStatus, pending: checkinPending, refresh: refreshCheckin } = useFetch<any>('/api/credits/checkin/status')
const { data: checkinCalendar, pending: checkinCalendarPending, refresh: refreshCheckinCalendar } = useFetch<any>('/api/credits/checkin/month')
const { data: trend, pending: trendPending, refresh: refreshTrend } = useFetch<any>('/api/credits/trend')
const { data: models, pending: modelsPending, refresh: refreshModels } = useFetch<any>('/api/credits/models')

const creditTab = ref<'overview' | 'signin' | 'apis' | 'audits' | 'models'>('overview')

const teamBalance = computed(() => summary.value?.team ?? null)
const userBalance = computed(() => summary.value?.user ?? null)
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
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' }).format(date)
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
const userUsed = computed(() => userBalance.value?.used ?? 0)
const userRemaining = computed(() => Math.max(0, userQuota.value - userUsed.value))
const teamQuota = computed(() => teamBalance.value?.quota ?? 0)
const teamUsed = computed(() => teamBalance.value?.used ?? 0)
const teamRemaining = computed(() => Math.max(0, teamQuota.value - teamUsed.value))
const totalQuota = computed(() => userQuota.value + teamQuota.value)
const personalShare = computed(() => {
  const total = totalQuota.value
  if (!total)
    return 0
  return userQuota.value / total
})
const personalSharePercent = computed(() => Math.round(personalShare.value * 100))
const personalShareDash = computed(() => `${personalSharePercent.value} ${100 - personalSharePercent.value}`)

const trendTotalUsed = computed(() => trend.value?.totalUsed ?? 0)
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
    return { line: '', area: '', trend: '0%' }
  }
  const baseline = values[0] ?? 0
  const latest = values[values.length - 1] ?? 0
  const delta = latest - baseline
  const trendLabel = delta === 0
    ? '0%'
    : `${delta > 0 ? '+' : ''}${Math.round((delta / Math.max(1, baseline || 1)) * 100)}%`
  const chart = normalizeSparkline(values, 280, 72)
  return {
    line: chart.line,
    area: chart.area,
    trend: trendLabel,
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

function normalizeSparkline(values: number[], width: number, height: number): { line: string, area: string } {
  if (!values.length) {
    return { line: '', area: '' }
  }

  const max = Math.max(1, ...values)
  const stepX = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => {
    const x = Number((index * stepX).toFixed(2))
    const y = Number((height - (value / max) * height).toFixed(2))
    return { x, y }
  })
  const line = points.map(point => `${point.x},${point.y}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return { line, area }
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number')
    return '0'
  return new Intl.NumberFormat().format(value)
}

function formatMultiplier(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return '1'
  const normalized = Number(value.toFixed(2))
  return `${normalized}`
}

function formatLedgerTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function handleClaimBoost() {
  if (claimLoading.value)
    return
  claimLoading.value = true
  try {
    const res = await $fetch<{ claimed: boolean; reason?: string }>('/api/credits/claim', { method: 'POST' })
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
    const res = await $fetch<{ claimed: boolean; reward?: number }>('/api/credits/checkin', { method: 'POST' })
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
        {{ t('dashboard.credits.subtitle', '个人额度与团队池按月重置') }}
      </p>
    </header>

    <section v-if="summaryPending" class="apple-card-lg p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
        <TxSpinner :size="16" />
        {{ t('dashboard.credits.loading', '加载积分概览') }}
      </div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in 4" :key="`credits-skeleton-${item}`" class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
    </section>

    <section v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <TxStatCard
        :value="formatNumber(userRemaining)"
        :label="t('dashboard.credits.stats.personalRemaining', '个人剩余')"
        icon-class="i-carbon-user text-5xl text-[var(--tx-color-primary)] sm:text-6xl"
      >
        <template #label>
          <div class="space-y-1">
            <span class="block">{{ t('dashboard.credits.stats.personalRemaining', '个人剩余') }}</span>
            <span class="block text-[11px] text-black/45 dark:text-white/45">
              {{ t('dashboard.credits.stats.personalTotal', { n: formatNumber(userQuota) }) }}
            </span>
          </div>
        </template>
      </TxStatCard>

      <TxStatCard
        :value="formatNumber(teamRemaining)"
        :label="t('dashboard.credits.stats.teamRemaining', '团队池剩余')"
        icon-class="i-carbon-group text-5xl text-[var(--tx-color-success)] sm:text-6xl"
      >
        <template #label>
          <div class="space-y-1">
            <span class="block">{{ t('dashboard.credits.stats.teamRemaining', '团队池剩余') }}</span>
            <span class="block text-[11px] text-black/45 dark:text-white/45">
              {{ t('dashboard.credits.stats.teamTotal', { n: formatNumber(teamQuota) }) }}
            </span>
          </div>
        </template>
      </TxStatCard>

      <TxStatCard
        :value="formatNumber(userUsed)"
        :label="t('dashboard.credits.stats.used', '本月已用')"
        icon-class="i-carbon-chart-line-smooth text-5xl text-[var(--tx-color-warning)] sm:text-6xl"
      >
        <template #label>
          <div class="space-y-1">
            <span class="block">{{ t('dashboard.credits.stats.used', '本月已用') }}</span>
            <span class="block text-[11px] text-black/45 dark:text-white/45">
              {{ t('dashboard.credits.stats.usedHint', { n: formatNumber(userQuota) }) }}
            </span>
          </div>
        </template>
      </TxStatCard>

      <TxStatCard
        :value="`${personalSharePercent}%`"
        :label="t('dashboard.credits.stats.personalShare', '个人占比')"
        icon-class="i-carbon-pie-chart text-5xl text-[var(--tx-color-info)] sm:text-6xl"
      >
        <template #label>
          <div class="space-y-1">
            <span class="block">{{ t('dashboard.credits.stats.personalShare', '个人占比') }}</span>
            <span class="block text-[11px] text-black/45 dark:text-white/45">
              {{ t('dashboard.credits.stats.shareHint', { personal: formatNumber(userQuota), total: formatNumber(totalQuota) }) }}
            </span>
          </div>
        </template>
      </TxStatCard>
    </section>

    <section v-if="boost" class="apple-card-lg p-6">
      <p class="apple-section-title">
        {{ t('dashboard.credits.boost.title', '认证提升额度') }}
      </p>
      <p class="mt-2 text-xs text-black/50 dark:text-white/50">
        {{ t('dashboard.credits.boost.subtitle', '完成邮箱验证、绑定 OAuth 与 Passkey 后，个人额度提升至 {n}。', { n: formatNumber(boost?.boostedQuota ?? 0) }) }}
      </p>
      <ul class="mt-3 space-y-1 text-xs text-black/40 dark:text-white/40">
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
              : t('dashboard.credits.boost.claimedHint', '下月自动 {n}', { n: formatNumber(boost?.boostedQuota ?? 0) })
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
    </section>

    <section class="apple-card-lg p-6">
      <TxTabs v-model="creditTab" placement="top" :content-scrollable="false">
        <TxTabItem name="overview" icon-class="i-carbon-chart-line-smooth">
          <template #name>
            {{ t('dashboard.credits.tabs.overview', '概览') }}
          </template>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <TxButton size="small" variant="secondary" @click="() => { refreshSummary(); refreshTrend() }">
                {{ t('common.refresh', '刷新') }}
              </TxButton>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <div class="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
                  <span>{{ t('dashboard.credits.trend.title', '消耗趋势') }}</span>
                  <span>{{ trendSparkline.trend }}</span>
                </div>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ formatNumber(trendTotalUsed) }}
                </p>
                <p class="text-[11px] text-black/45 dark:text-white/45">
                  {{ t('dashboard.credits.trend.subtitle', '最近 14 天累计消耗') }}
                </p>

                <div v-if="trendPending" class="flex items-center justify-center py-6">
                  <TxSpinner :size="16" />
                </div>
                <div v-else-if="trend?.values?.length" class="mt-3">
                  <svg viewBox="0 0 280 72" preserveAspectRatio="none" class="h-24 w-full">
                    <polygon
                      :points="trendSparkline.area"
                      style="fill: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);"
                    />
                    <polyline
                      :points="trendSparkline.line"
                      style="fill: none; stroke: var(--tx-color-primary, #409eff); stroke-width: 2;"
                    />
                  </svg>
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

              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <div class="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
                  <span>{{ t('dashboard.credits.share.title', '个人占比') }}</span>
                  <span>{{ t('dashboard.credits.share.subtitle', { personal: formatNumber(userQuota), total: formatNumber(totalQuota) }) }}</span>
                </div>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ personalSharePercent }}%
                </p>
                <div class="mt-4 flex items-center gap-4">
                  <svg viewBox="0 0 36 36" class="h-20 w-20">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      pathLength="100"
                      class="text-black/10 dark:text-white/10"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      pathLength="100"
                      class="text-primary"
                      :stroke-dasharray="personalShareDash"
                      stroke-dashoffset="25"
                    />
                  </svg>
                  <div class="space-y-2 text-xs text-black/50 dark:text-white/50">
                    <div class="flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full bg-[var(--tx-color-primary)]" />
                      {{ t('dashboard.credits.share.personal', { n: formatNumber(userQuota) }) }}
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full bg-black/20 dark:bg-white/20" />
                      {{ t('dashboard.credits.share.team', { n: formatNumber(teamQuota) }) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="signin" icon-class="i-carbon-calendar">
          <template #name>
            {{ t('dashboard.credits.tabs.signin', '签到') }}
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.credits.signin.title', '签到日历') }}
                </p>
                <p class="text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.credits.signin.subtitle', { n: formatNumber(checkinReward) }) }}
                </p>
              </div>
              <TxButton
                size="small"
                :loading="checkinLoading || checkinPending"
                :disabled="checkinToday"
                @click="handleCheckin"
              >
                {{ checkinToday ? t('dashboard.credits.checkin.done', '今日已签到') : t('dashboard.credits.checkin.cta', '签到领积分') }}
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
          </div>
        </TxTabItem>

        <TxTabItem name="apis" icon-class="i-carbon-cloud-service-management">
          <template #name>
            {{ t('dashboard.credits.tabs.apis', 'APIs') }}
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

        <TxTabItem name="audits" icon-class="i-carbon-document">
          <template #name>
            {{ t('dashboard.credits.tabs.audits', '审计') }}
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
                  {{ entry.delta }}
                </span>
              </li>
            </ul>
            <p v-else class="text-sm text-black/40 dark:text-white/40">
              {{ t('dashboard.credits.empty', '暂无记录') }}
            </p>
          </div>
        </TxTabItem>

        <TxTabItem name="models" icon-class="i-carbon-machine-learning-model">
          <template #name>
            {{ t('dashboard.credits.tabs.models', '模型') }}
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
              <TxButton size="small" variant="secondary" @click="refreshModels">
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
  </div>
</template>
