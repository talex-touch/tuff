<template>
  <div class="download-task" :class="taskStatusClass">
    <div class="task-header">
      <div class="task-info">
        <div class="task-icon">
          <el-icon v-if="task.status === 'downloading'" class="loading">
            <Loading />
          </el-icon>
          <el-icon v-else :color="getTaskStatusColor(task.status)">
            <component :is="getTaskStatusIcon(task.status)" />
          </el-icon>
        </div>
        <div class="task-details">
          <div class="task-name">{{ task.filename }}</div>
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
        <el-button
          v-if="task.status === 'downloading'"
          size="small"
          @click="$emit('pause', task.id)"
        >
          <el-icon><VideoPause /></el-icon>
          {{ $t('download.pause') }}
        </el-button>
        <el-button
          v-else-if="task.status === 'paused'"
          size="small"
          type="primary"
          @click="$emit('resume', task.id)"
        >
          <el-icon><VideoPlay /></el-icon>
          {{ $t('download.resume') }}
        </el-button>
        <el-button
          v-if="task.status === 'failed'"
          size="small"
          type="warning"
          @click="$emit('retry', task.id)"
        >
          <el-icon><Refresh /></el-icon>
          {{ $t('download.retry') }}
        </el-button>
        <el-button
          v-if="['pending', 'downloading', 'paused'].includes(task.status)"
          size="small"
          type="danger"
          @click="$emit('cancel', task.id)"
        >
          <el-icon><Close /></el-icon>
          {{ $t('download.cancel') }}
        </el-button>
        <el-button
          v-if="['completed', 'failed', 'cancelled'].includes(task.status)"
          size="small"
          type="danger"
          @click="$emit('remove', task.id)"
        >
          <el-icon><Delete /></el-icon>
          {{ $t('download.remove') }}
        </el-button>
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
      <el-progress
        :percentage="task.progress?.percentage || 0"
        :status="getProgressStatus(task.status)"
        :show-text="false"
      />
    </div>

    <!-- 错误信息 -->
    <div v-if="task.error" class="task-error">
      <el-alert :title="task.error" type="error" :closable="false" show-icon />
    </div>

    <!-- 任务详情 -->
    <div class="task-details-expanded">
      <el-row :gutter="16">
        <el-col :span="8">
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.url') }}:</span>
            <span class="detail-value">{{ task.url }}</span>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.destination') }}:</span>
            <span class="detail-value">{{ task.destination }}</span>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.priority') }}:</span>
            <span class="detail-value" :style="{ color: getPriorityColor(task.priority) }">
              {{ getPriorityName(task.priority) }}
            </span>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Loading,
  Check,
  Close,
  VideoPause,
  VideoPlay,
  Refresh,
  Delete,
  Clock,
  Remove
} from '@element-plus/icons-vue'
import { DownloadTask, DownloadStatus, DownloadModule, DownloadPriority } from '@talex-touch/utils'

// Props
interface Props {
  task: DownloadTask
}

const props = defineProps<Props>()

// Emits
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
const getModuleName = (module: DownloadModule): string => {
  const moduleNames = {
    [DownloadModule.APP_UPDATE]: '应用更新',
    [DownloadModule.PLUGIN_INSTALL]: '插件安装',
    [DownloadModule.RESOURCE_DOWNLOAD]: '资源下载',
    [DownloadModule.USER_MANUAL]: '手动下载'
  }
  return moduleNames[module] || '未知'
}

// 获取任务状态颜色
const getTaskStatusColor = (status: DownloadStatus): string => {
  switch (status) {
    case DownloadStatus.DOWNLOADING:
      return '#409EFF'
    case DownloadStatus.COMPLETED:
      return '#67C23A'
    case DownloadStatus.FAILED:
      return '#F56C6C'
    case DownloadStatus.PAUSED:
      return '#E6A23C'
    case DownloadStatus.CANCELLED:
      return '#909399'
    default:
      return '#909399'
  }
}

// 获取任务状态图标
const getTaskStatusIcon = (status: DownloadStatus) => {
  switch (status) {
    case DownloadStatus.COMPLETED:
      return Check
    case DownloadStatus.FAILED:
      return Close
    case DownloadStatus.PAUSED:
      return VideoPause
    case DownloadStatus.CANCELLED:
      return Remove
    case DownloadStatus.PENDING:
      return Clock
    default:
      return Clock
  }
}

// 获取进度条状态
const getProgressStatus = (status: DownloadStatus): string => {
  switch (status) {
    case DownloadStatus.COMPLETED:
      return 'success'
    case DownloadStatus.FAILED:
      return 'exception'
    default:
      return ''
  }
}

// 获取优先级颜色
const getPriorityColor = (priority: DownloadPriority): string => {
  if (priority >= DownloadPriority.CRITICAL) {
    return '#ff4757'
  } else if (priority >= DownloadPriority.HIGH) {
    return '#ffa502'
  } else if (priority >= DownloadPriority.NORMAL) {
    return '#2ed573'
  } else if (priority >= DownloadPriority.LOW) {
    return '#70a1ff'
  } else {
    return '#a4b0be'
  }
}

// 获取优先级名称
const getPriorityName = (priority: DownloadPriority): string => {
  if (priority >= DownloadPriority.CRITICAL) {
    return '关键'
  } else if (priority >= DownloadPriority.HIGH) {
    return '高'
  } else if (priority >= DownloadPriority.NORMAL) {
    return '普通'
  } else if (priority >= DownloadPriority.LOW) {
    return '低'
  } else {
    return '后台'
  }
}

// 格式化速度显示
const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  } else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  } else {
    return `${bytesPerSecond.toFixed(0)} B/s`
  }
}

// 格式化大小显示
const formatSize = (bytes: number): string => {
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
const formatRemainingTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60)
    return `${minutes}分钟`
  } else {
    const hours = Math.round(seconds / 3600)
    return `${hours}小时`
  }
}
</script>

<style scoped>
.download-task {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
}

.download-task:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.task-downloading {
  border-left: 4px solid #409eff;
}

.task-completed {
  border-left: 4px solid #67c23a;
}

.task-failed {
  border-left: 4px solid #f56c6c;
}

.task-paused {
  border-left: 4px solid #e6a23c;
}

.task-cancelled {
  border-left: 4px solid #909399;
}

.task-pending {
  border-left: 4px solid #909399;
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
  background: var(--el-bg-color-page);
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
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  word-break: break-all;
}

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
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
  color: var(--el-color-primary);
}

.remaining-time {
  color: var(--el-text-color-regular);
}

.task-error {
  margin-bottom: 12px;
}

.task-details-expanded {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.detail-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
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
