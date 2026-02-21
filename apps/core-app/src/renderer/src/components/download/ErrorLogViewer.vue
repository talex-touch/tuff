<script setup lang="ts">
import { TxBottomDialog, TxCard, TxEmpty, TxModal } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { DownloadEvents } from '@talex-touch/utils/transport/events'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

const { t } = useI18n()
const transport = useTuffTransport()

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const visible = ref(props.modelValue)
const allowClose = ref(false)
const modalVisible = computed({
  get: () => visible.value,
  set: (val) => {
    if (!val && !allowClose.value) return
    visible.value = val
    if (!val) {
      allowClose.value = false
    }
  }
})
const loading = ref(false)
const logs = ref<string>('')
type DownloadErrorStats = {
  total: number
  byType?: Record<string, number>
}

const errorStats = ref<DownloadErrorStats | null>(null)
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

async function refreshLogs() {
  loading.value = true
  try {
    const result = await transport.send(DownloadEvents.logs.get, { limit: logLimit.value })
    if (result.success) {
      const rawLogs = result.logs
      const logContent =
        typeof rawLogs === 'string'
          ? rawLogs
          : Array.isArray(rawLogs)
            ? rawLogs.join('\n')
            : rawLogs
              ? JSON.stringify(rawLogs, null, 2)
              : ''
      logs.value = logContent || t('download.no_logs')
    } else {
      toast.error(t('download.load_logs_failed'))
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`${t('download.load_logs_failed')}: ${message}`)
  } finally {
    loading.value = false
  }
}

async function loadErrorStats() {
  try {
    const result = await transport.send(DownloadEvents.logs.getErrorStats)
    if (result.success) {
      const stats =
        result.stats && typeof result.stats === 'object'
          ? (result.stats as DownloadErrorStats)
          : null
      errorStats.value = stats
    }
  } catch (error: unknown) {
    console.error('Failed to load error stats:', error)
  }
}

// Clear logs confirmation
const clearConfirmVisible = ref(false)

function requestClearLogs() {
  clearConfirmVisible.value = true
}

function closeClearConfirm() {
  clearConfirmVisible.value = false
}

async function confirmClearLogs(): Promise<boolean> {
  try {
    const result = await transport.send(DownloadEvents.logs.clear)
    if (result.success) {
      logs.value = ''
      errorStats.value = null
      toast.success(t('download.logs_cleared'))
    } else {
      toast.error(t('download.clear_logs_failed'))
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`${t('download.clear_logs_failed')}: ${message}`)
  }
  return true
}

async function clearLogs() {
  requestClearLogs()
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

function requestClose() {
  allowClose.value = true
  modalVisible.value = false
}
</script>

<template>
  <TxModal
    v-model="modalVisible"
    :title="$t('download.error_logs')"
    width="80%"
    class="error-log-viewer"
  >
    <!-- 头部工具栏 -->
    <div class="log-toolbar">
      <div class="toolbar-left">
        <TxButton :loading="loading" @click="refreshLogs">
          <i class="i-carbon-renew" />
          {{ $t('common.refresh') }}
        </TxButton>
        <TxButton type="danger" @click="clearLogs">
          <i class="i-carbon-trash-can" />
          {{ $t('download.clear_logs') }}
        </TxButton>
      </div>
      <div class="toolbar-right">
        <TuffSelect v-model="logLimit" style="width: 150px" @change="refreshLogs">
          <TuffSelectItem :label="$t('download.last_50_lines')" :value="50" />
          <TuffSelectItem :label="$t('download.last_100_lines')" :value="100" />
          <TuffSelectItem :label="$t('download.last_500_lines')" :value="500" />
          <TuffSelectItem :label="$t('download.all_logs')" :value="0" />
        </TuffSelect>
      </div>
    </div>

    <!-- 错误统计 -->
    <div v-if="errorStats" class="error-stats">
      <TxCard shadow="none">
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
      </TxCard>
    </div>

    <!-- 日志内容 -->
    <div class="log-content">
      <TxScroll height="500px">
        <pre v-if="logs" class="log-text">{{ logs }}</pre>
        <TxEmpty v-else :title="$t('download.no_logs')" />
      </TxScroll>
    </div>

    <template #footer>
      <TxButton @click="requestClose">
        {{ $t('common.close') }}
      </TxButton>
      <TxButton type="primary" @click="downloadLogs">
        <i class="i-carbon-download" />
        {{ $t('download.download_logs') }}
      </TxButton>
    </template>
  </TxModal>

  <TxBottomDialog
    v-if="clearConfirmVisible"
    :title="t('download.clear_logs_confirm_title')"
    :message="t('download.clear_logs_confirm_message')"
    :btns="[
      { content: t('common.cancel'), type: 'info', onClick: () => true },
      { content: t('common.confirm'), type: 'error', onClick: confirmClearLogs }
    ]"
    :close="closeClearConfirm"
  />
</template>

<style scoped>
.error-log-viewer :deep(.tx-modal__body) {
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
