<script setup lang="ts">
import { Delete, Download, Refresh } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { touchChannel } from '~/modules/channel/channel-core'

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

const { t } = useI18n()

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

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
  },
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function refreshLogs() {
  loading.value = true
  try {
    const result = await touchChannel.send('download:get-logs', logLimit.value)
    if (result.success) {
      logs.value = result.logs || t('download.no_logs')
    }
    else {
      toast.error(t('download.load_logs_failed'))
    }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`${t('download.load_logs_failed')}: ${message}`)
  }
  finally {
    loading.value = false
  }
}

async function loadErrorStats() {
  try {
    const result = await touchChannel.send('download:get-error-stats')
    if (result.success) {
      errorStats.value = result.stats
    }
  }
  catch (error: unknown) {
    console.error('Failed to load error stats:', error)
  }
}

async function clearLogs() {
  try {
    await ElMessageBox.confirm(
      t('download.clear_logs_confirm_message'),
      t('download.clear_logs_confirm_title'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )

    const result = await touchChannel.send('download:clear-logs')
    if (result.success) {
      logs.value = ''
      errorStats.value = null
      toast.success(t('download.logs_cleared'))
    }
    else {
      toast.error(t('download.clear_logs_failed'))
    }
  }
  catch (error: unknown) {
    if (error === 'cancel')
      return
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`${t('download.clear_logs_failed')}: ${message}`)
  }
}

function downloadLogs() {
  if (!logs.value) {
    toast.warning(t('download.no_logs_to_download'))
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

  toast.success(t('download.logs_downloaded'))
}
</script>

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
        <el-button :loading="loading" @click="refreshLogs">
          <el-icon><Refresh /></el-icon>
          {{ $t('common.refresh') }}
        </el-button>
        <el-button type="danger" @click="clearLogs">
          <el-icon><Delete /></el-icon>
          {{ $t('download.clear_logs') }}
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-select v-model="logLimit" style="width: 150px" @change="refreshLogs">
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
            <div class="stat-label">
              {{ $t('download.total_errors') }}
            </div>
            <div class="stat-value">
              {{ errorStats.total }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              {{ $t('download.network_errors') }}
            </div>
            <div class="stat-value error-network">
              {{ errorStats.byType?.network_error || 0 }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              {{ $t('download.timeout_errors') }}
            </div>
            <div class="stat-value error-timeout">
              {{ errorStats.byType?.timeout_error || 0 }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">
              {{ $t('download.disk_errors') }}
            </div>
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
      <el-button @click="visible = false">
        {{ $t('common.close') }}
      </el-button>
      <el-button type="primary" @click="downloadLogs">
        <el-icon><Download /></el-icon>
        {{ $t('download.download_logs') }}
      </el-button>
    </template>
  </el-dialog>
</template>

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
