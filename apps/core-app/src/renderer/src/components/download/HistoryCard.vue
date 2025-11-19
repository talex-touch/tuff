<script setup lang="ts">
import type { DownloadHistory } from '@talex-touch/utils'
import {
  Box,
  Calendar,
  Check,
  Close,
  Delete,
  Files,
  Folder,
  FolderOpened,
  Odometer,
  Remove,
  Timer,
} from '@element-plus/icons-vue'
import { DownloadModule, DownloadStatus } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  history: DownloadHistory
}

const props = defineProps<Props>()

defineEmits<{
  'open-file': [historyId: string]
  'show-in-folder': [historyId: string]
  'clear': [historyId: string]
}>()

const { t } = useI18n()

const statusClass = computed(() => `status-${props.history.status}`)

const statusColor = computed(() => {
  switch (props.history.status) {
    case DownloadStatus.COMPLETED:
      return '#67C23A'
    case DownloadStatus.FAILED:
      return '#F56C6C'
    case DownloadStatus.CANCELLED:
      return '#909399'
    default:
      return '#909399'
  }
})

const statusIcon = computed(() => {
  switch (props.history.status) {
    case DownloadStatus.COMPLETED:
      return Check
    case DownloadStatus.FAILED:
      return Close
    case DownloadStatus.CANCELLED:
      return Remove
    default:
      return Check
  }
})

function getModuleName(module: DownloadModule): string {
  const moduleNames = {
    [DownloadModule.APP_UPDATE]: t('download.module_app_update'),
    [DownloadModule.PLUGIN_INSTALL]: t('download.module_plugin_install'),
    [DownloadModule.RESOURCE_DOWNLOAD]: t('download.module_resource_download'),
    [DownloadModule.USER_MANUAL]: t('download.module_user_manual'),
  }
  return moduleNames[module] || t('download.module_unknown')
}

function getStatusText(status: DownloadStatus): string {
  const statusTexts = {
    [DownloadStatus.COMPLETED]: t('download.status_completed'),
    [DownloadStatus.FAILED]: t('download.status_failed'),
    [DownloadStatus.CANCELLED]: t('download.status_cancelled'),
  }
  return statusTexts[status] || status
}

function formatDate(date: Date | undefined): string {
  if (!date)
    return '-'

  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  // 小于1分钟
  if (diff < 60 * 1000) {
    return t('download.just_now')
  }

  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return t('download.minutes_ago', { count: minutes })
  }

  // 小于1天
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return t('download.hours_ago', { count: hours })
  }

  // 小于7天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return t('download.days_ago', { count: days })
  }

  // 显示完整日期
  return d.toLocaleDateString()
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

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}${t('download.seconds')}`
  }
  else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}${t('download.minutes')}${secs}${t('download.seconds')}`
  }
  else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}${t('download.hours')}${minutes}${t('download.minutes')}`
  }
}

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
</script>

<template>
  <div class="history-card" :class="statusClass">
    <div class="card-content">
      <!-- 左侧图标和信息 -->
      <div class="history-info">
        <div class="history-icon">
          <el-icon :color="statusColor">
            <component :is="statusIcon" />
          </el-icon>
        </div>
        <div class="history-details">
          <div class="history-name" :title="history.filename">
            {{ history.filename }}
          </div>
          <div class="history-meta">
            <span class="meta-item">
              <el-icon><Calendar /></el-icon>
              {{ formatDate(history.completedAt || history.createdAt) }}
            </span>
            <span class="meta-item">
              <el-icon><Files /></el-icon>
              {{ formatSize(history.totalSize || 0) }}
            </span>
            <span class="meta-item">
              <el-icon><Box /></el-icon>
              {{ getModuleName(history.module) }}
            </span>
            <span v-if="history.duration" class="meta-item">
              <el-icon><Timer /></el-icon>
              {{ formatDuration(history.duration) }}
            </span>
            <span v-if="history.averageSpeed" class="meta-item">
              <el-icon><Odometer /></el-icon>
              {{ formatSpeed(history.averageSpeed) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 右侧操作按钮 -->
      <div class="history-actions">
        <el-tooltip
          v-if="history.status === DownloadStatus.COMPLETED"
          :content="$t('download.open_file')"
          placement="top"
        >
          <el-button
            size="small"
            type="primary"
            circle
            @click="$emit('open-file', history.id)"
          >
            <el-icon><FolderOpened /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          v-if="history.status === DownloadStatus.COMPLETED"
          :content="$t('download.show_in_folder')"
          placement="top"
        >
          <el-button
            size="small"
            circle
            @click="$emit('show-in-folder', history.id)"
          >
            <el-icon><Folder /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          :content="$t('download.clear_history_item')"
          placement="top"
        >
          <el-button
            size="small"
            type="danger"
            circle
            @click="$emit('clear', history.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 状态标签 -->
    <div class="status-badge" :style="{ backgroundColor: statusColor }">
      {{ getStatusText(history.status) }}
    </div>
  </div>
</template>

<style scoped>
.history-card {
  position: relative;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
  overflow: hidden;
}

.history-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-border-color);
}

/* 状态样式 */
.status-completed {
  border-left: 4px solid #67c23a;
}

.status-failed {
  border-left: 4px solid #f56c6c;
}

.status-cancelled {
  border-left: 4px solid #909399;
}

.card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.history-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.history-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--el-bg-color-page);
  flex-shrink: 0;
}

.history-icon .el-icon {
  font-size: 20px;
}

.history-details {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-item .el-icon {
  font-size: 14px;
}

.history-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.status-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  opacity: 0.9;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .card-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .history-info {
    width: 100%;
  }

  .history-meta {
    flex-direction: column;
    gap: 8px;
  }

  .history-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .status-badge {
    position: static;
    align-self: flex-start;
    margin-top: 8px;
  }
}
</style>
