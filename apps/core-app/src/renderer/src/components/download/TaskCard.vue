<script setup lang="ts">
import type { DownloadTask } from '@talex-touch/utils'
import { DownloadModule, DownloadStatus } from '@talex-touch/utils'
import { TxAlert, TxButton, TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appSetting } from '~/modules/channel/storage'
import ProgressBar from './DownloadProgressBar.vue'

interface Props {
  task: DownloadTask
  viewMode: 'detailed' | 'compact'
}

const props = defineProps<Props>()

defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  cancel: [taskId: string]
  retry: [taskId: string]
  remove: [taskId: string]
  delete: [taskId: string]
  'open-file': [taskId: string]
  'show-in-folder': [taskId: string]
  'show-details': [taskId: string]
}>()

const { t } = useI18n()

const statusClass = computed(() => `status-${props.task.status}`)

const statusColor = computed(() => {
  switch (props.task.status) {
    case DownloadStatus.DOWNLOADING:
      return '#111111'
    case DownloadStatus.COMPLETED:
      return '#1a1a1a'
    case DownloadStatus.FAILED:
      return '#444444'
    case DownloadStatus.PAUSED:
      return '#666666'
    case DownloadStatus.CANCELLED:
      return '#888888'
    default:
      return '#999999'
  }
})

const statusIcon = computed((): string => {
  switch (props.task.status) {
    case DownloadStatus.COMPLETED:
      return 'i-carbon-checkmark'
    case DownloadStatus.FAILED:
      return 'i-carbon-close'
    case DownloadStatus.PAUSED:
      return 'i-carbon-pause'
    case DownloadStatus.CANCELLED:
      return 'i-carbon-subtract'
    case DownloadStatus.PENDING:
      return 'i-carbon-time'
    default:
      return 'i-carbon-time'
  }
})

const showProgress = computed(() => {
  return [DownloadStatus.DOWNLOADING, DownloadStatus.PAUSED, DownloadStatus.COMPLETED].includes(
    props.task.status as DownloadStatus
  )
})

const showMoreActions = computed(() => {
  return props.viewMode === 'detailed'
})

const actionMenuOpen = ref(false)

function getModuleName(module: DownloadModule): string {
  const moduleNames = {
    [DownloadModule.APP_UPDATE]: t('download.module_app_update'),
    [DownloadModule.PLUGIN_INSTALL]: t('download.module_plugin_install'),
    [DownloadModule.RESOURCE_DOWNLOAD]: t('download.module_resource_download'),
    [DownloadModule.USER_MANUAL]: t('download.module_user_manual')
  }
  return moduleNames[module] || t('download.module_unknown')
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${bytes} B`
  }
}
</script>

<template>
  <div class="task-card" :class="[statusClass, { compact: viewMode === 'compact' }]">
    <div class="task-header">
      <div class="task-info">
        <div class="task-icon">
          <i v-if="task.status === 'downloading'" class="i-carbon-circle-dash loading-icon" />
          <i v-else :class="statusIcon" :style="{ color: statusColor }" />
        </div>
        <div class="task-details">
          <div class="task-name" :title="task.filename">
            {{ task.filename }}
          </div>
          <div v-if="viewMode === 'detailed'" class="task-meta">
            <span class="task-module">{{ getModuleName(task.module) }}</span>
            <span class="task-size">{{ formatSize(task.progress?.totalSize || 0) }}</span>
          </div>
        </div>
      </div>
      <div class="task-actions">
        <TxButton
          v-if="task.status === 'downloading'"
          size="small"
          circle
          @click="$emit('pause', task.id)"
        >
          <i class="i-carbon-pause" />
        </TxButton>
        <TxButton
          v-else-if="task.status === 'paused'"
          size="small"
          type="primary"
          circle
          @click="$emit('resume', task.id)"
        >
          <i class="i-carbon-play" />
        </TxButton>
        <TxButton
          v-if="task.status === 'failed'"
          size="small"
          type="warning"
          circle
          @click="$emit('retry', task.id)"
        >
          <i class="i-carbon-renew" />
        </TxButton>
        <TxButton
          v-if="task.status === 'completed'"
          size="small"
          type="success"
          circle
          @click="$emit('open-file', task.id)"
        >
          <i class="i-carbon-folder-open" />
        </TxButton>
        <TxDropdownMenu v-if="showMoreActions" v-model="actionMenuOpen" placement="bottom-end">
          <template #trigger>
            <TxButton size="small" circle>
              <i class="i-carbon-overflow-menu-vertical" />
            </TxButton>
          </template>
          <TxDropdownItem @select="$emit('show-details', task.id)">
            <i class="i-carbon-information" />
            {{ t('download.show_details') }}
          </TxDropdownItem>
          <TxDropdownItem
            v-if="task.status === 'completed'"
            @select="$emit('show-in-folder', task.id)"
          >
            <i class="i-carbon-folder" />
            {{ t('download.show_in_folder') }}
          </TxDropdownItem>
          <TxDropdownItem
            v-if="['pending', 'downloading', 'paused'].includes(task.status)"
            danger
            @select="$emit('cancel', task.id)"
          >
            <i class="i-carbon-close" />
            {{ t('download.cancel') }}
          </TxDropdownItem>
          <TxDropdownItem
            v-if="['completed', 'failed', 'cancelled'].includes(task.status)"
            danger
            @select="$emit('remove', task.id)"
          >
            <i class="i-carbon-subtract" />
            {{ t('download.remove_from_list') }}
          </TxDropdownItem>
          <TxDropdownItem
            v-if="task.status === 'completed'"
            danger
            @select="$emit('delete', task.id)"
          >
            <i class="i-carbon-trash-can" />
            {{ t('download.delete_file') }}
          </TxDropdownItem>
        </TxDropdownMenu>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="showProgress" class="task-progress">
      <ProgressBar
        :percentage="task.progress?.percentage || 0"
        :speed="task.progress?.speed || 0"
        :downloaded="task.progress?.downloadedSize || 0"
        :total="task.progress?.totalSize || 0"
        :remaining-time="task.progress?.remainingTime || 0"
        :status="task.status"
        :compact="viewMode === 'compact'"
      />
    </div>

    <!-- 错误信息 -->
    <div v-if="task.error && appSetting.searchEngine.logsEnabled" class="task-error">
      <TxAlert :title="task.error" type="error" :closable="false" :show-icon="true" />
    </div>
  </div>
</template>

<style scoped>
.task-card {
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color-light);
  border-left: 2px solid var(--task-accent);
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.2s ease;
  cursor: move;
  --task-accent: #111111;
  --task-strong: var(--tx-text-color-primary);
  --task-muted: var(--tx-text-color-secondary);
  --task-soft: var(--tx-text-color-regular);
}

.task-card:hover {
  border-color: var(--tx-border-color);
}

.task-card.compact {
  padding: 12px;
}

/* 状态样式 */
.status-downloading {
  --task-accent: #111111;
}

.status-completed {
  --task-accent: #1a1a1a;
}

.status-failed {
  --task-accent: #444444;
}

.status-paused {
  --task-accent: #666666;
}

.status-cancelled {
  --task-accent: #888888;
}

.status-pending {
  --task-accent: #999999;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-card.compact .task-header {
  margin-bottom: 8px;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.task-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--tx-border-color-light);
  flex-shrink: 0;
}

.task-card.compact .task-icon {
  width: 24px;
  height: 24px;
}

.loading-icon {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.task-details {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--task-strong);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card.compact .task-name {
  font-size: 14px;
}

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: var(--task-soft);
}

.task-meta span {
  display: inline-flex;
  align-items: center;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.task-actions :deep(.tx-button) {
  background: transparent;
  border-color: var(--tx-border-color-light);
  color: var(--task-strong);
}

.task-actions :deep(.tx-button:hover) {
  border-color: var(--task-strong);
}

.task-progress {
  margin-bottom: 8px;
}

.task-card.compact .task-progress {
  margin-bottom: 0;
}

.task-error {
  margin-top: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .task-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .task-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .task-meta {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
