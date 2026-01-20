<script setup lang="ts" name="SettingMessages">
import type { AnalyticsMessage } from '@talex-touch/utils/analytics'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TxButton } from '@talex-touch/tuffex'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
const transport = useTuffTransport()

const messages = ref<AnalyticsMessage[]>([])
const loading = ref(false)

const unreadCount = computed(() => messages.value.filter((item) => item.status === 'unread').length)
const limitedMessages = computed(() => messages.value.slice(0, 12))

async function loadMessages() {
  loading.value = true
  try {
    const list = await transport.send(AppEvents.analytics.messages.list, {
      status: 'all',
      limit: 50
    })
    messages.value = Array.isArray(list) ? list : []
  } catch {
    messages.value = []
  } finally {
    loading.value = false
  }
}

async function markMessage(message: AnalyticsMessage) {
  if (message.status === 'read') return
  try {
    const updated = await transport.send(AppEvents.analytics.messages.mark, {
      id: message.id,
      status: 'read'
    })
    if (updated) {
      const target = messages.value.find((item) => item.id === updated.id)
      if (target) target.status = updated.status
    }
  } catch {
    // ignore update failures
  }
}

async function markAllRead() {
  const unread = messages.value.filter((item) => item.status === 'unread')
  if (!unread.length) return
  await Promise.all(unread.map((item) => markMessage(item)))
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function severityClass(severity: AnalyticsMessage['severity']) {
  if (severity === 'error') return 'is-error'
  if (severity === 'warn') return 'is-warn'
  return 'is-info'
}

onMounted(() => {
  loadMessages()
  let cancelled = false
  let controller: { cancel: () => void } | null = null

  transport
    .stream(StorageEvents.app.updated, undefined, {
      onData: (payload) => {
        if (payload?.key === 'analytics-messages.json') {
          loadMessages()
        }
      },
      onError: (err) => {
        console.error('[SettingMessages] storage update stream error:', err)
      }
    })
    .then((stream) => {
      if (cancelled) {
        stream.cancel()
        return
      }
      controller = stream
    })
    .catch((error) => {
      console.error('[SettingMessages] Failed to start storage update stream:', error)
    })

  onBeforeUnmount(() => {
    cancelled = true
    controller?.cancel()
  })
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settingMessages.title', 'Message Center')"
    :description="t('settingMessages.desc', 'Sync status, failures, and system alerts')"
    default-icon="i-carbon-notification"
    active-icon="i-carbon-notification-filled"
    memory-name="setting-messages"
  >
    <TuffBlockLine :title="t('settingMessages.unread', 'Unread')">
      <template #description>
        <span class="MessageCount">{{ unreadCount }}</span>
      </template>
    </TuffBlockLine>

    <section class="MessageActions">
      <TxButton variant="flat" size="sm" @click="loadMessages">
        {{ t('settingMessages.refresh', 'Refresh') }}
      </TxButton>
      <TxButton variant="flat" size="sm" :disabled="unreadCount === 0" @click="markAllRead">
        {{ t('settingMessages.markAllRead', 'Mark all read') }}
      </TxButton>
    </section>

    <div v-if="loading" class="MessageState">
      <span class="i-carbon-circle-dash animate-spin" />
      <span>{{ t('settingMessages.loading', 'Loading...') }}</span>
    </div>

    <div v-else-if="!limitedMessages.length" class="MessageState">
      {{ t('settingMessages.empty', 'No messages yet') }}
    </div>

    <ul v-else class="MessageList">
      <li
        v-for="item in limitedMessages"
        :key="item.id"
        class="MessageItem"
        :class="severityClass(item.severity)"
      >
        <div class="MessageHeader">
          <div class="MessageTitle">
            <span class="MessageDot" />
            <span class="MessageTitleText">{{ item.title }}</span>
            <span v-if="item.status === 'unread'" class="MessageBadge">
              {{ t('settingMessages.unreadTag', 'Unread') }}
            </span>
          </div>
          <span class="MessageTime">{{ formatTime(item.createdAt) }}</span>
        </div>
        <p class="MessageBody">
          {{ item.message }}
        </p>
        <div class="MessageFooter">
          <TxButton
            variant="flat"
            size="sm"
            :disabled="item.status === 'read'"
            @click="markMessage(item)"
          >
            {{ t('settingMessages.markRead', 'Mark read') }}
          </TxButton>
        </div>
      </li>
    </ul>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.MessageCount {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.MessageActions {
  display: flex;
  gap: 8px;
  margin: 6px 0 12px;
}

.MessageState {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.MessageList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.MessageItem {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.MessageItem.is-error {
  border-color: color-mix(in srgb, var(--el-color-danger) 35%, var(--el-border-color-lighter));
}

.MessageItem.is-warn {
  border-color: color-mix(in srgb, var(--el-color-warning) 35%, var(--el-border-color-lighter));
}

.MessageHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.MessageTitle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.MessageDot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--el-color-info);
}

.MessageItem.is-error .MessageDot {
  background: var(--el-color-danger);
}

.MessageItem.is-warn .MessageDot {
  background: var(--el-color-warning);
}

.MessageTitleText {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.MessageBadge {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  color: var(--el-text-color-primary);
}

.MessageTime {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.MessageBody {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

.MessageFooter {
  margin-top: 8px;
}
</style>
