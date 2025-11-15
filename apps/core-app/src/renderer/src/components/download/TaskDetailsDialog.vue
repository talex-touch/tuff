<template>
  <el-dialog
    v-model="visible"
    :title="$t('download.task_details')"
    width="600px"
    @close="handleClose"
  >
    <div v-if="task" class="task-details">
      <!-- 基本信息 -->
      <div class="detail-section">
        <h3 class="section-title">{{ $t('download.basic_info') }}</h3>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.filename') }}:</span>
          <span class="detail-value">{{ task.filename }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.status') }}:</span>
          <el-tag :type="getStatusType(task.status)">
            {{ getStatusText(task.status) }}
          </el-tag>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.module') }}:</span>
          <span class="detail-value">{{ getModuleName(task.module) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.priority') }}:</span>
          <el-tag :type="getPriorityType(task.priority)">
            {{ getPriorityText(task.priority) }}
          </el-tag>
        </div>
      </div>

      <!-- 进度信息 -->
      <div v-if="task.progress" class="detail-section">
        <h3 class="section-title">{{ $t('download.progress_info') }}</h3>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.total_size') }}:</span>
          <span class="detail-value">{{ formatSize(task.progress.totalSize || 0) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.downloaded_size') }}:</span>
          <span class="detail-value">{{ formatSize(task.progress.downloadedSize || 0) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.percentage') }}:</span>
          <span class="detail-value">{{ task.progress.percentage?.toFixed(1) || 0 }}%</span>
        </div>
        <div v-if="task.status === 'downloading'" class="detail-item">
          <span class="detail-label">{{ $t('download.speed') }}:</span>
          <span class="detail-value">{{ formatSpeed(task.progress.speed || 0) }}</span>
        </div>
        <div v-if="task.status === 'downloading' && task.progress.remainingTime" class="detail-item">
          <span class="detail-label">{{ $t('download.remaining_time') }}:</span>
          <span class="detail-value">{{ formatRemainingTime(task.progress.remainingTime) }}</span>
        </div>
      </div>

      <!-- 文件信息 -->
      <div class="detail-section">
        <h3 class="section-title">{{ $t('download.file_info') }}</h3>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.url') }}:</span>
          <span class="detail-value url-text" :title="task.url">{{ task.url }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.destination') }}:</span>
          <span class="detail-value path-text" :title="task.destination">{{ task.destination }}</span>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="detail-section">
        <h3 class="section-title">{{ $t('download.time_info') }}</h3>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.created_at') }}:</span>
          <span class="detail-value">{{ formatDate(task.createdAt) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">{{ $t('download.updated_at') }}:</span>
          <span class="detail-value">{{ formatDate(task.updatedAt) }}</span>
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="task.error" class="detail-section">
        <h3 class="section-title error-title">{{ $t('download.error_info') }}</h3>
        <el-alert :title="task.error" type="error" :closable="false" show-icon />
      </div>

      <!-- 元数据 -->
      <div v-if="task.metadata && Object.keys(task.metadata).length > 0" class="detail-section">
        <h3 class="section-title">{{ $t('download.metadata') }}</h3>
        <div v-for="(value, key) in task.metadata" :key="key" class="detail-item">
          <span class="detail-label">{{ key }}:</span>
          <span class="detail-value">{{ value }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ $t('common.close') }}</el-button>
        <el-button
          v-if="task?.status === 'completed'"
          type="primary"
          @click="handleOpenFile"
        >
          <el-icon><FolderOpened /></el-icon>
          {{ $t('download.open_file') }}
        </el-button>
        <el-button
          v-if="task?.status === 'completed'"
          @click="handleShowInFolder"
        >
          <el-icon><Folder /></el-icon>
          {{ $t('download.show_in_folder') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpened, Folder } from '@element-plus/icons-vue'
import { DownloadTask, DownloadStatus, DownloadModule, DownloadPriority } from '@talex-touch/utils'

interface Props {
  modelValue: boolean
  task: DownloadTask | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'open-file', taskId: string): void
  (e: 'show-in-folder', taskId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const handleClose = () => {
  visible.value = false
}

const handleOpenFile = () => {
  if (props.task) {
    emit('open-file', props.task.id)
  }
}

const handleShowInFolder = () => {
  if (props.task) {
    emit('show-in-folder', props.task.id)
  }
}

const getStatusType = (status: DownloadStatus): 'primary' | 'success' | 'warning' | 'info' | 'danger' => {
  switch (status) {
    case DownloadStatus.DOWNLOADING:
      return 'primary'
    case DownloadStatus.COMPLETED:
      return 'success'
    case DownloadStatus.FAILED:
      return 'danger'
    case DownloadStatus.PAUSED:
      return 'warning'
    default:
      return 'info'
  }
}

const getStatusText = (status: DownloadStatus): string => {
  const statusMap = {
    [DownloadStatus.PENDING]: t('download.status_pending'),
    [DownloadStatus.DOWNLOADING]: t('download.status_downloading'),
    [DownloadStatus.COMPLETED]: t('download.status_completed'),
    [DownloadStatus.FAILED]: t('download.status_failed'),
    [DownloadStatus.PAUSED]: t('download.status_paused'),
    [DownloadStatus.CANCELLED]: t('download.status_cancelled')
  }
  return statusMap[status] || status
}

const getModuleName = (module: DownloadModule): string => {
  const moduleMap = {
    [DownloadModule.APP_UPDATE]: t('download.module_app_update'),
    [DownloadModule.PLUGIN_INSTALL]: t('download.module_plugin_install'),
    [DownloadModule.RESOURCE_DOWNLOAD]: t('download.module_resource_download'),
    [DownloadModule.USER_MANUAL]: t('download.module_user_manual')
  }
  return moduleMap[module] || module
}

const getPriorityType = (priority: number): 'primary' | 'success' | 'warning' | 'info' | 'danger' => {
  if (priority >= DownloadPriority.CRITICAL) return 'danger'
  if (priority >= DownloadPriority.HIGH) return 'warning'
  if (priority >= DownloadPriority.NORMAL) return 'primary'
  return 'info'
}

const getPriorityText = (priority: number): string => {
  if (priority >= DownloadPriority.CRITICAL) return t('download.priority_critical')
  if (priority >= DownloadPriority.HIGH) return t('download.priority_high')
  if (priority >= DownloadPriority.NORMAL) return t('download.priority_normal')
  return t('download.priority_low')
}

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  } else {
    return `${bytes} B`
  }
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  } else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  } else {
    return `${bytesPerSecond.toFixed(0)} B/s`
  }
}

const formatRemainingTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}${t('common.seconds')}`
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60)
    return `${minutes}${t('common.minutes')}`
  } else {
    const hours = Math.round(seconds / 3600)
    return `${hours}${t('common.hours')}`
  }
}

const formatDate = (date: Date | number | undefined): string => {
  if (!date) return '-'
  const d = typeof date === 'number' ? new Date(date) : date
  return d.toLocaleString()
}
</script>

<style scoped>
.task-details {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 16px 0;
}

.error-title {
  color: var(--el-color-danger);
}

.detail-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-label {
  flex-shrink: 0;
  min-width: 120px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.detail-value {
  flex: 1;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.url-text,
.path-text {
  font-family: monospace;
  font-size: 12px;
  background: var(--el-bg-color-page);
  padding: 4px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 滚动条样式 */
.task-details::-webkit-scrollbar {
  width: 6px;
}

.task-details::-webkit-scrollbar-track {
  background: var(--el-bg-color-page);
  border-radius: 3px;
}

.task-details::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.task-details::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color-dark);
}
</style>
