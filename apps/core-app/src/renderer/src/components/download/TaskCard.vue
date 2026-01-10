<script setup lang="ts">
import type { DownloadTask } from '@talex-touch/utils'
import {
  Check,
  Clock,
  Close,
  Delete,
  Folder,
  FolderOpened,
  InfoFilled,
  Loading,
  MoreFilled,
  Refresh,
  Remove,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { DownloadModule, DownloadStatus } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { appSetting } from '~/modules/channel/storage'
import ProgressBar from './DownloadProgressBar.vue'

interface Props {
  task: DownloadTask
  viewMode: 'detailed' | 'compact'
}

const props = defineProps<Props>()

defineEmits<{
  'pause': [taskId: string]
  'resume': [taskId: string]
  'cancel': [taskId: string]
  'retry': [taskId: string]
  'remove': [taskId: string]
  'delete': [taskId: string]
  'open-file': [taskId: string]
  'show-in-folder': [taskId: string]
  'show-details': [taskId: string]
}>()

useI18n()

const statusClass = computed(() => `status-${props.task.status}`)

const statusColor = computed(() => {
  switch (props.task.status) {
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
})

const statusIcon = computed(() => {
  switch (props.task.status) {
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
})

const showProgress = computed(() => {
  return [
    DownloadStatus.DOWNLOADING,
    DownloadStatus.PAUSED,
    DownloadStatus.COMPLETED,
  ].includes(props.task.status as DownloadStatus)
})

const showMoreActions = computed(() => {
  return props.viewMode === 'detailed'
})

function getModuleName(module: DownloadModule): string {
  const moduleNames = {
    [DownloadModule.APP_UPDATE]: '应用更新',
    [DownloadModule.PLUGIN_INSTALL]: '插件安装',
    [DownloadModule.RESOURCE_DOWNLOAD]: '资源下载',
    [DownloadModule.USER_MANUAL]: '手动下载',
  }
  return moduleNames[module] || '未知'
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
</script>

<template>
  <div class="task-card" :class="[statusClass, { compact: viewMode === 'compact' }]">
    <div class="task-header">
      <div class="task-info">
        <div class="task-icon">
          <el-icon v-if="task.status === 'downloading'" class="loading-icon">
            <Loading />
          </el-icon>
          <el-icon v-else :color="statusColor">
            <component :is="statusIcon" />
          </el-icon>
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
        <el-button
          v-if="task.status === 'downloading'"
          size="small"
          circle
          @click="$emit('pause', task.id)"
        >
          <el-icon><VideoPause /></el-icon>
        </el-button>
        <el-button
          v-else-if="task.status === 'paused'"
          size="small"
          type="primary"
          circle
          @click="$emit('resume', task.id)"
        >
          <el-icon><VideoPlay /></el-icon>
        </el-button>
        <el-button
          v-if="task.status === 'failed'"
          size="small"
          type="warning"
          circle
          @click="$emit('retry', task.id)"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button
          v-if="task.status === 'completed'"
          size="small"
          type="success"
          circle
          @click="$emit('open-file', task.id)"
        >
          <el-icon><FolderOpened /></el-icon>
        </el-button>
        <el-dropdown v-if="showMoreActions" trigger="click">
          <el-button size="small" circle>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="$emit('show-details', task.id)">
                <el-icon><InfoFilled /></el-icon>
                {{ $t('download.show_details') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-if="task.status === 'completed'"
                @click="$emit('show-in-folder', task.id)"
              >
                <el-icon><Folder /></el-icon>
                {{ $t('download.show_in_folder') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-if="['pending', 'downloading', 'paused'].includes(task.status)"
                divided
                @click="$emit('cancel', task.id)"
              >
                <el-icon><Close /></el-icon>
                {{ $t('download.cancel') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-if="['completed', 'failed', 'cancelled'].includes(task.status)"
                divided
                @click="$emit('remove', task.id)"
              >
                <el-icon><Remove /></el-icon>
                {{ $t('download.remove_from_list') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-if="task.status === 'completed'"
                @click="$emit('delete', task.id)"
              >
                <el-icon><Delete /></el-icon>
                {{ $t('download.delete_file') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
      <el-alert :title="task.error" type="error" :closable="false" show-icon />
    </div>
  </div>
</template>

<style scoped>
.task-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
  cursor: move;
}

.task-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-border-color);
}

.task-card.compact {
  padding: 12px;
}

/* 状态样式 */
.status-downloading {
  border-left: 4px solid #409eff;
}

.status-completed {
  border-left: 4px solid #67c23a;
}

.status-failed {
  border-left: 4px solid #f56c6c;
}

.status-paused {
  border-left: 4px solid #e6a23c;
}

.status-cancelled {
  border-left: 4px solid #909399;
}

.status-pending {
  border-left: 4px solid #909399;
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
  background: var(--el-bg-color-page);
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
  color: var(--el-text-color-primary);
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
  color: var(--el-text-color-regular);
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
