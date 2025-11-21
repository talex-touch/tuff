<!--
  SettingFileIndex Component
  
  Displays file indexing status and allows manual rebuild in settings page.
-->
<script setup lang="ts" name="SettingFileIndex">
import { computed, onMounted, ref } from 'vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'

const { getIndexStatus, handleRebuild } = useFileIndexMonitor()

const indexStatus = ref<any>(null)
const isRebuilding = ref(false)
const lastChecked = ref<Date | null>(null)

// 检查索引状态
const checkStatus = async () => {
  try {
    indexStatus.value = await getIndexStatus()
    lastChecked.value = new Date()
  } catch (error) {
    console.error('[SettingFileIndex] Failed to get status:', error)
  }
}

// 状态显示文本
const statusText = computed(() => {
  if (!indexStatus.value) return '检查中...'
  
  if (isRebuilding.value) return '重建中'
  if (indexStatus.value.isInitializing) return '初始化中'
  if (indexStatus.value.initializationFailed) return '失败'
  
  return '正常'
})

// 状态颜色
const statusColor = computed(() => {
  if (!indexStatus.value || indexStatus.value.isInitializing || isRebuilding.value) {
    return '#007aff' // 蓝色 - 进行中
  }
  if (indexStatus.value.initializationFailed) {
    return '#ff3b30' // 红色 - 失败
  }
  return '#34c759' // 绿色 - 正常
})

// 显示错误信息
const showError = computed(() => {
  return indexStatus.value?.initializationFailed && indexStatus.value?.error
})

// 手动重建
const triggerRebuild = async () => {
  if (isRebuilding.value) {
    alert('索引正在重建中，请稍候...')
    return
  }
  
  // 先检查当前状态
  await checkStatus()
  
  // 如果已经在初始化，提示用户
  if (indexStatus.value?.isInitializing) {
    const shouldWait = confirm('索引正在初始化中，是否等待完成后再重建？')
    if (!shouldWait) return
    
    // 等待初始化完成（最多等30秒）
    let waited = 0
    while (indexStatus.value?.isInitializing && waited < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await checkStatus()
      waited++
    }
    
    if (indexStatus.value?.isInitializing) {
      alert('索引初始化超时，请稍后再试')
      return
    }
  }
  
  if (!confirm('确定要重新建立文件索引吗？这可能需要几分钟时间。')) {
    return
  }
  
  isRebuilding.value = true
  try {
    await handleRebuild()
    alert('索引重建已开始，请稍等片刻...')
    // 等待一会儿再检查状态
    setTimeout(async () => {
      await checkStatus()
      isRebuilding.value = false
    }, 2000)
  } catch (error: any) {
    console.error('[SettingFileIndex] Rebuild failed:', error)
    isRebuilding.value = false
    
    // 更友好的错误提示
    const errorMsg = error?.message || String(error)
    if (errorMsg.includes('already in progress')) {
      alert('索引正在重建中，请稍后再试')
    } else {
      alert('重建失败：' + errorMsg)
    }
  }
}

// 组件挂载时检查状态
onMounted(() => {
  checkStatus()
  // 每30秒自动检查一次
  setInterval(checkStatus, 30000)
})
</script>

<template>
  <TuffGroupBlock
    name="文件索引"
    description="管理文件搜索索引"
    default-icon="i-carbon-document-tasks"
    active-icon="i-carbon-document-tasks"
    memory-name="setting-file-index"
  >
    <!-- 索引状态显示 -->
    <TuffBlockSlot
      title="索引状态"
      description="当前文件索引的运行状态"
      default-icon="i-carbon-status"
      active-icon="i-carbon-status"
    >
      <div class="status-badge" :style="{ '--status-color': statusColor }">
        {{  statusText }}
      </div>
    </TuffBlockSlot>

    <!-- 错误信息显示（仅失败时） -->
    <TuffBlockSlot
      v-if="showError"
      title="错误详情"
      description="索引失败的原因"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
    >
      <div class="error-text">
        {{ indexStatus.error }}
      </div>
    </TuffBlockSlot>

    <!-- 重建按钮 -->
    <TuffBlockSlot
      title="重建索引"
      description="清空索引并重新扫描所有文件"
      default-icon="i-carbon-reset"
      active-icon="i-carbon-reset"
    >
      <button 
        class="rebuild-button"
        :disabled="isRebuilding"
        @click="triggerRebuild"
      >
        {{ isRebuilding ? '重建中...' : '立即重建' }}
      </button>
    </TuffBlockSlot>

    <!-- 最后检查时间 -->
    <TuffBlockSlot
      v-if="lastChecked"
      title="最后检查"
      description="最后一次状态检查的时间"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div class="time-text">
        {{ lastChecked.toLocaleTimeString() }}
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: color-mix(in srgb, var(--status-color) 15%, transparent);
  color: var(--status-color);
  border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
}

.error-text {
  font-size: 12px;
  color: #ff3b30;
  padding: 8px 12px;
  background: rgba(255, 59, 48, 0.1);
  border-radius: 6px;
  border-left: 3px solid #ff3b30;
  font-family: monospace;
  word-break: break-all;
  max-width: 400px;
}

.rebuild-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #007aff, #0051d5);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rebuild-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.rebuild-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.time-text {
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-family: monospace;
}
</style>
