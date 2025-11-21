<template>
  <TBottomDialog v-model="visible" title="文件索引初始化失败" class="file-index-fail-dialog">
    <div class="dialog-content">
      <div class="error-icon">⚠️</div>
      
      <p class="error-message">
        文件索引初始化失败，可能导致搜索功能无法正常使用。
      </p>
      
      <details v-if="errorDetail" class="error-detail">
        <summary>查看错误详情</summary>
        <pre>{{ errorDetail }}</pre>
      </details>
      
      <div v-if="rebuilding" class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }" />
        </div>
        <span class="progress-text">{{ progressText }}</span>
      </div>
      
      <div class="actions">
        <button 
          class="btn-rebuild" 
          :disabled="rebuilding"
          @click="handleRebuild"
        >
          {{ rebuilding ? '重建中...' : '重新建立索引' }}
        </button>
        
        <button class="btn-later" @click="handleLater">
          稍后处理
        </button>
        
        <label class="checkbox-label">
          <input v-model="dontRemindAgain" type="checkbox">
          <span>不再提醒</span>
        </label>
      </div>
    </div>
  </TBottomDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TBottomDialog from '../base/dialog/TBottomDialog.vue'

const props = defineProps<{
  modelValue: boolean
  errorDetail?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'rebuild': []
  'dismiss': [dontRemind: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const rebuilding = ref(false)
const progress = ref(0)
const progressText = ref('')
const dontRemindAgain = ref(false)

const handleRebuild = () => {
  rebuilding.value = true
  emit('rebuild')
}

const handleLater = () => {
  emit('dismiss', dontRemindAgain.value)
  visible.value = false
}

// 更新进度（由父组件调用）
const updateProgress = (current: number, total: number, stage: string) => {
  progress.value = total > 0 ? Math.round((current / total) * 100) : 0
  progressText.value = `${stage}: ${current}/${total}`
  
  if (progress.value >= 100) {
    setTimeout(() => {
      rebuilding.value = false
      visible.value = false
    }, 1000)
  }
}

defineExpose({ updateProgress })
</script>

<style scoped>
.file-index-fail-dialog .dialog-content {
  padding: 24px;
  text-align: center;
}

.error-icon {
  font-size: 56px;
  margin-bottom: 16px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.error-message {
  margin: 0 0 16px;
  color: var(--text-primary, #333);
  font-size: 15px;
  line-height: 1.6;
}

.error-detail {
  margin: 16px 0;
  text-align: left;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  padding: 12px;
}

.error-detail summary {
  cursor: pointer;
  color: var(--text-secondary, #666);
  font-size: 13px;
  user-select: none;
}

.error-detail pre {
  margin: 8px 0 0;
  padding: 0;
  font-size: 11px;
  color: var(--text-error, #d32f2f);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.progress-section {
  margin: 20px 0;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--bg-tertiary, #e0e0e0);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007aff, #0051d5);
  transition: width 0.3s ease;
}

.progress-text {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  margin-top: 24px;
}

.btn-rebuild,
.btn-later {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-rebuild {
  background: linear-gradient(135deg, #007aff, #0051d5);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
}

.btn-rebuild:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4);
}

.btn-rebuild:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-later {
  background: transparent;
  color: var(--text-secondary, #666);
  border: 1px solid var(--border-color, #ddd);
}

.btn-later:hover {
  background: var(--bg-hover, #f0f0f0);
}

.checkbox-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-tertiary, #999);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}
</style>
