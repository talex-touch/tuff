<script setup lang="ts">
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'

definePageMeta({
  layout: 'dashboard',
})
defineI18nRoute(false)

const { t } = useI18n()

interface StorageStatusResponse {
  plan_tier: string
  keyring_count: number
  generated_at: string
  quotas: {
    plan_tier: string
    limits: {
      storage_limit_bytes: number
      object_limit: number
      item_limit: number
      device_limit: number
    }
    usage: {
      used_storage_bytes: number
      used_objects: number
      used_devices: number
    }
  }
  keyrings: Array<{
    keyring_id: string
    device_id: string
    key_type: string
    rotated_at: string | null
    created_at: string
    has_recovery_code: boolean
  }>
  session: null | {
    device_id: string
    expires_at: string
    last_cursor: number
    last_push_at: string | null
    last_pull_at: string | null
    last_error_code: string | null
  }
}

interface StorageRecentSessionsResponse {
  sessions: Array<{
    cursor: number
    device_id: string
    item_id: string
    op_type: 'upsert' | 'delete'
    updated_at: string
    payload_size: number
    status: 'success' | 'failed'
    error_code: string | null
  }>
  generated_at: string
}

interface StorageDetailsResponse {
  summary: {
    total_items: number
    live_items: number
    deleted_items: number
    total_payload_bytes: number
    last_updated_at: string
  }
  categories: Array<{
    key: string
    label: string
    count: number
    total_payload_bytes: number
    last_updated_at: string
    sample_items: string[]
  }>
  items: Array<{
    item_id: string
    type: string
    qualified_name: string | null
    category: string
    category_label: string
    payload_size: number
    updated_at: string
    deleted_at: string | null
    has_payload_enc: boolean
    has_payload_ref: boolean
  }>
  generated_at: string
}

const { data, pending, error, refresh } = await useAsyncData<StorageStatusResponse | null>(
  'dashboard-storage-status',
  async () => await $fetch<StorageStatusResponse>('/api/dashboard/storage/status'),
  {
    default: () => null,
    server: false,
  },
)

const {
  data: recentSessionsData,
  pending: recentSessionsPending,
  error: recentSessionsError,
  refresh: refreshRecentSessions
} = await useAsyncData<StorageRecentSessionsResponse>(
  'dashboard-storage-recent-sessions',
  async () =>
    await $fetch<StorageRecentSessionsResponse>('/api/dashboard/storage/sessions', {
      query: { limit: 24 }
    }),
  {
    default: () => ({ sessions: [], generated_at: '' }),
    server: false,
  }
)

const planTier = computed(() => data.value?.plan_tier ?? 'FREE')
const keyringCount = computed(() => data.value?.keyring_count ?? 0)
const quotas = computed(() => data.value?.quotas ?? null)
const keyrings = computed(() => data.value?.keyrings ?? [])
const session = computed(() => data.value?.session ?? null)
const recentSessions = computed(() => recentSessionsData.value?.sessions ?? [])

const storageUsagePercent = computed(() => {
  const quota = quotas.value
  if (!quota || quota.limits.storage_limit_bytes <= 0) {
    return 0
  }
  const ratio = quota.usage.used_storage_bytes / quota.limits.storage_limit_bytes
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
})

const deviceUsagePercent = computed(() => {
  const quota = quotas.value
  if (!quota || quota.limits.device_limit <= 0) {
    return 0
  }
  const ratio = quota.usage.used_devices / quota.limits.device_limit
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
})

const statusErrorText = computed(() => {
  const err = error.value as { data?: { statusMessage?: unknown }, message?: unknown } | null
  const statusMessage = typeof err?.data?.statusMessage === 'string' ? err.data.statusMessage : ''
  const message = typeof err?.message === 'string' ? err.message : ''
  return statusMessage || message || ''
})

const sessionsErrorText = computed(() => {
  const err = recentSessionsError.value as { data?: { statusMessage?: unknown }, message?: unknown } | null
  const statusMessage = typeof err?.data?.statusMessage === 'string' ? err.data.statusMessage : ''
  const message = typeof err?.message === 'string' ? err.message : ''
  return statusMessage || message || ''
})

const systemOperational = computed(() => !statusErrorText.value && !session.value?.last_error_code)
const systemStatusLabel = computed(() =>
  systemOperational.value
    ? t('dashboard.storage.systemOperational', 'System Operational')
    : t('dashboard.storage.systemAttention', 'Needs Attention')
)
const systemStatusClass = computed(() =>
  systemOperational.value ? 'StorageSystemStatus--healthy' : 'StorageSystemStatus--warn'
)

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = unitIndex <= 1 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-'
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }
  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }
  const diffMs = Date.now() - timestamp
  const absMs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (absMs < minute) {
    return t('dashboard.storage.justNow', '刚刚')
  }
  if (absMs < hour) {
    const minutes = Math.round(absMs / minute)
    return `${minutes}${t('dashboard.storage.minutesAgo', ' 分钟前')}`
  }
  if (absMs < day) {
    const hours = Math.round(absMs / hour)
    return `${hours}${t('dashboard.storage.hoursAgo', ' 小时前')}`
  }
  const days = Math.round(absMs / day)
  return `${days}${t('dashboard.storage.daysAgo', ' 天前')}`
}

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
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return { line, area }
}

const storageSparkline = computed(() => {
  const days: string[] = []
  const counts = new Map<string, number>()
  const now = new Date()

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - index)
    const key = date.toISOString().slice(0, 10)
    days.push(key)
    counts.set(key, 0)
  }

  for (const item of recentSessions.value) {
    const key = item.updated_at.slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const values = days.map((key) => counts.get(key) ?? 0)
  const baseline = values[0] ?? 0
  const latest = values[values.length - 1] ?? 0
  const delta = latest - baseline
  const trend = delta === 0 ? '0%' : `${delta > 0 ? '+' : ''}${Math.round((delta / Math.max(1, baseline || 1)) * 100)}%`
  const chart = normalizeSparkline(values, 280, 64)

  return {
    line: chart.line,
    area: chart.area,
    trend,
    values,
  }
})

const connectionSparkline = computed(() => {
  const samples = recentSessions.value.slice(0, 12).map((item) => (item.status === 'failed' ? 32 : 100))
  const values =
    samples.length > 0
      ? samples.reverse()
      : [90, 92, 91, 93, 95, 94, 96, 95, 94, 96, 97, 98]
  const chart = normalizeSparkline(values, 280, 54)
  const failedCount = recentSessions.value.slice(0, 12).filter((item) => item.status === 'failed').length
  const healthLabel =
    failedCount === 0
      ? t('dashboard.storage.connectionStable', 'Stable')
      : failedCount <= 2
      ? t('dashboard.storage.connectionWarning', 'Attention')
      : t('dashboard.storage.connectionUnstable', 'Unstable')
  return {
    line: chart.line,
    area: chart.area,
    healthLabel,
  }
})

function maskDeviceId(deviceId: string): string {
  const normalized = deviceId.trim()
  if (normalized.length <= 14) {
    return normalized
  }
  return `${normalized.slice(0, 7)}...${normalized.slice(-6)}`
}

function resolveSessionType(item: StorageRecentSessionsResponse['sessions'][number]): string {
  return item.op_type === 'delete'
    ? t('dashboard.storage.sessionTypeDelete', 'Delete')
    : t('dashboard.storage.sessionTypePush', 'Push')
}

function resolveSessionTypeIcon(item: StorageRecentSessionsResponse['sessions'][number]): string {
  return item.op_type === 'delete' ? 'i-carbon-trash-can' : 'i-carbon-arrow-up-right'
}

function resolveSessionStatusText(item: StorageRecentSessionsResponse['sessions'][number]): string {
  return item.status === 'failed'
    ? t('dashboard.storage.statusFailed', 'Failed')
    : t('dashboard.storage.statusSuccess', 'Success')
}

function resolveSessionStatusClass(item: StorageRecentSessionsResponse['sessions'][number]): string {
  return item.status === 'failed'
    ? 'StorageSessionStatusBadge--failed'
    : 'StorageSessionStatusBadge--success'
}

async function refreshAll(): Promise<void> {
  await Promise.all([refresh(), refreshRecentSessions()])
  if (showDetailsOverlay.value) {
    await loadSyncDetails(true)
  }
}

const showDetailsOverlay = ref(false)
const detailsOverlaySource = ref<HTMLElement | null>(null)
const detailsLoading = ref(false)
const detailsError = ref('')
const detailsData = ref<StorageDetailsResponse | null>(null)

const syncDetailSummary = computed(() => detailsData.value?.summary ?? null)
const syncDetailCategories = computed(() => detailsData.value?.categories ?? [])
const syncDetailItems = computed(() => detailsData.value?.items ?? [])

function resolveFetchErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return t('dashboard.storage.detailLoadFailed', '加载失败，请稍后重试')
  }
  const withData = error as { data?: { statusMessage?: unknown }, message?: unknown }
  const statusMessage = typeof withData.data?.statusMessage === 'string' ? withData.data.statusMessage : ''
  const message = typeof withData.message === 'string' ? withData.message : ''
  return statusMessage || message || t('dashboard.storage.detailLoadFailed', '加载失败，请稍后重试')
}

function openSyncDetails(source?: HTMLElement | null): void {
  detailsOverlaySource.value = source ?? null
  showDetailsOverlay.value = true
}

function handleOpenSyncDetails(event?: MouseEvent): void {
  const source = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  openSyncDetails(source)
}

async function loadSyncDetails(force = false): Promise<void> {
  if (detailsLoading.value) {
    return
  }
  if (detailsData.value && !force) {
    return
  }

  detailsLoading.value = true
  detailsError.value = ''
  try {
    detailsData.value = await $fetch<StorageDetailsResponse>('/api/dashboard/storage/details', {
      query: { limit: 120 }
    })
  } catch (error) {
    detailsError.value = resolveFetchErrorMessage(error)
  } finally {
    detailsLoading.value = false
  }
}

function refreshSyncDetails(): void {
  void loadSyncDetails(true)
}

function resolveItemName(item: StorageDetailsResponse['items'][number]): string {
  if (item.qualified_name) {
    return item.qualified_name
  }
  return item.item_id
}

function resolveItemStatus(item: StorageDetailsResponse['items'][number]): string {
  return item.deleted_at
    ? t('dashboard.storage.itemDeleted', '已删除')
    : t('dashboard.storage.itemActive', '生效中')
}

function resolveCategoryTone(categoryKey: string): string {
  if (categoryKey === 'settings') {
    return 'StorageDetailOverlay-Tone--blue'
  }
  if (categoryKey === 'plugin') {
    return 'StorageDetailOverlay-Tone--violet'
  }
  if (categoryKey === 'launcher') {
    return 'StorageDetailOverlay-Tone--emerald'
  }
  if (categoryKey === 'intelligence') {
    return 'StorageDetailOverlay-Tone--amber'
  }
  if (categoryKey === 'blob') {
    return 'StorageDetailOverlay-Tone--rose'
  }
  return 'StorageDetailOverlay-Tone--slate'
}

watch(showDetailsOverlay, (open) => {
  if (open) {
    void loadSyncDetails(false)
  }
})
</script>

<template>
  <div class="StoragePage space-y-8">
    <header class="StorageHero">
      <div class="space-y-2">
        <h1 class="StorageHero-Title">
          {{ t('dashboard.storage.title', 'Storage & Sync') }}
        </h1>
        <p class="StorageHero-Desc">
          {{
            t(
              'dashboard.storage.description',
              'Manage synchronization quotas, connected devices, and view active logs.'
            )
          }}
        </p>
      </div>

      <div class="StorageHero-Actions">
        <span class="StorageSystemStatus" :class="systemStatusClass">
          <span class="StorageSystemStatus-Dot" />
          {{ systemStatusLabel }}
        </span>
        <TxButton variant="flat" size="sm" :loading="pending || recentSessionsPending" @click="refreshAll">
          {{ t('common.refresh', 'Refresh') }}
        </TxButton>
        <TxButton variant="flat" size="sm" @click="handleOpenSyncDetails">
          {{ t('dashboard.storage.viewSyncDetails', '查看同步内容') }}
        </TxButton>
      </div>
    </header>

    <section class="StorageMetricsGrid">
      <article class="StorageMetricCard">
        <div class="StorageMetricCard-Head">
          <div>
            <p class="StorageMetricCard-Label">
              {{ t('dashboard.storage.syncStorage', 'Sync Storage') }}
            </p>
            <p class="StorageMetricCard-Value">
              {{
                quotas
                  ? `${formatBytes(quotas.usage.used_storage_bytes)} / ${formatBytes(quotas.limits.storage_limit_bytes)}`
                  : '-'
              }}
            </p>
          </div>
          <span class="StorageMetricCard-Icon i-carbon-cloud" />
        </div>

        <div class="StorageProgress">
          <div class="StorageProgress-Track">
            <div class="StorageProgress-Bar StorageProgress-Bar--blue" :style="{ width: `${storageUsagePercent}%` }" />
          </div>
          <div class="StorageProgress-Foot">
            <span>{{ storageUsagePercent }}% {{ t('dashboard.storage.used', 'used') }}</span>
            <span>{{ t('dashboard.storage.plan', 'Plan') }}: {{ planTier }}</span>
          </div>
        </div>

        <div class="StorageMiniChart">
          <div class="StorageMiniChart-Head">
            <span>{{ t('dashboard.storage.activity7Day', '7-Day Activity') }}</span>
            <span class="StorageMiniChart-Trend">{{ storageSparkline.trend }}</span>
          </div>
          <svg viewBox="0 0 280 64" preserveAspectRatio="none" class="StorageMiniChart-Svg">
            <polygon :points="storageSparkline.area" class="StorageMiniChart-Area StorageMiniChart-Area--blue" />
            <polyline :points="storageSparkline.line" class="StorageMiniChart-Line StorageMiniChart-Line--blue" />
          </svg>
        </div>
      </article>

      <article class="StorageMetricCard">
        <div class="StorageMetricCard-Head">
          <div>
            <p class="StorageMetricCard-Label">
              {{ t('dashboard.storage.authorizedDevices', 'Authorized Devices') }}
            </p>
            <p class="StorageMetricCard-Value">
              {{ quotas ? `${quotas.usage.used_devices} / ${quotas.limits.device_limit}` : '-' }}
              <span class="StorageMetricCard-SubValue">{{ t('dashboard.storage.slots', 'Slots') }}</span>
            </p>
          </div>
          <span class="StorageMetricCard-Icon StorageMetricCard-Icon--violet i-carbon-laptop" />
        </div>

        <div class="StorageProgress">
          <div class="StorageProgress-Track">
            <div class="StorageProgress-Bar StorageProgress-Bar--violet" :style="{ width: `${deviceUsagePercent}%` }" />
          </div>
          <div class="StorageProgress-Foot">
            <span>{{ deviceUsagePercent }}% {{ t('dashboard.storage.capacity', 'capacity') }}</span>
            <NuxtLink to="/dashboard/devices" class="StorageLink">
              {{ t('dashboard.storage.manageDevices', 'Manage Slots') }}
            </NuxtLink>
          </div>
        </div>

        <div class="StorageMiniChart">
          <div class="StorageMiniChart-Head">
            <span>{{ t('dashboard.storage.activeConnections', 'Active Connections') }}</span>
            <span class="StorageMiniChart-Trend">{{ connectionSparkline.healthLabel }}</span>
          </div>
          <svg viewBox="0 0 280 54" preserveAspectRatio="none" class="StorageMiniChart-Svg">
            <polygon :points="connectionSparkline.area" class="StorageMiniChart-Area StorageMiniChart-Area--violet" />
            <polyline
              :points="connectionSparkline.line"
              class="StorageMiniChart-Line StorageMiniChart-Line--violet"
            />
          </svg>
        </div>
      </article>
    </section>

    <section class="StoragePanel">
      <header class="StoragePanel-Head">
        <h2 class="StoragePanel-Title">
          {{ t('dashboard.storage.recentSessions', 'Recent Sync Sessions') }}
        </h2>
        <span class="StoragePanel-Badge">{{ t('dashboard.storage.last24Hours', 'Last 24 Hours') }}</span>
      </header>

      <p v-if="sessionsErrorText" class="StoragePanel-Error">
        {{ sessionsErrorText }}
      </p>

      <div class="StorageSessionTableWrap">
        <table class="StorageSessionTable">
          <thead>
            <tr>
              <th>{{ t('dashboard.storage.deviceId', 'Device ID') }}</th>
              <th>{{ t('dashboard.storage.type', 'Type') }}</th>
              <th>{{ t('dashboard.storage.status', 'Status') }}</th>
              <th>{{ t('dashboard.storage.timestamp', 'Timestamp') }}</th>
              <th>{{ t('dashboard.storage.action', 'Action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in recentSessions.slice(0, 12)" :key="`${item.cursor}-${item.item_id}`">
              <td class="StorageSessionTable-Device">
                {{ maskDeviceId(item.device_id) }}
              </td>
              <td>
                <span class="StorageSessionType">
                  <span :class="[resolveSessionTypeIcon(item), 'StorageSessionType-Icon']" />
                  {{ resolveSessionType(item) }}
                </span>
              </td>
              <td>
                <span :class="['StorageSessionStatusBadge', resolveSessionStatusClass(item)]">
                  {{ resolveSessionStatusText(item) }}
                </span>
              </td>
              <td>
                <div class="StorageSessionTable-Time">
                  {{ formatTime(item.updated_at) }}
                </div>
                <div class="StorageSessionTable-Relative">
                  {{ formatRelativeTime(item.updated_at) }}
                </div>
              </td>
              <td>
                <TxButton variant="flat" size="xs" @click="handleOpenSyncDetails">
                  {{ t('dashboard.storage.view', 'View') }}
                </TxButton>
              </td>
            </tr>
            <tr v-if="!recentSessions.length">
              <td colspan="5" class="StorageSessionTable-Empty">
                {{ t('dashboard.storage.sessionEmpty', '暂无会话记录') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="StoragePanel">
      <header class="StoragePanel-Head">
        <h2 class="StoragePanel-Title">
          {{ t('dashboard.storage.keyrings', 'Authorized Keyring') }}
        </h2>
        <span class="StoragePanel-Subtle">keyring: {{ keyringCount }}</span>
      </header>

      <p class="StoragePanel-Desc">
        {{
          t(
            'dashboard.storage.keyringsDesc',
            'Keys allow third-party apps to access your sync storage. Do not share your private keys.'
          )
        }}
      </p>

      <div v-if="!keyrings.length" class="StorageKeyringEmpty">
        {{ t('dashboard.storage.keyringsEmpty', '暂无 keyring 记录') }}
      </div>
      <ul v-else class="StorageKeyringList">
        <li v-for="item in keyrings" :key="item.keyring_id" class="StorageKeyringItem">
          <div class="StorageKeyringItem-Main">
            <div class="StorageKeyringItem-Title">
              {{ maskDeviceId(item.device_id) }}
              <span class="StorageKeyringItem-Chip">
                {{ item.key_type }}
              </span>
            </div>
            <p class="StorageKeyringItem-Line">
              created: {{ formatTime(item.created_at) }}
            </p>
            <p class="StorageKeyringItem-Line">
              {{ t('dashboard.storage.lastActive', 'Last active') }}:
              {{ formatRelativeTime(item.rotated_at || item.created_at) }}
            </p>
          </div>

          <div class="StorageKeyringItem-Actions">
            <span
              class="StorageKeyringItem-Status"
              :class="item.has_recovery_code ? 'StorageKeyringItem-Status--ok' : 'StorageKeyringItem-Status--warn'"
            >
              {{
                item.has_recovery_code
                  ? t('dashboard.storage.recoveryEnabled', '已配置恢复码')
                  : t('dashboard.storage.recoveryMissing', '未配置恢复码')
              }}
            </span>
            <TxButton variant="flat" size="xs" @click="handleOpenSyncDetails">
              {{ t('dashboard.storage.viewSyncDetails', '查看同步内容') }}
            </TxButton>
          </div>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="showDetailsOverlay"
        :source="detailsOverlaySource"
        :duration="420"
        :rotate-x="5"
        :rotate-y="8"
        transition-name="StorageDetailOverlay-Mask"
        mask-class="StorageDetailOverlay-Mask"
        card-class="StorageDetailOverlay-Card"
      >
        <template #default="overlaySlot">
          <div class="StorageDetailOverlay-Inner">
            <div class="StorageDetailOverlay-Header">
              <div class="space-y-1">
                <h2 class="StorageDetailOverlay-Title">
                  {{ t('dashboard.storage.syncDetailTitle', '同步内容明细') }}
                </h2>
                <p class="StorageDetailOverlay-Desc">
                  {{ t('dashboard.storage.syncDetailDesc', '仅展示分类与元信息，不展示业务明文。') }}
                </p>
              </div>
              <div class="StorageDetailOverlay-Actions">
                <TxButton variant="flat" size="small" :loading="detailsLoading" @click="refreshSyncDetails">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
                <TxButton variant="secondary" size="small" @click="overlaySlot?.close?.()">
                  {{ t('common.close', '关闭') }}
                </TxButton>
              </div>
            </div>

            <div v-if="detailsLoading" class="StorageDetailOverlay-State">
              {{ t('dashboard.storage.syncDetailLoading', '正在加载同步明细...') }}
            </div>
            <div
              v-else-if="detailsError"
              class="StorageDetailOverlay-State StorageDetailOverlay-State--error"
            >
              {{ detailsError }}
            </div>
            <div v-else-if="syncDetailSummary" class="StorageDetailOverlay-Body">
              <div class="StorageDetailOverlay-SummaryGrid">
                <div class="StorageDetailOverlay-SummaryCard">
                  <div class="StorageDetailOverlay-SummaryLabel">
                    {{ t('dashboard.storage.syncDetailTotal', '总条目') }}
                  </div>
                  <div class="StorageDetailOverlay-SummaryValue">
                    {{ syncDetailSummary.total_items }}
                  </div>
                </div>
                <div class="StorageDetailOverlay-SummaryCard">
                  <div class="StorageDetailOverlay-SummaryLabel">
                    {{ t('dashboard.storage.syncDetailLive', '生效条目') }}
                  </div>
                  <div class="StorageDetailOverlay-SummaryValue">
                    {{ syncDetailSummary.live_items }}
                  </div>
                </div>
                <div class="StorageDetailOverlay-SummaryCard">
                  <div class="StorageDetailOverlay-SummaryLabel">
                    {{ t('dashboard.storage.syncDetailDeleted', '已删除条目') }}
                  </div>
                  <div class="StorageDetailOverlay-SummaryValue">
                    {{ syncDetailSummary.deleted_items }}
                  </div>
                </div>
                <div class="StorageDetailOverlay-SummaryCard">
                  <div class="StorageDetailOverlay-SummaryLabel">
                    {{ t('dashboard.storage.syncDetailPayload', '总载荷') }}
                  </div>
                  <div class="StorageDetailOverlay-SummaryValue">
                    {{ formatBytes(syncDetailSummary.total_payload_bytes) }}
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <h3 class="StorageDetailOverlay-SectionTitle">
                  {{ t('dashboard.storage.syncDetailCategories', '同步分类') }}
                </h3>
                <div v-if="syncDetailCategories.length" class="StorageDetailOverlay-CategoryGrid">
                  <article
                    v-for="category in syncDetailCategories"
                    :key="category.key"
                    class="StorageDetailOverlay-CategoryCard"
                  >
                    <div class="StorageDetailOverlay-CategoryHead">
                      <span
                        class="StorageDetailOverlay-Tone"
                        :class="resolveCategoryTone(category.key)"
                      />
                      <strong>{{ category.label }}</strong>
                    </div>
                    <div class="text-xs text-black/55 dark:text-white/55">
                      {{ category.count }} 条 · {{ formatBytes(category.total_payload_bytes) }}
                    </div>
                    <div class="mt-1 text-xs text-black/50 dark:text-white/50">
                      {{ t('dashboard.storage.updatedAt', '最近更新') }}:
                      {{ formatTime(category.last_updated_at) }}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                      <span
                        v-for="sample in category.sample_items"
                        :key="sample"
                        class="StorageDetailOverlay-SampleChip"
                      >
                        {{ sample }}
                      </span>
                    </div>
                  </article>
                </div>
                <p v-else class="text-sm text-black/55 dark:text-white/55">
                  {{ t('dashboard.storage.syncDetailCategoriesEmpty', '暂无分类数据') }}
                </p>
              </div>

              <div class="space-y-3">
                <h3 class="StorageDetailOverlay-SectionTitle">
                  {{ t('dashboard.storage.syncDetailItems', '最近同步项') }}
                </h3>
                <ul v-if="syncDetailItems.length" class="StorageDetailOverlay-ItemList">
                  <li
                    v-for="item in syncDetailItems"
                    :key="item.item_id"
                    class="StorageDetailOverlay-ItemRow"
                  >
                    <div class="StorageDetailOverlay-ItemMain">
                      <div class="StorageDetailOverlay-ItemName">
                        {{ resolveItemName(item) }}
                      </div>
                      <div class="StorageDetailOverlay-ItemMeta">
                        <span class="StorageDetailOverlay-ItemBadge">
                          {{ item.category_label }}
                        </span>
                        <span>{{ formatBytes(item.payload_size) }}</span>
                        <span>{{ formatTime(item.updated_at) }}</span>
                        <span>{{ resolveItemStatus(item) }}</span>
                      </div>
                    </div>
                    <div class="text-xs text-black/45 dark:text-white/45">
                      {{ item.type }}
                    </div>
                  </li>
                </ul>
                <p v-else class="text-sm text-black/55 dark:text-white/55">
                  {{ t('dashboard.storage.syncDetailItemsEmpty', '暂无同步项') }}
                </p>
              </div>
            </div>
            <div v-else class="StorageDetailOverlay-State">
              {{ t('dashboard.storage.syncDetailEmpty', '暂无同步数据') }}
            </div>
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>
  </div>
</template>

<style scoped>
.StorageHero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.StorageHero-Title {
  margin: 0;
  font-size: 40px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.StorageHero-Desc {
  margin: 0;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.StorageHero-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.StorageSystemStatus {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
}

.StorageSystemStatus-Dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.StorageSystemStatus--healthy {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 16%, transparent);
}

.StorageSystemStatus--healthy .StorageSystemStatus-Dot {
  background: #22c55e;
}

.StorageSystemStatus--warn {
  color: #b45309;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
}

.StorageSystemStatus--warn .StorageSystemStatus-Dot {
  background: #f59e0b;
}

.StorageMetricsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}

.StorageMetricCard {
  border-radius: 18px;
  border: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 78%, transparent);
  box-shadow: 0 8px 28px rgba(2, 6, 23, 0.08);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.StorageMetricCard-Head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.StorageMetricCard-Label {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.StorageMetricCard-Value {
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
  line-height: 1.1;
}

.StorageMetricCard-SubValue {
  margin-left: 6px;
  font-size: 16px;
  color: var(--tx-text-color-secondary);
  font-weight: 500;
}

.StorageMetricCard-Icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, #3b82f6 16%, transparent);
  color: #3b82f6;
  font-size: 18px;
}

.StorageMetricCard-Icon--violet {
  background: color-mix(in srgb, #a855f7 16%, transparent);
  color: #a855f7;
}

.StorageProgress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.StorageProgress-Track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 70%, transparent);
  overflow: hidden;
}

.StorageProgress-Bar {
  height: 100%;
  border-radius: 999px;
  transition: width 220ms ease;
}

.StorageProgress-Bar--blue {
  background: linear-gradient(90deg, #3b82f6, #2563eb);
}

.StorageProgress-Bar--violet {
  background: linear-gradient(90deg, #a855f7, #9333ea);
}

.StorageProgress-Foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StorageLink {
  color: var(--tx-color-primary);
  text-decoration: none;
}

.StorageMiniChart {
  border-top: 1px solid var(--tx-border-color-lighter);
  padding-top: 10px;
}

.StorageMiniChart-Head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin-bottom: 4px;
}

.StorageMiniChart-Trend {
  font-weight: 600;
}

.StorageMiniChart-Svg {
  width: 100%;
  height: 70px;
}

.StorageMiniChart-Area {
  opacity: 0.22;
}

.StorageMiniChart-Area--blue {
  fill: #3b82f6;
}

.StorageMiniChart-Area--violet {
  fill: #a855f7;
}

.StorageMiniChart-Line {
  fill: none;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.StorageMiniChart-Line--blue {
  stroke: #3b82f6;
}

.StorageMiniChart-Line--violet {
  stroke: #a855f7;
}

.StoragePanel {
  border-radius: 18px;
  border: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 82%, transparent);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  padding: 16px;
}

.StoragePanel-Head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.StoragePanel-Title {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.01em;
  color: var(--tx-text-color-primary);
}

.StoragePanel-Badge {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  border-radius: 10px;
  padding: 4px 10px;
  border: 1px solid var(--tx-border-color-lighter);
}

.StoragePanel-Subtle {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StoragePanel-Desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.StoragePanel-Error {
  margin: 10px 0 0;
  color: #ef4444;
  font-size: 13px;
}

.StorageSessionTableWrap {
  margin-top: 12px;
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
}

.StorageSessionTable {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;
}

.StorageSessionTable th,
.StorageSessionTable td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  font-size: 13px;
}

.StorageSessionTable th {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 76%, transparent);
}

.StorageSessionTable tbody tr:last-child td {
  border-bottom: none;
}

.StorageSessionTable-Device {
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.StorageSessionType {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.StorageSessionType-Icon {
  color: var(--tx-text-color-secondary);
}

.StorageSessionStatusBadge {
  border-radius: 7px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
}

.StorageSessionStatusBadge--success {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 20%, transparent);
}

.StorageSessionStatusBadge--failed {
  color: #b91c1c;
  background: color-mix(in srgb, #ef4444 18%, transparent);
}

.StorageSessionTable-Time {
  color: var(--tx-text-color-primary);
}

.StorageSessionTable-Relative {
  margin-top: 2px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.StorageSessionTable-Empty {
  text-align: center !important;
  color: var(--tx-text-color-secondary);
  padding: 20px 14px !important;
}

.StorageKeyringEmpty {
  margin-top: 10px;
  border-radius: 12px;
  border: 1px dashed var(--tx-border-color-lighter);
  padding: 16px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.StorageKeyringList {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.StorageKeyringItem {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 76%, transparent);
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.StorageKeyringItem-Main {
  min-width: 0;
}

.StorageKeyringItem-Title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.StorageKeyringItem-Chip {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
}

.StorageKeyringItem-Line {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StorageKeyringItem-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.StorageKeyringItem-Status {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
}

.StorageKeyringItem-Status--ok {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 16%, transparent);
}

.StorageKeyringItem-Status--warn {
  color: #b45309;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
}

.StorageDetailOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 18px;
}

.StorageDetailOverlay-Header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}

.StorageDetailOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.StorageDetailOverlay-Desc {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.StorageDetailOverlay-Actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.StorageDetailOverlay-State {
  padding: 14px;
  border-radius: 12px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-bg-color-primary) 70%, transparent);
}

.StorageDetailOverlay-State--error {
  color: #f87171;
  background: color-mix(in srgb, #ef4444 15%, transparent);
}

.StorageDetailOverlay-Body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}

.StorageDetailOverlay-SummaryGrid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.StorageDetailOverlay-SummaryCard {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 75%, transparent);
}

.StorageDetailOverlay-SummaryLabel {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StorageDetailOverlay-SummaryValue {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.StorageDetailOverlay-SectionTitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.StorageDetailOverlay-CategoryGrid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.StorageDetailOverlay-CategoryCard {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 78%, transparent);
}

.StorageDetailOverlay-CategoryHead {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.StorageDetailOverlay-Tone {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.StorageDetailOverlay-Tone--blue {
  background: #60a5fa;
}

.StorageDetailOverlay-Tone--violet {
  background: #a78bfa;
}

.StorageDetailOverlay-Tone--emerald {
  background: #34d399;
}

.StorageDetailOverlay-Tone--amber {
  background: #f59e0b;
}

.StorageDetailOverlay-Tone--rose {
  background: #fb7185;
}

.StorageDetailOverlay-Tone--slate {
  background: #94a3b8;
}

.StorageDetailOverlay-SampleChip {
  font-size: 11px;
  line-height: 1.4;
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-bg-color-primary) 65%, transparent);
}

.StorageDetailOverlay-ItemList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.StorageDetailOverlay-ItemRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-radius: 10px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-secondary) 80%, transparent);
}

.StorageDetailOverlay-ItemMain {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.StorageDetailOverlay-ItemName {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  overflow-wrap: anywhere;
}

.StorageDetailOverlay-ItemMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.StorageDetailOverlay-ItemBadge {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 10px;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 16%, transparent);
}

@media (max-width: 900px) {
  .StorageHero-Title {
    font-size: 30px;
  }
}
</style>

<style>
.StorageDetailOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
  background: rgba(9, 11, 20, 0.42);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.StorageDetailOverlay-Mask-enter-active,
.StorageDetailOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.StorageDetailOverlay-Mask-enter-from,
.StorageDetailOverlay-Mask-leave-to {
  opacity: 0;
}

.StorageDetailOverlay-Card {
  width: min(860px, 94vw);
  min-height: 380px;
  max-height: 84vh;
  border-radius: 16px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color-overlay);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
  overflow: auto;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>
