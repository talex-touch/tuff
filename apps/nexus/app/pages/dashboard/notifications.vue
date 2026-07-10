<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRadio, TxRadioGroup, type TxRadioValue } from '@talex-touch/tuffex/radio'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxTag } from '@talex-touch/tuffex/tag'
import { hasWindow } from '@talex-touch/utils/env'
import { requestJson } from '~/utils/request'

const LazyFlipDialog = defineAsyncComponent(() => import('~/components/base/dialog/FlipDialog.vue'))

definePageMeta({
  layout: 'dashboard',
})
defineI18nRoute(false)

const { t } = useI18n()
const browserSetupTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const toast = useToast()

type NotificationStatus = 'unread' | 'read'
type NotificationFilter = NotificationStatus | 'all'
type BrowserNotificationPermissionState = 'default' | 'denied' | 'granted' | 'unsupported'

interface BrowserNotificationItem {
  id: string
  userId: string
  action: string
  title: string
  body: string
  resourceType: string | null
  resourceId: string | null
  status: NotificationStatus
  metadata: Record<string, unknown> | null
  occurredAt: string
  createdAt: string
  readAt: string | null
}

interface InboxResponse {
  notifications: BrowserNotificationItem[]
  unreadCount: number
}

interface BrowserPushSubscriptionSummary {
  id: string
  userId: string
  endpointOrigin: string
  endpointHost: string
  expirationTime: number | null
  hasKeys: boolean
  createdAt: string
  updatedAt: string
}

interface BrowserPushSubscriptionsResponse {
  subscriptions: BrowserPushSubscriptionSummary[]
  generatedAt: string
}

interface RuntimeConfigWithWebPush {
  public?: {
    notificationWebPush?: {
      publicKey?: string
    }
  }
}

const runtimeConfig = useRuntimeConfig() as RuntimeConfigWithWebPush
const filter = ref<NotificationFilter>('unread')
const notifications = ref<BrowserNotificationItem[]>([])
const browserPushSubscriptions = ref<BrowserPushSubscriptionSummary[]>([])
const unreadCount = ref(0)
const navigationUnreadCount = useState<number>('dashboard-notification-unread-count', () => 0)
const loading = ref(false)
const actionLoading = ref(false)
const browserNotificationBusy = ref(false)
const browserPushBusy = ref(false)
const browserNotificationPermission = ref<BrowserNotificationPermissionState>('unsupported')
const browserNotificationError = ref<string | null>(null)
const error = ref<string | null>(null)
const browserSetupOverlayVisible = ref(false)

const filterOptions = computed(() => [
  {
    value: 'unread' as const,
    label: t('dashboard.notifications.filters.unread', '未读'),
  },
  {
    value: 'all' as const,
    label: t('dashboard.notifications.filters.all', '全部'),
  },
])
const selectedFilter = computed<TxRadioValue>({
  get: () => filter.value,
  set: (value) => {
    if (value === 'unread' || value === 'all')
      filter.value = value
  },
})

const visibleNotifications = computed(() => notifications.value)
const hasUnread = computed(() => unreadCount.value > 0)
const browserPushSubscription = computed(() => browserPushSubscriptions.value[0] ?? null)
const browserPushPublicKey = computed(() => runtimeConfig.public?.notificationWebPush?.publicKey ?? '')
const browserPushStatusLabel = computed(() => {
  if (!browserPushPublicKey.value)
    return t('dashboard.notifications.browser.errors.vapidMissing', 'Web Push 公钥未配置。')
  return browserPushSubscription.value
    ? t('dashboard.notifications.browser.webPushEnabled', 'Web Push 已注册')
    : t('dashboard.notifications.browser.webPushDisabled', 'Web Push 未注册')
})
const browserNotificationPermissionLabel = computed(() => {
  if (browserNotificationPermission.value === 'granted')
    return t('dashboard.notifications.browser.permissionGranted', '已允许')
  if (browserNotificationPermission.value === 'denied')
    return t('dashboard.notifications.browser.permissionDenied', '已阻止')
  if (browserNotificationPermission.value === 'default')
    return t('dashboard.notifications.browser.permissionPrompt', '待授权')
  return t('dashboard.notifications.browser.permissionUnsupported', '不支持')
})
const browserNotificationActionLabel = computed(() => {
  if (browserNotificationPermission.value === 'granted')
    return t('dashboard.notifications.browser.test', '测试浏览器通知')
  if (browserNotificationPermission.value === 'default')
    return t('dashboard.notifications.browser.enable', '开启浏览器通知')
  if (browserNotificationPermission.value === 'denied')
    return t('dashboard.notifications.browser.blocked', '已被浏览器阻止')
  return t('dashboard.notifications.browser.unsupported', '浏览器不支持')
})
const browserSetupActionLabel = computed(() => {
  return browserPushSubscription.value
    ? t('dashboard.notifications.browser.manageWebPush')
    : t('dashboard.notifications.browser.setupWebPush')
})
const browserSetupDialogMessage = computed(() => {
  const intro = t('dashboard.notifications.browser.setupDialogHint')
  if (!browserNotificationError.value)
    return intro
  return `${intro} ${t('dashboard.notifications.browser.setupDialogError', { error: browserNotificationError.value })}`
})

function readErrorMessage(errorValue: unknown): string {
  const candidate = errorValue as { data?: { statusMessage?: unknown, message?: unknown }, message?: unknown } | null
  const statusMessage = candidate?.data?.statusMessage
  if (typeof statusMessage === 'string' && statusMessage)
    return statusMessage
  const dataMessage = candidate?.data?.message
  if (typeof dataMessage === 'string' && dataMessage)
    return dataMessage
  const message = candidate?.message
  return typeof message === 'string' && message ? message : t('dashboard.notifications.errors.unknown', '通知加载失败')
}

function formatDateTime(value: string | null): string {
  if (!value)
    return '-'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp))
    return value
  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp))
    return formatDateTime(value)

  const diffMs = Date.now() - timestamp
  const absMs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (absMs < minute)
    return t('dashboard.notifications.justNow', '刚刚')
  if (absMs < hour)
    return `${Math.round(absMs / minute)}${t('dashboard.notifications.minutesAgo', ' 分钟前')}`
  if (absMs < day)
    return `${Math.round(absMs / hour)}${t('dashboard.notifications.hoursAgo', ' 小时前')}`
  return `${Math.round(absMs / day)}${t('dashboard.notifications.daysAgo', ' 天前')}`
}

function actionLabel(action: string): string {
  if (action === 'plugin.version.approved')
    return t('dashboard.notifications.actions.pluginApproved', '插件审核通过')
  if (action === 'plugin.version.rejected')
    return t('dashboard.notifications.actions.pluginRejected', '插件审核未通过')
  if (action === 'plugin.version.pending')
    return t('dashboard.notifications.actions.pluginPending', '插件审核待处理')
  return action
}

function resourceLabel(item: BrowserNotificationItem): string {
  if (!item.resourceType && !item.resourceId)
    return t('dashboard.notifications.resourceSystem', 'System')
  return [item.resourceType, item.resourceId].filter(Boolean).join(' / ')
}

function readBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (!import.meta.client || !hasWindow() || !('Notification' in window))
    return 'unsupported'
  return window.Notification.permission
}

function syncBrowserNotificationPermission() {
  browserNotificationPermission.value = readBrowserNotificationPermission()
}

function sendBrowserTestNotification() {
  if (!import.meta.client || !hasWindow() || !('Notification' in window))
    throw new Error(t('dashboard.notifications.browser.errors.unsupported', '当前浏览器不支持系统通知。'))
  if (window.Notification.permission !== 'granted')
    throw new Error(t('dashboard.notifications.browser.errors.permissionRequired', '请先允许浏览器通知权限。'))

  const notification = new window.Notification(t('dashboard.notifications.browser.testTitle', 'Tuff 通知测试'), {
    body: t('dashboard.notifications.browser.testBody', '浏览器通知已可用。'),
    tag: 'tuff-dashboard-notification-test',
  })
  notification.onclick = () => window.focus()
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0))).buffer as ArrayBuffer
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!import.meta.client || !hasWindow() || !('serviceWorker' in navigator))
    throw new Error(t('dashboard.notifications.browser.errors.serviceWorkerUnsupported', '当前浏览器不支持 Service Worker。'))
  if (!('PushManager' in window))
    throw new Error(t('dashboard.notifications.browser.errors.pushUnsupported', '当前浏览器不支持 Web Push。'))
  return await navigator.serviceWorker.register('/notification-sw.js')
}

async function loadBrowserPushSubscriptions() {
  try {
    const data = await requestJson<BrowserPushSubscriptionsResponse>('/api/dashboard/notifications/push-subscriptions')
    browserPushSubscriptions.value = data.subscriptions
  }
  catch {
    browserPushSubscriptions.value = []
  }
}

async function handleBrowserPushSubscribe() {
  browserPushBusy.value = true
  browserNotificationError.value = null
  try {
    if (!browserPushPublicKey.value)
      throw new Error(t('dashboard.notifications.browser.errors.vapidMissing', 'Web Push 公钥未配置。'))
    if (browserNotificationPermission.value !== 'granted')
      throw new Error(t('dashboard.notifications.browser.errors.permissionRequired', '请先允许浏览器通知权限。'))

    const registration = await getServiceWorkerRegistration()
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(browserPushPublicKey.value),
    })
    await requestJson('/api/dashboard/notifications/push-subscriptions', {
      method: 'POST',
      body: {
        subscription: subscription.toJSON(),
      },
    })
    await loadBrowserPushSubscriptions()
    toast.success(t('dashboard.notifications.browser.webPushSubscribed', 'Web Push 订阅已注册'))
  }
  catch (caught) {
    browserNotificationError.value = readErrorMessage(caught)
    toast.error(t('dashboard.notifications.browser.webPushSubscribeFailed', 'Web Push 注册失败'), browserNotificationError.value)
  }
  finally {
    browserPushBusy.value = false
  }
}

async function handleBrowserPushUnsubscribe() {
  const subscription = browserPushSubscription.value
  if (!subscription)
    return

  browserPushBusy.value = true
  browserNotificationError.value = null
  try {
    if (import.meta.client && hasWindow() && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      const activeSubscription = await registration?.pushManager.getSubscription()
      await activeSubscription?.unsubscribe()
    }
    await requestJson(`/api/dashboard/notifications/push-subscriptions/${subscription.id}`, {
      method: 'DELETE',
    })
    await loadBrowserPushSubscriptions()
    toast.success(t('dashboard.notifications.browser.webPushUnsubscribed', 'Web Push 订阅已注销'))
  }
  catch (caught) {
    browserNotificationError.value = readErrorMessage(caught)
    toast.error(t('dashboard.notifications.browser.webPushUnsubscribeFailed', 'Web Push 注销失败'), browserNotificationError.value)
  }
  finally {
    browserPushBusy.value = false
  }
}

async function handleBrowserNotificationAction() {
  if (!import.meta.client || !hasWindow() || !('Notification' in window)) {
    browserNotificationError.value = t('dashboard.notifications.browser.errors.unsupported', '当前浏览器不支持系统通知。')
    return
  }

  browserNotificationBusy.value = true
  browserNotificationError.value = null
  try {
    if (window.Notification.permission === 'default') {
      browserNotificationPermission.value = await window.Notification.requestPermission()
    }
    else {
      syncBrowserNotificationPermission()
    }

    if (browserNotificationPermission.value !== 'granted') {
      browserNotificationError.value = t('dashboard.notifications.browser.errors.permissionRequired', '请先允许浏览器通知权限。')
      return
    }

    sendBrowserTestNotification()
    await loadBrowserPushSubscriptions()
    toast.success(t('dashboard.notifications.browser.testSent', '浏览器测试通知已发送'))
  }
  catch (caught) {
    browserNotificationError.value = readErrorMessage(caught)
    toast.error(t('dashboard.notifications.browser.testFailed', '浏览器通知测试失败'), browserNotificationError.value)
  }
  finally {
    browserNotificationBusy.value = false
  }
}

async function loadNotifications() {
  loading.value = true
  error.value = null
  try {
    const data = await requestJson<InboxResponse>('/api/dashboard/notifications/inbox', {
      query: {
        status: filter.value,
        limit: 100,
      },
    })
    notifications.value = data.notifications
    unreadCount.value = data.unreadCount
    navigationUnreadCount.value = data.unreadCount
  }
  catch (caught) {
    error.value = readErrorMessage(caught)
  }
  finally {
    loading.value = false
  }
}

async function markRead(ids: string[]) {
  if (!ids.length)
    return
  actionLoading.value = true
  try {
    await requestJson('/api/dashboard/notifications/inbox/read', {
      method: 'POST',
      body: { ids },
    })
    toast.success(t('dashboard.notifications.markedRead', '通知已标记为已读'))
    await loadNotifications()
  }
  catch (caught) {
    toast.error(t('dashboard.notifications.markReadFailed', '标记已读失败'), readErrorMessage(caught))
  }
  finally {
    actionLoading.value = false
  }
}

async function markAllRead() {
  if (!hasUnread.value)
    return
  actionLoading.value = true
  try {
    await requestJson('/api/dashboard/notifications/inbox/read', {
      method: 'POST',
      body: { all: true },
    })
    toast.success(t('dashboard.notifications.allMarkedRead', '所有通知已标记为已读'))
    await loadNotifications()
  }
  catch (caught) {
    toast.error(t('dashboard.notifications.markReadFailed', '标记已读失败'), readErrorMessage(caught))
  }
  finally {
    actionLoading.value = false
  }
}

watch(filter, () => {
  void loadNotifications()
})

onMounted(() => {
  syncBrowserNotificationPermission()
  void loadNotifications()
  void loadBrowserPushSubscriptions()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="apple-heading-md">
          {{ t('dashboard.notifications.title', '通知中心') }}
        </h1>
        <p class="mt-2 text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.notifications.description', '查看浏览器通知与平台投递记录。') }}
        </p>
      </div>

      <TxButton
        ref="browserSetupTriggerRef"
        size="small"
        variant="secondary"
        :loading="browserNotificationBusy || browserPushBusy"
        icon="i-carbon-send-alt"
        @click="browserSetupOverlayVisible = true"
      >
        {{ browserSetupActionLabel }}
      </TxButton>

      <LazyFlipDialog
        v-if="browserSetupOverlayVisible"
        v-model="browserSetupOverlayVisible"
        :reference="browserSetupTriggerRef?.$el || null"
        size="md"
        width="min(560px, calc(100vw - 32px))"
        max-height="calc(100dvh - 32px)"
        :header="false"
        :closable="false"
      >
        <template #default>
          <div class="space-y-4 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <h2 class="text-base text-black font-semibold dark:text-white">
                  {{ t('dashboard.notifications.browser.setupDialogTitle') }}
                </h2>
                <p class="text-xs text-black/55 leading-5 dark:text-white/55">
                  {{ browserSetupDialogMessage }}
                </p>
              </div>
            </div>

            <div class="grid gap-2 text-sm sm:grid-cols-2">
              <div class="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
                <span class="shrink-0 text-black/55 dark:text-white/55">
                  {{ t('dashboard.notifications.browser.permissionLabel') }}
                </span>
                <span class="truncate text-black font-medium dark:text-white">
                  {{ browserNotificationPermissionLabel }}
                </span>
              </div>
              <div class="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
                <span class="shrink-0 text-black/55 dark:text-white/55">
                  {{ t('dashboard.notifications.browser.webPushLabel') }}
                </span>
                <span class="truncate text-black font-medium dark:text-white">
                  {{ browserPushStatusLabel }}
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-2">
              <TxButton
                size="small"
                variant="secondary"
                :disabled="browserNotificationBusy || browserNotificationPermission === 'denied' || browserNotificationPermission === 'unsupported'"
                :loading="browserNotificationBusy"
                icon="i-carbon-notification"
                @click="handleBrowserNotificationAction"
              >
                {{ browserNotificationActionLabel }}
              </TxButton>
              <TxButton
                v-if="!browserPushSubscription"
                size="small"
                variant="primary"
                :disabled="browserPushBusy || browserNotificationPermission !== 'granted' || !browserPushPublicKey"
                :loading="browserPushBusy"
                icon="i-carbon-send-alt"
                @click="handleBrowserPushSubscribe"
              >
                {{ t('dashboard.notifications.browser.webPushSubscribe', '注册 Web Push') }}
              </TxButton>
              <TxButton
                v-else
                size="small"
                variant="danger"
                :disabled="browserPushBusy"
                :loading="browserPushBusy"
                icon="i-carbon-notification-off"
                @click="handleBrowserPushUnsubscribe"
              >
                {{ t('dashboard.notifications.browser.webPushUnsubscribe', '注销 Web Push') }}
              </TxButton>
            </div>
          </div>
        </template>
      </LazyFlipDialog>
    </header>

    <section class="apple-card-lg p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <TxRadioGroup v-model="selectedFilter" type="button" indicator-variant="glass" glass>
          <TxRadio
            v-for="option in filterOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </TxRadio>
        </TxRadioGroup>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <p class="text-xs text-black/45 dark:text-white/45">
            {{ t('dashboard.notifications.scopeHint', '仅显示当前登录用户的通知。') }}
          </p>
          <TxButton size="small" variant="secondary" :loading="loading" @click="loadNotifications">
            {{ t('dashboard.notifications.refresh', '刷新') }}
          </TxButton>
          <TxButton size="small" variant="primary" :disabled="!hasUnread || actionLoading" :loading="actionLoading" icon="i-carbon-checkmark" @click="markAllRead">
            {{ t('dashboard.notifications.markAllRead', '全部已读') }}
          </TxButton>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <TxSpinner :size="22" />
      </div>

      <div v-else-if="error" class="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
        {{ error }}
      </div>

      <div
        v-else-if="!visibleNotifications.length"
        class="mt-5 rounded-2xl border border-dashed border-black/[0.08] py-10 text-center text-sm text-black/45 dark:border-white/[0.08] dark:text-white/45"
      >
        {{ filter === 'unread' ? t('dashboard.notifications.emptyUnread', '暂无未读通知') : t('dashboard.notifications.emptyAll', '暂无通知') }}
      </div>

      <div v-else class="mt-5 divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        <article
          v-for="item in visibleNotifications"
          :key="item.id"
          class="flex gap-4 py-4"
        >
          <div class="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" :class="item.status === 'unread' ? 'bg-sky-500/12 text-sky-600 dark:text-sky-300' : 'bg-black/[0.04] text-black/45 dark:bg-white/[0.06] dark:text-white/45'">
            <span class="i-carbon-notification text-lg" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-sm text-black font-semibold dark:text-white">
                    {{ item.title }}
                  </h2>
                  <TxTag v-if="item.status === 'unread'" size="sm" :label="t('dashboard.notifications.unread', '未读')" color="var(--tx-color-primary)" />
                </div>
                <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                  {{ actionLabel(item.action) }} · {{ resourceLabel(item) }} · {{ formatRelativeTime(item.createdAt) }}
                </p>
              </div>
              <TxButton
                v-if="item.status === 'unread'"
                size="small"
                variant="secondary"
                :disabled="actionLoading"
                @click="markRead([item.id])"
              >
                {{ t('dashboard.notifications.markRead', '标记已读') }}
              </TxButton>
            </div>
            <p class="mt-3 whitespace-pre-wrap text-sm text-black/70 leading-6 dark:text-white/70">
              {{ item.body }}
            </p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
