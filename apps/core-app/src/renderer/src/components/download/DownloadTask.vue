<script setup lang="ts">
import type { DownloadTask } from '@talex-touch/utils'
import { DownloadModule, DownloadPriority, DownloadStatus } from '@talex-touch/utils'
import { TuffProgress, TxAlert, TxStack } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Props
interface Props {
  task: DownloadTask
}

const props = defineProps<Props>()
const { t } = useI18n()

// Emits - defined for type safety, even if not used directly
defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  cancel: [taskId: string]
  retry: [taskId: string]
  remove: [taskId: string]
}>()

// 任务状态样式类
const taskStatusClass = computed(() => ({
  'task-downloading': props.task.status === DownloadStatus.DOWNLOADING,
  'task-completed': props.task.status === DownloadStatus.COMPLETED,
  'task-failed': props.task.status === DownloadStatus.FAILED,
  'task-paused': props.task.status === DownloadStatus.PAUSED,
  'task-cancelled': props.task.status === DownloadStatus.CANCELLED,
  'task-pending': props.task.status === DownloadStatus.PENDING
}))

// 是否显示进度条
const showProgress = computed(() => {
  return [DownloadStatus.DOWNLOADING, DownloadStatus.COMPLETED, DownloadStatus.FAILED].includes(
    props.task.status as DownloadStatus
  )
})

// 获取模块名称
function getModuleName(module: DownloadModule): string {
  const moduleNames = {
    [DownloadModule.APP_UPDATE]: t('download.module_app_update'),
    [DownloadModule.PLUGIN_INSTALL]: t('download.module_plugin_install'),
    [DownloadModule.RESOURCE_DOWNLOAD]: t('download.module_resource_download'),
    [DownloadModule.USER_MANUAL]: t('download.module_user_manual')
  }
  return moduleNames[module] || t('download.module_unknown')
}

// 获取任务状态颜色
function getTaskStatusColor(status: DownloadStatus): string {
  switch (status) {
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
}

// 获取任务状态图标
function getTaskStatusIcon(status: DownloadStatus): string {
  switch (status) {
    case DownloadStatus.COMPLETED:
      return 'i-carbon-checkmark'
    case DownloadStatus.FAILED:
      return 'i-carbon-close'
    case DownloadStatus.PAUSED:
      return 'i-carbon-pause'
    case DownloadStatus.CANCELLED:
      return 'i-carbon-close'
    case DownloadStatus.PENDING:
      return 'i-carbon-time'
    default:
      return 'i-carbon-time'
  }
}

// 获取进度条状态
function getProgressStatus(status: DownloadStatus): '' | 'success' | 'warning' | 'error' {
  switch (status) {
    case DownloadStatus.COMPLETED:
      return 'success'
    case DownloadStatus.FAILED:
      return 'error'
    default:
      return ''
  }
}

// 获取优先级颜色
function getPriorityColor(priority: DownloadPriority): string {
  if (priority >= DownloadPriority.CRITICAL) {
    return '#111111'
  } else if (priority >= DownloadPriority.HIGH) {
    return '#333333'
  } else if (priority >= DownloadPriority.NORMAL) {
    return '#666666'
  } else if (priority >= DownloadPriority.LOW) {
    return '#888888'
  } else {
    return '#aaaaaa'
  }
}

// 获取优先级名称
function getPriorityName(priority: DownloadPriority): string {
  if (priority >= DownloadPriority.CRITICAL) {
    return t('download.priority_critical')
  } else if (priority >= DownloadPriority.HIGH) {
    return t('download.priority_high')
  } else if (priority >= DownloadPriority.NORMAL) {
    return t('download.priority_normal')
  } else if (priority >= DownloadPriority.LOW) {
    return t('download.priority_low')
  } else {
    return t('download.priority_background')
  }
}

// 格式化速度显示
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  } else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  } else {
    return `${bytesPerSecond.toFixed(0)} B/s`
  }
}

// 格式化大小显示
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${bytes.toFixed(0)} B`
  }
}

// 格式化剩余时间
function formatRemainingTime(seconds: number): string {
  if (seconds < 60) {
    return t('download.duration_seconds', { count: Math.round(seconds) })
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60)
    return t('download.duration_minutes', { count: minutes })
  } else {
    const hours = Math.round(seconds / 3600)
    return t('download.duration_hours', { count: hours })
  }
}
</script>

<template>
  <div class="download-task" :class="taskStatusClass">
    <div class="task-header">
      <div class="task-info">
        <div class="task-icon">
          <i v-if="task.status === 'downloading'" class="i-carbon-circle-dash loading" />
          <i
            v-else
            :class="getTaskStatusIcon(task.status)"
            :style="{ color: getTaskStatusColor(task.status) }"
          />
        </div>
        <div class="task-details">
          <div class="task-name">
            {{ task.filename }}
          </div>
          <div class="task-meta">
            <span class="task-module">{{ getModuleName(task.module) }}</span>
            <span class="task-size">{{ formatSize(task.progress?.totalSize || 0) }}</span>
            <span v-if="task.progress?.speed" class="task-speed">
              {{ formatSpeed(task.progress.speed) }}
            </span>
          </div>
        </div>
      </div>
      <div class="task-actions">
        <TxButton
          v-if="task.status === 'downloading'"
          size="small"
          @click="$emit('pause', task.id)"
        >
          <i class="i-carbon-pause" />
          {{ t('download.pause') }}
        </TxButton>
        <TxButton
          v-else-if="task.status === 'paused'"
          size="small"
          type="primary"
          @click="$emit('resume', task.id)"
        >
          <i class="i-carbon-play" />
          {{ t('download.resume') }}
        </TxButton>
        <TxButton
          v-if="task.status === 'failed'"
          size="small"
          type="warning"
          @click="$emit('retry', task.id)"
        >
          <i class="i-carbon-renew" />
          {{ t('download.retry') }}
        </TxButton>
        <TxButton
          v-if="['pending', 'downloading', 'paused'].includes(task.status)"
          size="small"
          type="danger"
          @click="$emit('cancel', task.id)"
        >
          <i class="i-carbon-close" />
          {{ t('download.cancel') }}
        </TxButton>
        <TxButton
          v-if="['completed', 'failed', 'cancelled'].includes(task.status)"
          size="small"
          type="danger"
          @click="$emit('remove', task.id)"
        >
          <i class="i-carbon-trash-can" />
          {{ t('download.remove') }}
        </TxButton>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="showProgress" class="task-progress">
      <div class="progress-info">
        <span class="progress-text"> {{ task.progress?.percentage || 0 }}% </span>
        <span v-if="task.progress?.remainingTime" class="remaining-time">
          {{ formatRemainingTime(task.progress.remainingTime) }}
        </span>
      </div>
      <TuffProgress
        :percentage="task.progress?.percentage || 0"
        :status="getProgressStatus(task.status)"
        :show-text="false"
      />
    </div>

    <!-- 错误信息 -->
    <div v-if="task.error" class="task-error">
      <TxAlert :title="task.error" type="error" :closable="false" :show-icon="true" />
    </div>

    <!-- 任务详情 -->
    <div class="task-details-expanded">
      <TxStack class="task-detail-grid" direction="horizontal" :gap="16" wrap>
        <div class="detail-column">
          <div class="detail-item">
            <span class="detail-label">{{ t('download.url') }}:</span>
            <span class="detail-value">{{ task.url }}</span>
          </div>
        </div>
        <div class="detail-column">
          <div class="detail-item">
            <span class="detail-label">{{ t('download.destination') }}:</span>
            <span class="detail-value">{{ task.destination }}</span>
          </div>
        </div>
        <div class="detail-column">
          <div class="detail-item">
            <span class="detail-label">{{ t('download.priority') }}:</span>
            <span class="detail-value" :style="{ color: getPriorityColor(task.priority) }">
              {{ getPriorityName(task.priority) }}
            </span>
          </div>
        </div>
      </TxStack>
    </div>
  </div>
</template>

<style scoped>
.download-task {
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color-light);
  border-left: 2px solid var(--task-accent);
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.2s ease;
  --task-accent: #111111;
  --task-strong: var(--tx-text-color-primary);
  --task-muted: var(--tx-text-color-secondary);
  --task-soft: var(--tx-text-color-regular);
}

.download-task:hover {
  border-color: var(--tx-border-color);
}

.task-downloading {
  --task-accent: #111111;
}

.task-completed {
  --task-accent: #1a1a1a;
}

.task-failed {
  --task-accent: #444444;
}

.task-paused {
  --task-accent: #666666;
}

.task-cancelled {
  --task-accent: #888888;
}

.task-pending {
  --task-accent: #999999;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.task-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--tx-border-color-light);
}

.task-icon .loading {
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
}

.task-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--task-strong);
  margin-bottom: 4px;
  word-break: break-all;
}

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: var(--task-soft);
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-progress {
  margin-bottom: 12px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.progress-text {
  font-weight: 600;
  color: var(--task-strong);
}

.remaining-time {
  color: var(--task-soft);
}

.task-error {
  margin-bottom: 12px;
}

.task-details-expanded {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.task-detail-grid {
  width: 100%;
}

.detail-column {
  flex: 1 1 0;
  min-width: 180px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--task-muted);
  font-weight: 500;
}

.detail-value {
  font-size: 14px;
  color: var(--task-strong);
  word-break: break-all;
}

.task-actions :deep(.tx-button) {
  background: transparent;
  border-color: var(--tx-border-color-light);
  color: var(--task-strong);
  height: 28px;
  padding: 0 10px;
}

.task-actions :deep(.tx-button:hover) {
  border-color: var(--task-strong);
}

.task-progress :deep(.tx-progress-bar__track) {
  background-color: var(--tx-fill-color-light);
}

.task-progress :deep(.tx-progress-bar) {
  background-color: var(--task-strong);
  transition: width 0.3s ease;
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
