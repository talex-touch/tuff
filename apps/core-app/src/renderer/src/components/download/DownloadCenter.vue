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
  formatSpeed
} = useDownloadCenter()

const hasActiveTasks = computed(
  () => taskStats.value.downloading > 0 || taskStats.value.pending > 0
)

async function pauseTask(taskId: string) {
  try {
    await pauseTaskHook(taskId)
    toast.success(t('download.messages.paused'))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.messages.pauseFailed')}: ${message}`)
  }
}

async function cancelTask(taskId: string) {
  try {
    await cancelTaskHook(taskId)
    toast.success(t('download.messages.cancelled'))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.messages.cancelFailed')}: ${message}`)
  }
}

async function retryTask(taskId: string) {
  try {
    await resumeTaskHook(taskId)
    toast.success(t('download.messages.retrying'))
  } catch (err: unknown) {
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
          <div class="stat-value">
            {{ formatSpeed(currentDownloadSpeed) }}
          </div>
          <div class="stat-label">
            {{ $t('download.current_speed') }}
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon downloading">
          <i class="i-carbon-in-progress" />
        </div>
        <div class="stat-info">
          <div class="stat-value">
            {{ taskStats.downloading }}
          </div>
          <div class="stat-label">
            {{ $t('download.active_downloads') }}
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon completed">
          <i class="i-carbon-checkmark-filled" />
        </div>
        <div class="stat-info">
          <div class="stat-value">
            {{ taskStats.completed }}
          </div>
          <div class="stat-label">
            {{ $t('download.total_completed') }}
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon failed">
          <i class="i-carbon-warning-filled" />
        </div>
        <div class="stat-info">
          <div class="stat-value">
            {{ taskStats.failed }}
          </div>
          <div class="stat-label">
            {{ $t('download.total_failed') }}
          </div>
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
        <div class="empty-text">
          {{ $t('download.no_tasks') }}
        </div>
        <div class="empty-hint">
          {{ $t('download.no_tasks_hint') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.download-center {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
  --download-surface: var(--el-bg-color);
  --download-surface-muted: var(--el-fill-color-light);
  --download-border: var(--el-border-color-light);
  --download-strong: var(--el-text-color-primary);
  --download-muted: var(--el-text-color-secondary);
  --download-soft: var(--el-text-color-regular);
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
  padding: 14px 16px;
  background: var(--download-surface);
  border-radius: 14px;
  border: 1px solid var(--download-border);
  transition: border-color 0.2s ease;

  &:hover {
    border-color: var(--el-border-color);
  }

  &.speed.active {
    border-color: var(--download-strong);
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    background: transparent;
    border: 1px solid var(--download-border);
    color: var(--download-muted);

    &.downloading {
      color: var(--download-strong);
    }

    &.completed {
      color: var(--download-strong);
    }

    &.failed {
      color: var(--download-muted);
    }
  }

  .stat-info {
    flex: 1;
    min-width: 0;

    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--download-strong);
      font-variant-numeric: tabular-nums;
    }

    .stat-label {
      font-size: 11px;
      color: var(--download-muted);
      margin-top: 4px;
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
  background: transparent;
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid var(--download-border);

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .section-icon {
      font-size: 12px;
      opacity: 0.6;

      &.downloading {
        color: var(--download-muted);
      }
      &.pending {
        color: var(--download-muted);
      }
      &.completed {
        color: var(--download-muted);
      }
      &.failed {
        color: var(--download-muted);
      }
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--download-strong);
    }

    .section-count {
      font-size: 11px;
      color: var(--download-muted);
      background: transparent;
      border: 1px solid var(--download-border);
      padding: 2px 8px;
      border-radius: 999px;
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
  color: var(--download-muted);

  .empty-icon {
    font-size: 40px;
    margin-bottom: 16px;
    opacity: 0.4;
  }

  .empty-text {
    font-size: 16px;
    font-weight: 600;
    color: var(--download-strong);
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
    padding: 12px 14px;

    .stat-icon {
      width: 24px;
      height: 24px;
      font-size: 12px;
    }

    .stat-info .stat-value {
      font-size: 16px;
    }
  }
}
</style>
