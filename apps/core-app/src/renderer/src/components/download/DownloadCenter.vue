<template>
  <div class="download-center">
    <!-- 头部 -->
    <div class="download-center-header">
      <div class="header-left">
        <h2 class="title">
          <el-icon><Download /></el-icon>
          {{ $t('download.title') }}
        </h2>
        <div class="stats">
          <span class="stat-item">
            {{ $t('download.downloading') }} ({{ taskStats.downloading }})
          </span>
          <span class="stat-item"> {{ $t('download.waiting') }} ({{ taskStats.pending }}) </span>
          <span class="stat-item">
            {{ $t('download.completed') }} ({{ taskStats.completed }})
          </span>
          <span class="stat-item"> {{ $t('download.failed') }} ({{ taskStats.failed }}) </span>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="openSettings">
          <el-icon><Setting /></el-icon>
          {{ $t('download.settings') }}
        </el-button>
      </div>
    </div>

    <!-- 下载统计 -->
    <div class="download-stats">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ formatSpeed(currentDownloadSpeed) }}</div>
              <div class="stat-label">{{ $t('download.current_speed') }}</div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ taskStats.downloading }}</div>
              <div class="stat-label">{{ $t('download.active_downloads') }}</div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ taskStats.completed }}</div>
              <div class="stat-label">{{ $t('download.total_completed') }}</div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-card">
              <div class="stat-content">
                <div class="stat-value">{{ taskStats.failed }}</div>
                <div class="stat-label">{{ $t('download.total_failed') }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 下载任务列表 -->
    <div class="download-tasks">
      <!-- 进行中的任务 -->
      <div v-if="tasksByStatus.downloading.length > 0" class="task-section">
        <h3 class="section-title">
          <el-icon><Loading /></el-icon>
          {{ $t('download.downloading') }} ({{ tasksByStatus.downloading.length }})
        </h3>
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
        <h3 class="section-title">
          <el-icon><Clock /></el-icon>
          {{ $t('download.waiting') }} ({{ tasksByStatus.pending.length }})
        </h3>
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
        <h3 class="section-title">
          <el-icon><Check /></el-icon>
          {{ $t('download.completed') }} ({{ tasksByStatus.completed.length }})
        </h3>
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
        <h3 class="section-title">
          <el-icon><Close /></el-icon>
          {{ $t('download.failed') }} ({{ tasksByStatus.failed.length }})
        </h3>
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
        <el-empty :description="$t('download.no_tasks')">
          <el-button type="primary" @click="openSettings">
            {{ $t('download.open_settings') }}
          </el-button>
        </el-empty>
      </div>
    </div>

    <!-- 设置对话框 -->
    <DownloadSettings v-model:visible="settingsVisible" @update-config="updateConfig" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Setting, Loading, Clock, Check, Close } from '@element-plus/icons-vue'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import DownloadTaskItem from './DownloadTask.vue'
import DownloadSettings from './DownloadSettings.vue'

const {
  downloadTasks,
  taskStats,
  tasksByStatus,
  currentDownloadSpeed,
  pauseTask: pauseTaskHook,
  resumeTask: resumeTaskHook,
  cancelTask: cancelTaskHook,
  updateConfig: updateConfigHook,
  formatSpeed
} = useDownloadCenter()

// Remove unused variables from destructuring if needed

const settingsVisible = ref(false)

const openSettings = () => {
  settingsVisible.value = true
}

const pauseTask = async (taskId: string) => {
  try {
    await pauseTaskHook(taskId)
    ElMessage.success('任务已暂停')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(`暂停任务失败: ${message}`)
  }
}

// 取消任务
const cancelTask = async (taskId: string) => {
  try {
    await cancelTaskHook(taskId)
    ElMessage.success('任务已取消')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(`取消任务失败: ${message}`)
  }
}

// 重试任务
const retryTask = async (taskId: string) => {
  try {
    await resumeTaskHook(taskId)
    ElMessage.success('任务已重试')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(`重试任务失败: ${message}`)
  }
}

// 移除任务
const removeTask = (_taskId: string) => {
  // 这里可以实现移除任务的逻辑
  ElMessage.success('任务已移除')
}

// 更新配置
const updateConfig = async (config: any) => {
  try {
    await updateConfigHook(config)
    ElMessage.success('配置已更新')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage.error(`更新配置失败: ${message}`)
  }
}
</script>

<style scoped>
.download-center {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.download-center-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stats {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.stat-item {
  padding: 4px 8px;
  background: var(--el-bg-color-page);
  border-radius: 4px;
}

.download-stats {
  margin-bottom: 24px;
}

.stat-card {
  text-align: center;
}

.stat-content {
  padding: 16px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.download-tasks {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.task-section {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--el-border-color-light);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .download-center {
    padding: 16px;
  }

  .download-center-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .stats {
    flex-wrap: wrap;
    gap: 8px;
  }

  .download-stats .el-col {
    margin-bottom: 16px;
  }
}
</style>
