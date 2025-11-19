<script setup lang="ts">
import { DownloadStatus } from '@talex-touch/utils'
import { computed } from 'vue'

interface Props {
  percentage: number
  speed: number
  downloaded: number
  total: number
  remainingTime: number
  status: DownloadStatus
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
})

const progressStatus = computed(() => {
  switch (props.status) {
    case DownloadStatus.COMPLETED:
      return 'success'
    case DownloadStatus.FAILED:
      return 'exception'
    case DownloadStatus.PAUSED:
      return 'warning'
    default:
      return undefined
  }
})

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }
  else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  }
  else {
    return `${bytesPerSecond.toFixed(0)} B/s`
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  else {
    return `${bytes} B`
  }
}

function formatRemainingTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`
  }
  else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`
  }
  else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
  }
}
</script>

<template>
  <div class="progress-bar-component" :class="{ compact }">
    <div class="progress-info">
      <div class="progress-left">
        <span class="progress-percentage">{{ percentage.toFixed(1) }}%</span>
        <span v-if="!compact && speed > 0" class="progress-speed">
          {{ formatSpeed(speed) }}
        </span>
      </div>
      <div class="progress-right">
        <span v-if="!compact" class="progress-size">
          {{ formatSize(downloaded) }} / {{ formatSize(total) }}
        </span>
        <span v-if="!compact && remainingTime > 0" class="progress-time">
          {{ formatRemainingTime(remainingTime) }}
        </span>
      </div>
    </div>
    <el-progress
      :percentage="percentage"
      :status="progressStatus"
      :show-text="false"
      :stroke-width="compact ? 4 : 8"
      :class="{ animated: status === 'downloading' }"
    />
  </div>
</template>

<style scoped>
.progress-bar-component {
  width: 100%;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.progress-bar-component.compact .progress-info {
  margin-bottom: 4px;
  font-size: 12px;
}

.progress-left,
.progress-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.progress-bar-component.compact .progress-left,
.progress-bar-component.compact .progress-right {
  gap: 8px;
}

.progress-percentage {
  font-weight: 600;
  color: var(--el-color-primary);
}

.progress-speed {
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.progress-size {
  color: var(--el-text-color-regular);
}

.progress-time {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

/* 进度条动画 */
.el-progress.animated :deep(.el-progress-bar__inner) {
  animation: progress-pulse 2s ease-in-out infinite;
}

@keyframes progress-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

/* 进度条样式优化 */
.el-progress :deep(.el-progress-bar__outer) {
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}

.el-progress :deep(.el-progress-bar__inner) {
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .progress-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .progress-left,
  .progress-right {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
