<template>
  <el-dialog
    v-model="dialogVisible"
    :title="$t('settings.download.title')"
    width="600px"
    :before-close="handleClose"
  >
    <el-form :model="form" label-width="140px" label-position="left">
      <!-- 并发设置 -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ $t('settings.download.concurrency_settings') }}</span>
        </template>

        <el-form-item :label="$t('settings.download.concurrency')">
          <el-slider
            v-model="form.concurrency.maxConcurrent"
            :min="1"
            :max="10"
            :marks="concurrencyMarks"
            show-stops
          />
          <div class="form-help">{{ $t('settings.download.concurrency_help') }}</div>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.concurrency.autoAdjust">
            {{ $t('settings.download.auto_adjust') }}
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.concurrency.networkAware">
            {{ $t('settings.download.network_aware') }}
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.concurrency.priorityBased">
            {{ $t('settings.download.priority_based') }}
          </el-checkbox>
        </el-form-item>
      </el-card>

      <!-- 切片设置 -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ $t('settings.download.chunk_settings') }}</span>
        </template>

        <el-form-item :label="$t('settings.download.chunk_size')">
          <el-select v-model="form.chunk.size" style="width: 200px">
            <el-option
              v-for="size in chunkSizeOptions"
              :key="size.value"
              :label="size.label"
              :value="size.value"
            />
          </el-select>
          <div class="form-help">{{ $t('settings.download.chunk_size_help') }}</div>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.chunk.resume">
            {{ $t('settings.download.resume') }}
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.chunk.autoRetry">
            {{ $t('settings.download.auto_retry') }}
          </el-checkbox>
        </el-form-item>

        <el-form-item v-if="form.chunk.autoRetry" :label="$t('settings.download.max_retries')">
          <el-input-number
            v-model="form.chunk.maxRetries"
            :min="1"
            :max="10"
            style="width: 120px"
          />
        </el-form-item>
      </el-card>

      <!-- 存储设置 -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ $t('settings.download.storage_settings') }}</span>
        </template>

        <el-form-item :label="$t('settings.download.temp_dir')">
          <el-input v-model="form.storage.tempDir" readonly style="width: 300px">
            <template #append>
              <el-button @click="selectTempDir">
                {{ $t('settings.download.browse') }}
              </el-button>
            </template>
          </el-input>
          <div class="form-help">{{ $t('settings.download.temp_dir_help') }}</div>
        </el-form-item>

        <el-form-item :label="$t('settings.download.history_retention')">
          <el-select v-model="form.storage.historyRetention" style="width: 200px">
            <el-option
              v-for="option in historyRetentionOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <div class="form-help">{{ $t('settings.download.history_retention_help') }}</div>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.storage.autoCleanup">
            {{ $t('settings.download.auto_cleanup') }}
          </el-checkbox>
        </el-form-item>
      </el-card>

      <!-- 网络设置 -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ $t('settings.download.network_settings') }}</span>
        </template>

        <el-form-item :label="$t('settings.download.timeout')">
          <el-input-number
            v-model="form.network.timeout"
            :min="5000"
            :max="60000"
            :step="1000"
            style="width: 150px"
          />
          <span class="form-unit">ms</span>
          <div class="form-help">{{ $t('settings.download.timeout_help') }}</div>
        </el-form-item>

        <el-form-item :label="$t('settings.download.retry_delay')">
          <el-input-number
            v-model="form.network.retryDelay"
            :min="1000"
            :max="30000"
            :step="1000"
            style="width: 150px"
          />
          <span class="form-unit">ms</span>
          <div class="form-help">{{ $t('settings.download.retry_delay_help') }}</div>
        </el-form-item>

        <el-form-item :label="$t('settings.download.max_retries')">
          <el-input-number
            v-model="form.network.maxRetries"
            :min="1"
            :max="10"
            style="width: 120px"
          />
          <div class="form-help">{{ $t('settings.download.max_retries_help') }}</div>
        </el-form-item>
      </el-card>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">
          {{ $t('common.cancel') }}
        </el-button>
        <el-button type="primary" @click="handleSave">
          {{ $t('common.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
// Note: ref is intentionally not imported as it's not used
import { ElMessage } from 'element-plus'
import { DownloadConfig } from '@talex-touch/utils'

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'update-config': [config: Partial<DownloadConfig>]
}>()

// 对话框可见性
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// 表单数据
const form = reactive<DownloadConfig>({
  concurrency: {
    maxConcurrent: 3,
    autoAdjust: true,
    networkAware: true,
    priorityBased: true
  },
  chunk: {
    size: 1024 * 1024, // 1MB
    resume: true,
    autoRetry: true,
    maxRetries: 3
  },
  storage: {
    tempDir: '',
    historyRetention: 30,
    autoCleanup: true
  },
  network: {
    timeout: 30000,
    retryDelay: 5000,
    maxRetries: 3
  }
})

// 并发数标记
const concurrencyMarks = {
  1: '1',
  3: '3',
  5: '5',
  8: '8',
  10: '10'
}

// 切片大小选项
const chunkSizeOptions = [
  { label: '512 KB', value: 512 * 1024 },
  { label: '1 MB', value: 1024 * 1024 },
  { label: '2 MB', value: 2 * 1024 * 1024 },
  { label: '4 MB', value: 4 * 1024 * 1024 }
]

// 历史保留选项
const historyRetentionOptions = [
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
  { label: '永久', value: 0 }
]

// 选择临时目录
const selectTempDir = async () => {
  try {
    // 这里应该调用Electron API来选择目录
    // const result = await window.electronAPI.showOpenDialog({
    //   properties: ['openDirectory']
    // })
    // if (!result.canceled && result.filePaths.length > 0) {
    //   form.storage.tempDir = result.filePaths[0]
    // }
    ElMessage.info('选择目录功能待实现')
  } catch (error) {
    ElMessage.error('选择目录失败')
  }
}

// 保存配置
const handleSave = () => {
  emit('update-config', form)
  handleClose()
}

// 关闭对话框
const handleClose = () => {
  dialogVisible.value = false
}

// 监听对话框显示状态，重置表单
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      // 这里可以从存储中加载当前配置
      // loadCurrentConfig()
    }
  }
)
</script>

<style scoped>
.settings-card {
  margin-bottom: 20px;
}

.settings-card:last-child {
  margin-bottom: 0;
}

.form-help {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 4px;
}

.form-unit {
  margin-left: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .el-dialog {
    width: 90% !important;
    margin: 5vh auto !important;
  }

  .el-form-item {
    margin-bottom: 16px;
  }
}
</style>
