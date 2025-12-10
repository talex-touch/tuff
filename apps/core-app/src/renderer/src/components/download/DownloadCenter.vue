<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import DownloadTaskItem from './DownloadTask.vue'

const { t } = useI18n()

const {
  downloadTasks,
  taskStats,
  tasksByStatus,
  currentDownloadSpeed,
  pauseTask: pauseTaskHook,
  resumeTask: resumeTaskHook,
  cancelTask: cancelTaskHook,
  formatSpeed,
} = useDownloadCenter()

const hasActiveTasks = computed(() => taskStats.value.downloading > 0 || taskStats.value.pending > 0)

async function pauseTask(taskId: string) {
  try {
    await pauseTaskHook(taskId)
    toast.success(t('download.messages.paused'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.messages.pauseFailed')}: ${message}`)
  }
}

async function cancelTask(taskId: string) {
  try {
    await cancelTaskHook(taskId)
    toast.success(t('download.messages.cancelled'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.messages.cancelFailed')}: ${message}`)
  }
}

async function retryTask(taskId: string) {
  try {
    await resumeTaskHook(taskId)
    toast.success(t('download.messages.retrying'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.messages.retryFailed')}: ${message}`)
  }
}

function removeTask(_taskId: string) {
  toast.success(t('download.messages.removed'))
}
</script>

<template>
  <div class="download-center">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card speed" :class="{ active: hasActiveTasks }">
        <div class="stat-icon">
          <i class="i-carbon-arrow-down" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ formatSpeed(currentDownloadSpeed) }}</div>
          <div class="stat-label">{{ $t('download.current_speed') }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon downloading">
          <i class="i-carbon-in-progress" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ taskStats.downloading }}</div>
          <div class="stat-label">{{ $t('download.active_downloads') }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon completed">
          <i class="i-carbon-checkmark-filled" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ taskStats.completed }}</div>
          <div class="stat-label">{{ $t('download.total_completed') }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon failed">
          <i class="i-carbon-warning-filled" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ taskStats.failed }}</div>
          <div class="stat-label">{{ $t('download.total_failed') }}</div>
        </div>
      </div>
    </div>

    <!-- 下载任务列表 -->
    <div class="download-tasks">
      <!-- 进行中的任务 -->
      <div v-if="tasksByStatus.downloading.length > 0" class="task-section">
        <div class="section-header">
          <i class="i-carbon-in-progress section-icon downloading" />
          <span class="section-title">{{ $t('download.downloading') }}</span>
          <span class="section-count">{{ tasksByStatus.downloading.length }}</span>
        </div>
        <div class="task-list">
          <DownloadTaskItem
            v-for="task in tasksByStatus.downloading"
            :key="task.id"
            :task="task"
            @pause="pauseTask"
            @cancel="cancelTask"
          />
        </div>
      </div>

      <!-- 等待中的任务 -->
      <div v-if="tasksByStatus.pending.length > 0" class="task-section">
        <div class="section-header">
          <i class="i-carbon-time section-icon pending" />
          <span class="section-title">{{ $t('download.waiting') }}</span>
          <span class="section-count">{{ tasksByStatus.pending.length }}</span>
        </div>
        <div class="task-list">
          <DownloadTaskItem
            v-for="task in tasksByStatus.pending"
            :key="task.id"
            :task="task"
            @pause="pauseTask"
            @cancel="cancelTask"
          />
        </div>
      </div>

      <!-- 已完成的任务 -->
      <div v-if="tasksByStatus.completed.length > 0" class="task-section">
        <div class="section-header">
          <i class="i-carbon-checkmark-filled section-icon completed" />
          <span class="section-title">{{ $t('download.completed') }}</span>
          <span class="section-count">{{ tasksByStatus.completed.length }}</span>
        </div>
        <div class="task-list">
          <DownloadTaskItem
            v-for="task in tasksByStatus.completed"
            :key="task.id"
            :task="task"
            @remove="removeTask"
          />
        </div>
      </div>

      <!-- 失败的任务 -->
      <div v-if="tasksByStatus.failed.length > 0" class="task-section">
        <div class="section-header">
          <i class="i-carbon-warning-filled section-icon failed" />
          <span class="section-title">{{ $t('download.failed') }}</span>
          <span class="section-count">{{ tasksByStatus.failed.length }}</span>
        </div>
        <div class="task-list">
          <DownloadTaskItem
            v-for="task in tasksByStatus.failed"
            :key="task.id"
            :task="task"
            @retry="retryTask"
            @remove="removeTask"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="downloadTasks.length === 0" class="empty-state">
        <div class="empty-icon">
          <i class="i-carbon-cloud-download" />
        </div>
        <div class="empty-text">{{ $t('download.no_tasks') }}</div>
        <div class="empty-hint">{{ $t('download.no_tasks_hint') }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.download-center {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

// Stats Grid
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-border-color);
  }

  &.speed.active {
    background: rgba(var(--el-color-primary-rgb), 0.08);
    border-color: var(--el-color-primary-light-5);
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);

    &.downloading {
      background: rgba(var(--el-color-primary-rgb), 0.1);
      color: var(--el-color-primary);
    }

    &.completed {
      background: rgba(var(--el-color-success-rgb), 0.1);
      color: var(--el-color-success);
    }

    &.failed {
      background: rgba(var(--el-color-danger-rgb), 0.1);
      color: var(--el-color-danger);
    }
  }

  .stat-info {
    flex: 1;
    min-width: 0;

    .stat-value {
      font-size: 20px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      font-variant-numeric: tabular-nums;
    }

    .stat-label {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-top: 2px;
    }
  }
}

// Task Sections
.download-tasks {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-section {
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .section-icon {
      font-size: 16px;

      &.downloading { color: var(--el-color-primary); }
      &.pending { color: var(--el-color-warning); }
      &.completed { color: var(--el-color-success); }
      &.failed { color: var(--el-color-danger); }
    }

    .section-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }

    .section-count {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color);
      padding: 2px 8px;
      border-radius: 10px;
    }
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

// Empty State
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--el-text-color-secondary);

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 16px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  .empty-hint {
    font-size: 13px;
  }
}

// Responsive
@media (max-width: 768px) {
  .download-center {
    padding: 16px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-card {
    padding: 12px;

    .stat-icon {
      width: 32px;
      height: 32px;
      font-size: 16px;
    }

    .stat-info .stat-value {
      font-size: 16px;
    }
  }
}
</style>
