<script setup lang="ts">
import type { DownloadTask } from '@talex-touch/utils'
import {
  Delete,
  Document,
  Download,
  Grid,
  List,
  Search,
  Setting,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import { debounce } from '~/utils/performance'
import DownloadHistoryView from './DownloadHistoryView.vue'
import DownloadSettings from './DownloadSettings.vue'
import ErrorLogViewer from './ErrorLogViewer.vue'
import TaskDetailsDialog from './TaskDetailsDialog.vue'
import TaskList from './TaskList.vue'
import VirtualTaskList from './VirtualTaskList.vue'

const { t } = useI18n()

const {
  downloadTasks,
  tasksByStatus,
  pauseTask: pauseTaskHook,
  cancelTask: cancelTaskHook,
  retryTask: retryTaskHook,
  pauseAllTasks: pauseAllTasksHook,
  resumeAllTasks: resumeAllTasksHook,
  openFile: openFileHook,
  showInFolder: showInFolderHook,
  deleteFile: deleteFileHook,
  removeTask: removeTaskHook,
  clearHistory: clearHistoryHook,
  updateConfig: updateConfigHook,
} = useDownloadCenter()

const settingsVisible = ref(false)
const detailsVisible = ref(false)
const logsVisible = ref(false)
const selectedTask = ref<DownloadTask | null>(null)
const activeTab = ref('downloading')
const viewMode = ref<'detailed' | 'compact'>('detailed')
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const useVirtualScroll = ref(false) // Enable virtual scroll for large lists

// Debounced search handler (300ms delay)
const handleSearchDebounced = debounce((value: string) => {
  debouncedSearchQuery.value = value
}, 300)

// 搜索过滤
const filteredTasks = computed(() => {
  const query = debouncedSearchQuery.value.toLowerCase().trim()

  if (!query) {
    return tasksByStatus.value
  }

  const filterTasks = (tasks: DownloadTask[]) => {
    return tasks.filter(task =>
      task.filename.toLowerCase().includes(query)
      || task.url.toLowerCase().includes(query),
    )
  }

  return {
    downloading: filterTasks(tasksByStatus.value.downloading),
    pending: filterTasks(tasksByStatus.value.pending),
    completed: filterTasks(tasksByStatus.value.completed),
    failed: filterTasks(tasksByStatus.value.failed),
    paused: filterTasks(tasksByStatus.value.paused),
    cancelled: filterTasks(tasksByStatus.value.cancelled),
  }
})

// Determine if we should use virtual scrolling
const shouldUseVirtualScroll = computed(() => {
  const currentTasks = getCurrentTabTasks()
  return useVirtualScroll.value || currentTasks.length > 50
})

function getCurrentTabTasks() {
  switch (activeTab.value) {
    case 'downloading':
      return filteredTasks.value.downloading
    case 'pending':
      return filteredTasks.value.pending
    case 'completed':
      return filteredTasks.value.completed
    case 'failed':
      return filteredTasks.value.failed
    default:
      return []
  }
}

function openSettings() {
  settingsVisible.value = true
}

function openLogs() {
  logsVisible.value = true
}

function handleSearch(value: string) {
  handleSearchDebounced(value)
}

async function pauseTask(taskId: string) {
  try {
    await pauseTaskHook(taskId)
    toast.success(t('download.task_paused'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.pause_failed')}: ${message}`)
  }
}

// Note: resumeTask is now inlined in the event handlers of TaskList component

async function cancelTask(taskId: string) {
  try {
    await ElMessageBox.confirm(
      t('download.cancel_confirm_message'),
      t('download.cancel_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
    await cancelTaskHook(taskId)
    toast.success(t('download.task_cancelled'))
  }
  catch (err: unknown) {
    if (err === 'cancel')
      return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.cancel_failed')}: ${message}`)
  }
}

async function retryTask(taskId: string) {
  try {
    await retryTaskHook(taskId)
    toast.success(t('download.task_retrying'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.retry_failed')}: ${message}`)
  }
}

async function removeTask(taskId: string) {
  try {
    await ElMessageBox.confirm(
      t('download.remove_confirm_message'),
      t('download.remove_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
    await removeTaskHook(taskId)
    toast.success(t('download.task_removed'))
  }
  catch (err: unknown) {
    if (err === 'cancel')
      return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.remove_failed')}: ${message}`)
  }
}

async function openFile(taskId: string) {
  try {
    await openFileHook(taskId)
    toast.success(t('download.file_opened'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.open_file_failed')}: ${message}`)
  }
}

async function showInFolder(taskId: string) {
  try {
    await showInFolderHook(taskId)
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.show_folder_failed')}: ${message}`)
  }
}

async function deleteTask(taskId: string) {
  try {
    await ElMessageBox.confirm(
      t('download.delete_confirm_message'),
      t('download.delete_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    await deleteFileHook(taskId)
    toast.success(t('download.file_deleted'))
  }
  catch (err: unknown) {
    if (err === 'cancel')
      return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.delete_failed')}: ${message}`)
  }
}

function showTaskDetails(taskId: string) {
  const task = downloadTasks.value.find(t => t.id === taskId)
  if (task) {
    selectedTask.value = task
    detailsVisible.value = true
  }
}

async function pauseAllTasks() {
  try {
    await pauseAllTasksHook()
    toast.success(t('download.all_tasks_paused'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.pause_all_failed')}: ${message}`)
  }
}

async function resumeAllTasks() {
  try {
    await resumeAllTasksHook()
    toast.success(t('download.all_tasks_resumed'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.resume_all_failed')}: ${message}`)
  }
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm(
      t('download.clear_history_confirm_message'),
      t('download.clear_history_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
    await clearHistoryHook()
    toast.success(t('download.history_cleared'))
  }
  catch (err: unknown) {
    if (err === 'cancel')
      return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.clear_history_failed')}: ${message}`)
  }
}

async function handlePriorityChange(_taskId: string, _newPriority: number) {
  try {
    // TODO: Implement priority change API
    toast.success(t('download.priority_updated'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.priority_update_failed')}: ${message}`)
  }
}

async function updateConfig(config: any) {
  try {
    await updateConfigHook(config)
    toast.success(t('download.config_updated'))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.config_update_failed')}: ${message}`)
  }
}
</script>

<template>
  <div class="download-center-view">
    <!-- 头部 -->
    <div class="download-header">
      <div class="header-left">
        <h2 class="title">
          <el-icon><Download /></el-icon>
          {{ $t('download.title') }}
        </h2>
      </div>
      <div class="header-right">
        <el-button-group>
          <el-button :type="viewMode === 'detailed' ? 'primary' : ''" @click="viewMode = 'detailed'">
            <el-icon><List /></el-icon>
          </el-button>
          <el-button :type="viewMode === 'compact' ? 'primary' : ''" @click="viewMode = 'compact'">
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-button-group>
        <el-button @click="openLogs">
          <el-icon><Document /></el-icon>
          {{ $t('download.view_logs') }}
        </el-button>
        <el-button @click="openSettings">
          <el-icon><Setting /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 搜索和筛选 -->
    <div class="search-filter-bar">
      <el-input
        v-model="searchQuery"
        :placeholder="$t('download.search_placeholder')"
        clearable
        @input="handleSearch(searchQuery)"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="filter-actions">
        <el-button
          v-if="tasksByStatus.downloading.length > 0"
          @click="pauseAllTasks"
        >
          <el-icon><VideoPause /></el-icon>
          {{ $t('download.pause_all') }}
        </el-button>
        <el-button
          v-if="tasksByStatus.paused.length > 0"
          @click="resumeAllTasks"
        >
          <el-icon><VideoPlay /></el-icon>
          {{ $t('download.resume_all') }}
        </el-button>
        <el-button
          v-if="tasksByStatus.completed.length > 0"
          @click="clearHistory"
        >
          <el-icon><Delete /></el-icon>
          {{ $t('download.clear_history') }}
        </el-button>
      </div>
    </div>

    <!-- 标签页 -->
    <el-tabs v-model="activeTab" class="download-tabs">
      <el-tab-pane :label="`${$t('download.downloading')} (${tasksByStatus.downloading.length})`" name="downloading">
        <VirtualTaskList
          v-if="shouldUseVirtualScroll"
          :tasks="filteredTasks.downloading"
          :view-mode="viewMode"
          @pause="pauseTask"
          @cancel="cancelTask"
          @show-details="showTaskDetails"
        />
        <TaskList
          v-else
          :tasks="filteredTasks.downloading"
          :view-mode="viewMode"
          :draggable="true"
          @pause="pauseTask"
          @cancel="cancelTask"
          @show-details="showTaskDetails"
          @priority-change="handlePriorityChange"
        />
      </el-tab-pane>
      <el-tab-pane :label="`${$t('download.waiting')} (${tasksByStatus.pending.length})`" name="pending">
        <VirtualTaskList
          v-if="shouldUseVirtualScroll"
          :tasks="filteredTasks.pending"
          :view-mode="viewMode"
          @pause="pauseTask"
          @cancel="cancelTask"
          @show-details="showTaskDetails"
        />
        <TaskList
          v-else
          :tasks="filteredTasks.pending"
          :view-mode="viewMode"
          :draggable="true"
          @pause="pauseTask"
          @cancel="cancelTask"
          @show-details="showTaskDetails"
          @priority-change="handlePriorityChange"
        />
      </el-tab-pane>
      <el-tab-pane :label="`${$t('download.completed')} (${tasksByStatus.completed.length})`" name="completed">
        <VirtualTaskList
          v-if="shouldUseVirtualScroll"
          :tasks="filteredTasks.completed"
          :view-mode="viewMode"
          @open-file="openFile"
          @show-in-folder="showInFolder"
          @show-details="showTaskDetails"
          @remove="removeTask"
          @delete="deleteTask"
        />
        <TaskList
          v-else
          :tasks="filteredTasks.completed"
          :view-mode="viewMode"
          @open-file="openFile"
          @show-in-folder="showInFolder"
          @show-details="showTaskDetails"
          @remove="removeTask"
          @delete="deleteTask"
        />
      </el-tab-pane>
      <el-tab-pane :label="`${$t('download.failed')} (${tasksByStatus.failed.length})`" name="failed">
        <VirtualTaskList
          v-if="shouldUseVirtualScroll"
          :tasks="filteredTasks.failed"
          :view-mode="viewMode"
          @retry="retryTask"
          @show-details="showTaskDetails"
          @remove="removeTask"
        />
        <TaskList
          v-else
          :tasks="filteredTasks.failed"
          :view-mode="viewMode"
          @retry="retryTask"
          @show-details="showTaskDetails"
          @remove="removeTask"
        />
      </el-tab-pane>
      <el-tab-pane :label="$t('download.history')" name="history">
        <DownloadHistoryView />
      </el-tab-pane>
    </el-tabs>

    <!-- 设置对话框 -->
    <DownloadSettings v-model:visible="settingsVisible" @update-config="updateConfig" />

    <!-- 任务详情对话框 -->
    <TaskDetailsDialog
      v-model="detailsVisible"
      :task="selectedTask"
      @open-file="openFile"
      @show-in-folder="showInFolder"
    />

    <!-- 错误日志查看器 -->
    <ErrorLogViewer v-model="logsVisible" />
  </div>
</template>

<style scoped>
.download-center-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--el-bg-color-page);
}

.download-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
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

.header-right {
  display: flex;
  gap: 12px;
}

.search-filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.search-filter-bar .el-input {
  flex: 1;
  max-width: 400px;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.download-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.download-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .download-center-view {
    padding: 16px;
  }

  .download-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .search-filter-bar {
    flex-direction: column;
  }

  .search-filter-bar .el-input {
    max-width: 100%;
  }

  .filter-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
