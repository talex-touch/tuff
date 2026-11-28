<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTag } from '@talex-touch/tuffex/tag'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { NotificationItem, PushSubscriptionItem } from '@/api/types'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime } from '@/utils/format'
import { base64UrlToUint8Array } from '@/utils/webauthn'

const { t, locale } = useI18n()

const unreadCount = ref(0)
const markingAll = ref(false)
const subscribingPush = ref(false)
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)
const pushCache = ref<PushSubscriptionItem[] | null>(null)
const vapidPublicKey = ref<string | null>(null)
const pushServerEnabled = ref(false)

const pushSupported = computed(() =>
  hasWindow() && hasNavigator() && 'serviceWorker' in navigator && 'PushManager' in window,
)

const canSubscribePush = computed(() =>
  pushSupported.value && pushServerEnabled.value && Boolean(vapidPublicKey.value),
)

function isNotificationRead(item: NotificationItem): boolean {
  return item.status === 'read' || Boolean(item.read || item.readAt)
}

const inboxList = useConsoleList<NotificationItem, { unreadOnly: string }>({
  defaults: { unreadOnly: 'false' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listNotifications({
      page,
      limit,
      status: filters.unreadOnly === 'true' ? 'unread' : 'all',
    })
    unreadCount.value = res.unreadCount ?? 0
    const rows = res.notifications ?? res.items ?? []
    const total = res.pagination?.total ?? res.total ?? rows.length
    return { rows, total }
  },
})

const pushList = useConsoleList<PushSubscriptionItem, Record<string, never>>({
  defaults: {},
  defaultLimit: 10,
  pageSizes: [10, 20],
  fetch: async ({ page, limit }) => {
    if (!pushCache.value) {
      const res = await consoleApi.listPushSubscriptions()
      pushCache.value = res.subscriptions ?? res.items ?? []
      vapidPublicKey.value = res.vapidPublicKey ?? null
      pushServerEnabled.value = Boolean(res.enabled && res.vapidPublicKey)
    }
    return sliceClientPage(pushCache.value, page, limit)
  },
})

const unreadOnlyFlag = computed({
  get: () => inboxList.filters.unreadOnly === 'true',
  set: (value: boolean) => {
    inboxList.filters.unreadOnly = value ? 'true' : 'false'
  },
})

const inboxColumns = computed<DataTableColumn<NotificationItem>[]>(() => [
  { key: 'title', title: t('dashboard.notificationTitleCol'), minWidth: 260 },
  { key: 'category', title: t('dashboard.notificationCategoryCol'), minWidth: 110 },
  { key: 'read', title: t('common.status'), minWidth: 100 },
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 120 },
])

const pushColumns = computed<DataTableColumn<PushSubscriptionItem>[]>(() => [
  { key: 'deviceLabel', title: t('dashboard.pushDeviceCol'), minWidth: 180 },
  { key: 'endpoint', title: t('dashboard.pushEndpointCol'), minWidth: 260 },
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 100 },
])

async function markRead(item: NotificationItem) {
  try {
    const res = await consoleApi.markNotificationsRead({ ids: [item.id] })
    if (typeof res.unreadCount === 'number')
      unreadCount.value = res.unreadCount
    await inboxList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

async function markAllRead() {
  markingAll.value = true
  try {
    await consoleApi.markNotificationsRead({ all: true })
    unreadCount.value = 0
    await inboxList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    markingAll.value = false
  }
}

async function subscribeCurrentBrowser() {
  if (!canSubscribePush.value || !hasNavigator() || !vapidPublicKey.value) {
    feedback.value = { type: 'error', message: t('dashboard.pushUnsupported') }
    return
  }
  subscribingPush.value = true
  feedback.value = null
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey.value),
      })
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
      throw new Error(t('dashboard.pushUnsupported'))

    await consoleApi.subscribePush({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      deviceLabel: navigator.userAgent.slice(0, 80),
    })
    pushCache.value = null
    await pushList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    subscribingPush.value = false
  }
}

async function removePush(item: PushSubscriptionItem) {
  try {
    await consoleApi.unsubscribePush(item.id)
    pushCache.value = null
    await pushList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}
</script>

<template>
  <ConsolePageShell :title="t('dashboard.notificationsTitle')">
    <template #actions>
      <TxTag :label="`${t('dashboard.unreadCount')}: ${unreadCount}`" variant="soft" size="sm" />
      <TxButton
        variant="secondary"
        size="sm"
        :loading="markingAll"
        :disabled="unreadCount === 0"
        @click="markAllRead"
      >
        {{ t('dashboard.markAllRead') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleSection :title="t('dashboard.inboxSection')" :padded="false">
      <template #actions>
        <div class="console-inline-actions">
          <span class="console-muted">{{ t('dashboard.unreadOnly') }}</span>
          <TxSwitch v-model="unreadOnlyFlag" />
        </div>
      </template>

      <ConsoleTable
        :columns="inboxColumns"
        :rows="inboxList.rows.value"
        row-key="id"
        :loading="inboxList.loading.value"
        :refreshing="inboxList.refreshing.value"
        :error="inboxList.error.value"
        :filtered="inboxList.hasActiveFilters.value"
        :page="inboxList.page.value"
        :limit="inboxList.limit.value"
        :total="inboxList.total.value"
        :page-sizes="inboxList.pageSizes"
        @retry="inboxList.refresh()"
        @clear-filters="inboxList.clearFilters()"
        @update:page="inboxList.setPage($event)"
        @update:limit="inboxList.setLimit($event)"
      >
        <template #cell-title="{ row }">
          <div>
            <div>{{ row.title }}</div>
            <div v-if="row.body || row.message" class="console-muted">
{{ row.body || row.message }}
</div>
          </div>
        </template>
        <template #cell-category="{ row }">
          <TxTag :label="row.action || row.resourceType || row.category || 'system'" size="sm" variant="soft" />
        </template>
        <template #cell-read="{ row }">
          <TxStatusBadge
            :text="isNotificationRead(row) ? t('common.yes') : t('dashboard.unreadCount')"
            :status="isNotificationRead(row) ? 'muted' : 'info'"
            size="sm"
          />
        </template>
        <template #cell-createdAt="{ row }">
          {{ formatDateTime(row.occurredAt || row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton v-if="!isNotificationRead(row)" variant="ghost" size="sm" @click="markRead(row)">
            {{ t('dashboard.markRead') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection
      :title="t('dashboard.pushSection')"
      :description="t('dashboard.pushDesc')"
      :padded="false"
    >
      <template #actions>
        <TxButton
          variant="primary"
          size="sm"
          icon="i-carbon-notification-new"
          :loading="subscribingPush"
          :disabled="!canSubscribePush"
          @click="subscribeCurrentBrowser"
        >
          {{ t('dashboard.subscribePush') }}
        </TxButton>
      </template>

      <ConsoleTable
        :columns="pushColumns"
        :rows="pushList.rows.value"
        row-key="id"
        :loading="pushList.loading.value"
        :refreshing="pushList.refreshing.value"
        :error="pushList.error.value"
        :page="pushList.page.value"
        :limit="pushList.limit.value"
        :total="pushList.total.value"
        :page-sizes="pushList.pageSizes"
        @retry="pushList.refresh()"
        @update:page="pushList.setPage($event)"
        @update:limit="pushList.setLimit($event)"
      >
        <template #cell-deviceLabel="{ row }">
          {{ row.deviceLabel || row.userAgent || 'Browser' }}
        </template>
        <template #cell-endpoint="{ row }">
          <span class="console-mono">{{ row.endpoint.slice(0, 56) }}…</span>
        </template>
        <template #cell-createdAt="{ row }">
          {{ formatDateTime(row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton variant="danger" size="sm" @click="removePush(row)">
            {{ t('common.remove') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>
  </ConsolePageShell>
</template>
