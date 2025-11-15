<template>
  <el-dialog
    v-model="visible"
    :title="$t('download.error_logs')"
    width="80%"
    :close-on-click-modal="false"
    class="error-log-viewer"
  >
    <!-- 头部工具栏 -->
    <div class="log-toolbar">
      <div class="toolbar-left">
        <el-button @click="refreshLogs" :loading="loading">
          <el-icon><Refresh /></el-icon>
          {{ $t('common.refresh') }}
        </el-button>
        <el-button @click="clearLogs" type="danger">
          <el-icon><Delete /></el-icon>
          {{ $t('download.clear_logs') }}
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-select v-model="logLimit" @change="refreshLogs" style="width: 150px">
          <el-option :label="$t('download.last_50_lines')" :value="50" />
          <el-option :label="$t('download.last_100_lines')" :value="100" />
          <el-option :label="$t('download.last_500_lines')" :value="500" />
          <el-option :label="$t('download.all_logs')" :value="0" />
        </el-select>
      </div>
    </div>

    <!-- 错误统计 -->
    <div v-if="errorStats" class="error-stats">
      <el-card shadow="never">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-label">{{ $t('download.total_errors') }}</div>
            <div class="stat-value">{{ errorStats.total }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">{{ $t('download.network_errors') }}</div>
            <div class="stat-value error-network">
              {{ errorStats.byType?.network_error || 0 }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">{{ $t('download.timeout_errors') }}</div>
            <div class="stat-value error-timeout">
              {{ errorStats.byType?.timeout_error || 0 }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">{{ $t('download.disk_errors') }}</div>
            <div class="stat-value error-disk">
              {{ errorStats.byType?.disk_space_error || 0 }}
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 日志内容 -->
    <div class="log-content">
      <el-scrollbar height="500px">
        <pre v-if="logs" class="log-text">{{ logs }}</pre>
        <el-empty v-else :description="$t('download.no_logs')" />
      </el-scrollbar>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ $t('common.close') }}</el-button>
      <el-button type="primary" @click="downloadLogs">
        <el-icon><Download /></el-icon>
        {{ $t('download.download_logs') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Refresh, Delete, Download } from '@element-plus/icons-vue'

const { t } = useI18n()

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = ref(props.modelValue)
const loading = ref(false)
const logs = ref<string>('')
const errorStats = ref<any>(null)
const logLimit = ref(100)

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      refreshLogs()
      loadErrorStats()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const refreshLogs = async () => {
  loading.value = true
  try {
    const result = await $app.channel.call('download:get-logs', logLimit.value)
    if (result.success) {
      logs.value = result.logs || t('download.no_logs')
    } else {
      ElMessage.error(t('download.load_logs_failed'))
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    ElMessage.error(`${t('download.load_logs_failed')}: ${message}`)
  } finally {
    loading.value = false
  }
}

const loadErrorStats = async () => {
  try {
    const result = await $app.channel.call('download:get-error-stats')
    if (result.success) {
      errorStats.value = result.stats
    }
  } catch (error: unknown) {
    console.error('Failed to load error stats:', error)
  }
}

const clearLogs = async () => {
  try {
    await ElMessageBox.confirm(
      t('download.clear_logs_confirm_message'),
      t('download.clear_logs_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    const result = await $app.channel.call('download:clear-logs')
    if (result.success) {
      logs.value = ''
      errorStats.value = null
      ElMessage.success(t('download.logs_cleared'))
    } else {
      ElMessage.error(t('download.clear_logs_failed'))
    }
  } catch (error: unknown) {
    if (error === 'cancel') return
    const message = error instanceof Error ? error.message : String(error)
    ElMessage.error(`${t('download.clear_logs_failed')}: ${message}`)
  }
}

const downloadLogs = () => {
  if (!logs.value) {
    ElMessage.warning(t('download.no_logs_to_download'))
    return
  }

  const blob = new Blob([logs.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `download-errors-${Date.now()}.log`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  ElMessage.success(t('download.logs_downloaded'))
}
</script>

<style scoped>
.error-log-viewer :deep(.el-dialog__body) {
  padding: 20px;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
}

.error-stats {
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stat-value.error-network {
  color: var(--el-color-warning);
}

.stat-value.error-timeout {
  color: var(--el-color-danger);
}

.stat-value.error-disk {
  color: var(--el-color-error);
}

.log-content {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 12px;
}

.log-text {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
