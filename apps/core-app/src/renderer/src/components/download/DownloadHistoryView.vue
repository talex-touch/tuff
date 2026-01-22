<script setup lang="ts">
import type { DownloadHistory } from '@talex-touch/utils'
import { Clock, Delete, Search } from '@element-plus/icons-vue'
import { DownloadModule } from '@talex-touch/utils'
import { ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import HistoryCard from './HistoryCard.vue'

const { t } = useI18n()

const { getHistory, clearHistory, clearHistoryItem, openFile, showInFolder } = useDownloadCenter()

const historyList = ref<DownloadHistory[]>([])
const loading = ref(false)
const searchQuery = ref('')
const filterModule = ref<string>('')
const sortBy = ref('time_desc')
const currentPage = ref(1)
const pageSize = 20

// 加载历史记录
async function loadHistory() {
  try {
    loading.value = true
    const history = await getHistory()
    historyList.value = history
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.load_history_failed')}: ${message}`)
  } finally {
    loading.value = false
  }
}

// 搜索过滤
const filteredHistory = computed(() => {
  let result = [...historyList.value]

  // 搜索过滤
  const query = searchQuery.value.toLowerCase().trim()
  if (query) {
    result = result.filter(
      (item) =>
        item.filename.toLowerCase().includes(query) || item.url.toLowerCase().includes(query)
    )
  }

  // 模块过滤
  if (filterModule.value) {
    result = result.filter((item) => item.module === filterModule.value)
  }

  // 排序
  switch (sortBy.value) {
    case 'time_desc':
      result.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0
        return timeB - timeA
      })
      break
    case 'time_asc':
      result.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0
        return timeA - timeB
      })
      break
    case 'size_desc':
      result.sort((a, b) => (b.totalSize || 0) - (a.totalSize || 0))
      break
    case 'size_asc':
      result.sort((a, b) => (a.totalSize || 0) - (b.totalSize || 0))
      break
    case 'name_asc':
      result.sort((a, b) => a.filename.localeCompare(b.filename))
      break
    case 'name_desc':
      result.sort((a, b) => b.filename.localeCompare(a.filename))
      break
  }

  return result
})

// 分页数据
const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredHistory.value.slice(start, end)
})

function handleSearch() {
  currentPage.value = 1
}

function handlePageChange(page: number) {
  currentPage.value = page
}

async function handleOpenFile(historyId: string) {
  try {
    const item = historyList.value.find((h) => h.id === historyId)
    if (!item) return

    await openFile(item.taskId)
    toast.success(t('download.file_opened'))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.open_file_failed')}: ${message}`)
  }
}

async function handleShowInFolder(historyId: string) {
  try {
    const item = historyList.value.find((h) => h.id === historyId)
    if (!item) return

    await showInFolder(item.taskId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.show_folder_failed')}: ${message}`)
  }
}

async function handleClearHistoryItem(historyId: string) {
  try {
    await ElMessageBox.confirm(
      t('download.clear_history_item_confirm_message'),
      t('download.clear_history_item_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    await clearHistoryItem(historyId)

    // 从列表中移除
    const index = historyList.value.findIndex((h) => h.id === historyId)
    if (index !== -1) {
      historyList.value.splice(index, 1)
    }

    toast.success(t('download.history_item_cleared'))
  } catch (err: unknown) {
    if (err === 'cancel') return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.clear_history_item_failed')}: ${message}`)
  }
}

async function handleClearAllHistory() {
  try {
    await ElMessageBox.confirm(
      t('download.clear_all_history_confirm_message'),
      t('download.clear_all_history_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    await clearHistory()
    historyList.value = []
    toast.success(t('download.all_history_cleared'))
  } catch (err: unknown) {
    if (err === 'cancel') return
    const message = err instanceof Error ? err.message : String(err)
    toast.error(`${t('download.clear_all_history_failed')}: ${message}`)
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<template>
  <div class="download-history-view">
    <!-- 头部 -->
    <div class="history-header">
      <div class="header-left">
        <h3 class="title">
          <el-icon><Clock /></el-icon>
          {{ $t('download.history_title') }}
        </h3>
        <span class="history-count">{{ filteredHistory.length }} {{ $t('download.items') }}</span>
      </div>
      <div class="header-right">
        <el-button v-if="historyList.length > 0" type="danger" @click="handleClearAllHistory">
          <el-icon><Delete /></el-icon>
          {{ $t('download.clear_all_history') }}
        </el-button>
      </div>
    </div>

    <!-- 搜索和筛选栏 -->
    <div class="search-filter-bar">
      <el-input
        v-model="searchQuery"
        :placeholder="$t('download.search_history_placeholder')"
        clearable
        @input="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="filterModule"
        :placeholder="$t('download.filter_by_module')"
        clearable
        style="width: 200px"
      >
        <el-option :label="$t('download.all_modules')" value="" />
        <el-option :label="$t('download.module_app_update')" :value="DownloadModule.APP_UPDATE" />
        <el-option
          :label="$t('download.module_plugin_install')"
          :value="DownloadModule.PLUGIN_INSTALL"
        />
        <el-option
          :label="$t('download.module_resource_download')"
          :value="DownloadModule.RESOURCE_DOWNLOAD"
        />
        <el-option :label="$t('download.module_user_manual')" :value="DownloadModule.USER_MANUAL" />
      </el-select>
      <el-select v-model="sortBy" :placeholder="$t('download.sort_by')" style="width: 180px">
        <el-option :label="$t('download.sort_by_time_desc')" value="time_desc" />
        <el-option :label="$t('download.sort_by_time_asc')" value="time_asc" />
        <el-option :label="$t('download.sort_by_size_desc')" value="size_desc" />
        <el-option :label="$t('download.sort_by_size_asc')" value="size_asc" />
        <el-option :label="$t('download.sort_by_name_asc')" value="name_asc" />
        <el-option :label="$t('download.sort_by_name_desc')" value="name_desc" />
      </el-select>
    </div>

    <!-- 历史记录列表 -->
    <div class="history-list">
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>
      <div v-else-if="filteredHistory.length === 0" class="empty-state">
        <el-empty :description="$t('download.no_history')" />
      </div>
      <div v-else class="history-items">
        <HistoryCard
          v-for="item in paginatedHistory"
          :key="item.id"
          :history="item"
          @open-file="handleOpenFile"
          @show-in-folder="handleShowInFolder"
          @clear="handleClearHistoryItem"
        />
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="filteredHistory.length > pageSize" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredHistory.length"
        layout="prev, pager, next, jumper, total"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.download-history-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--el-bg-color-page);
}

.history-header {
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
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.history-count {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  background: var(--el-fill-color-light);
  border-radius: 12px;
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

.history-list {
  flex: 1;
  overflow: auto;
  margin-bottom: 20px;
}

.loading-state {
  padding: 20px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.history-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pagination {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  border-top: 1px solid var(--el-border-color-light);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .download-history-view {
    padding: 16px;
  }

  .history-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .header-left {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .search-filter-bar {
    flex-direction: column;
  }

  .search-filter-bar .el-input,
  .search-filter-bar .el-select {
    max-width: 100%;
    width: 100%;
  }
}
</style>
