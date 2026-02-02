<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { AssistAction, AssistDemo } from './types'

const props = withDefaults(defineProps<{
  active?: boolean
  autoPlay?: boolean
}>(), {
  active: false,
  autoPlay: true,
})

const { t } = useI18n()

const actions: AssistAction[] = [
  { id: 'ask', label: t('landing.os.aiOverview.demo.assist.actions.ask'), icon: 'i-carbon-chat' },
  { id: 'fixSpelling', label: t('landing.os.aiOverview.demo.assist.actions.fixSpelling'), icon: 'i-carbon-spell-check' },
  { id: 'translate', label: t('landing.os.aiOverview.demo.assist.actions.translate'), icon: 'i-carbon-translate' },
]

const currentAction = ref<AssistAction['id']>('fixSpelling')

const demos: Record<AssistAction['id'], AssistDemo> = {
  ask: {
    action: 'ask',
    originalText: 'What is the best way to optimize React performance?',
    result: 'Here are several effective strategies:\n\n1. Use React.memo() for functional components\n2. Implement useMemo() and useCallback() hooks\n3. Code splitting with React.lazy()\n4. Virtualize long lists with react-window',
  },
  fixSpelling: {
    action: 'fixSpelling',
    originalText: 'Europe offkrs an incredibla variety of ski destinations, from the towering peaks of Alps to the lesser-known slopes of Easte Europe. Whether you\'re seeking world-class resorts or hidden gems, the continent has something for every skier.',
    result: 'Europe offers an incredible variety of ski destinations, from the towering peaks of the Alps to the lesser-known slopes of Eastern Europe. Whether you\'re seeking world-class resorts or hidden gems, the continent has something for every skier.',
  },
  translate: {
    action: 'translate',
    originalText: 'Hello, how are you today?',
    result: '你好，今天怎么样？',
  },
}

const currentDemo = computed(() => demos[currentAction.value])
const showClipboard = ref(false)
const showResult = ref(false)
const isProcessing = ref(false)

watch(() => props.active, (newVal) => {
  if (newVal && props.autoPlay) {
    showClipboard.value = false
    showResult.value = false
    isProcessing.value = false
    currentAction.value = 'fixSpelling'
    
    // 第一步：显示复制文本
    setTimeout(() => {
      showClipboard.value = true
      // 第二步：显示处理中
      setTimeout(() => {
        isProcessing.value = true
        // 第三步：显示结果
        setTimeout(() => {
          isProcessing.value = false
          showResult.value = true
        }, 1500)
      }, 1000)
    }, 500)
  }
  else {
    showClipboard.value = false
    showResult.value = false
    isProcessing.value = false
  }
}, { immediate: true })

function selectAction(actionId: AssistAction['id']) {
  currentAction.value = actionId
  showClipboard.value = false
  showResult.value = false
  isProcessing.value = false
  
  setTimeout(() => {
    showClipboard.value = true
    setTimeout(() => {
      isProcessing.value = true
      setTimeout(() => {
        isProcessing.value = false
        showResult.value = true
      }, 1500)
    }, 1000)
  }, 300)
}

onMounted(() => {
  if (props.active && props.autoPlay) {
    setTimeout(() => {
      showClipboard.value = true
      setTimeout(() => {
        isProcessing.value = true
        setTimeout(() => {
          isProcessing.value = false
          showResult.value = true
        }, 1500)
      }, 1000)
    }, 500)
  }
})
</script>

<template>
  <div class="ai-assist-demo">
    <div class="ai-assist-demo__container">
      <!-- 操作按钮 -->
      <div class="ai-assist-demo__actions">
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="ai-assist-demo__action-btn"
          :class="{ 'is-active': currentAction === action.id }"
          @click="selectAction(action.id)"
        >
          <span v-if="action.icon" :class="action.icon" class="ai-assist-demo__action-icon" />
          <span>{{ action.label }}</span>
        </button>
      </div>

      <!-- 文档窗口模拟 -->
      <div v-if="showClipboard" class="ai-assist-demo__document">
        <div class="ai-assist-demo__document-header">
          <div class="ai-assist-demo__document-dots">
            <span />
            <span />
            <span />
          </div>
          <div class="ai-assist-demo__document-title">
            Top 10 Ski Destinations in Europe
          </div>
        </div>
        <div class="ai-assist-demo__document-content">
          <div class="ai-assist-demo__document-text">
            {{ currentDemo.originalText }}
          </div>
        </div>
      </div>

      <!-- AI 命令窗口 -->
      <div
        v-if="showClipboard"
        class="ai-assist-demo__command-window"
        :class="{ 'is-processing': isProcessing, 'is-result': showResult }"
      >
        <div class="ai-assist-demo__command-header">
          <div class="ai-assist-demo__command-search">
            <span class="i-carbon-search" />
            <span>Search AI Commands</span>
          </div>
        </div>
        
        <div class="ai-assist-demo__command-options">
          <div
            class="ai-assist-demo__command-option"
            :class="{ 'is-selected': currentAction === 'fixSpelling' }"
          >
            <span class="i-carbon-spell-check" />
            <span>Fix Spelling and Grammar</span>
          </div>
        </div>

        <!-- 处理中状态 -->
        <div v-if="isProcessing" class="ai-assist-demo__processing">
          <div class="ai-assist-demo__processing-dots">
            <span />
            <span />
            <span />
          </div>
          <span>Processing...</span>
        </div>

        <!-- 处理结果 -->
        <div v-if="showResult && !isProcessing" class="ai-assist-demo__result">
          <div class="ai-assist-demo__result-label">
            Corrected Text
          </div>
          <div class="ai-assist-demo__result-content">
            {{ currentDemo.result }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-assist-demo {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow: hidden;
}

.ai-assist-demo__container {
  width: 100%;
  max-width: 640px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 文档窗口 */
.ai-assist-demo__document {
  width: 100%;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 
    0 20px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  animation: fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-assist-demo__document-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ai-assist-demo__document-dots {
  display: flex;
  gap: 0.5rem;
}

.ai-assist-demo__document-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}

.ai-assist-demo__document-dots span:nth-child(1) { background: #FF5F57; opacity: 0.8; }
.ai-assist-demo__document-dots span:nth-child(2) { background: #FEBC2E; opacity: 0.8; }
.ai-assist-demo__document-dots span:nth-child(3) { background: #28C840; opacity: 0.8; }

.ai-assist-demo__document-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 0.5rem;
}

.ai-assist-demo__document-content {
  padding: 2rem;
  min-height: 240px;
}

.ai-assist-demo__document-text {
  font-size: 1.05rem;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
}

/* AI 命令窗口 */
.ai-assist-demo__command-window {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  background: rgba(20, 20, 25, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(24px);
  box-shadow: 
    0 0 0 1px rgba(255, 255, 255, 0.05),
    0 24px 60px -12px rgba(0, 0, 0, 0.6);
  animation: slideIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 10;
  overflow: hidden;
}

.ai-assist-demo__command-header {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ai-assist-demo__command-search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.875rem;
}

.ai-assist-demo__command-options {
  padding: 0.5rem;
}

.ai-assist-demo__command-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9375rem;
  transition: all 0.2s ease;
}

.ai-assist-demo__command-option.is-selected {
  background: rgba(139, 92, 246, 0.15);
  color: #fff;
}

.ai-assist-demo__processing {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.ai-assist-demo__processing-dots {
  display: flex;
  gap: 0.25rem;
}

.ai-assist-demo__processing-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  animation: thinkingDot 1.4s infinite ease-in-out;
}

.ai-assist-demo__processing-dots span:nth-child(1) { animation-delay: -0.32s; }
.ai-assist-demo__processing-dots span:nth-child(2) { animation-delay: -0.16s; }

.ai-assist-demo__result {
  padding: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(139, 92, 246, 0.05);
  animation: fadeInUp 0.4s ease-out;
}

.ai-assist-demo__result-label {
  font-size: 0.75rem;
  color: rgba(139, 92, 246, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.ai-assist-demo__result-content {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #fff;
  white-space: pre-wrap;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translate(-50%, -45%); }
  to { opacity: 1; transform: translate(-50%, -50%); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes thinkingDot {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.2); opacity: 1; }
}
</style>
