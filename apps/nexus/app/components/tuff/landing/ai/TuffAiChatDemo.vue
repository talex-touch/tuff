<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTypewriter } from '~/composables/useTypewriter'

const props = withDefaults(defineProps<{
  active?: boolean
  autoPlay?: boolean
}>(), {
  active: false,
  autoPlay: true,
})

const { t } = useI18n()

const question = ref('useEffect 和 useLayoutEffect 有什么区别？')
const answer = ref(`主要区别在于执行时机：

useEffect 是异步的，在浏览器绘制完屏幕后执行。常用于数据获取、订阅等副作用。

useLayoutEffect 是同步的，在 DOM 更新后、浏览器绘制前执行。常用于需要同步测量 DOM 的场景。`)

const isThinking = ref(false)
const { displayed, isTyping, start, reset } = useTypewriter(answer.value, 30)

const showAnswer = computed(() => props.active && (displayed.value.length > 0 || isTyping.value))

watch(() => props.active, (newVal) => {
  if (newVal && props.autoPlay) {
    reset()
    setTimeout(() => {
      isThinking.value = true
      setTimeout(() => {
        isThinking.value = false
        start()
      }, 800)
    }, 500)
  }
  else {
    reset()
  }
}, { immediate: true })

onMounted(() => {
  if (props.active && props.autoPlay) {
    setTimeout(() => {
      isThinking.value = true
      setTimeout(() => {
        isThinking.value = false
        start()
      }, 800)
    }, 500)
  }
})
</script>

<template>
  <div class="ai-chat-demo">
    <div class="ai-chat-demo__container">
      <!-- 搜索框区域 -->
      <div class="ai-chat-demo__input-area">
        <div class="ai-chat-demo__input-wrapper">
          <div class="ai-chat-demo__input-icon">
            <span class="i-carbon-search text-lg" />
          </div>
          <div class="ai-chat-demo__input-text">
            {{ question }}
          </div>
        </div>
      </div>

      <!-- AI 回答区域 -->
      <div v-if="showAnswer" class="ai-chat-demo__answer-area">
        <div class="ai-chat-demo__answer-bubble">
          <div class="ai-chat-demo__answer-content">
            <div class="ai-chat-demo__answer-text">
              {{ displayed }}<span v-if="isTyping" class="ai-chat-demo__cursor">|</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 思考中状态 -->
      <div v-else-if="isThinking" class="ai-chat-demo__thinking">
        <div class="ai-chat-demo__thinking-dots">
          <span />
          <span />
          <span />
        </div>
        <span class="ai-chat-demo__thinking-text">{{ t('landing.os.aiOverview.demo.chat.thinking') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-demo {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2rem;
  max-width: 600px;
  margin: 0 auto;
}

.ai-chat-demo__container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.ai-chat-demo__input-area {
  width: 100%;
}

.ai-chat-demo__input-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(30, 30, 35, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.ai-chat-demo__input-icon {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.25rem;
}

.ai-chat-demo__input-text {
  flex: 1;
  color: rgba(255, 255, 255, 0.95);
  font-size: 1.1rem;
  line-height: 1.5;
  font-weight: 400;
}

.ai-chat-demo__answer-area {
  width: 100%;
  animation: messageEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-chat-demo__answer-bubble {
  padding: 1.5rem;
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 16px;
  border-top-left-radius: 4px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.ai-chat-demo__answer-content {
  color: rgba(255, 255, 255, 0.95);
}

.ai-chat-demo__answer-text {
  font-size: 1rem;
  line-height: 1.7;
  white-space: pre-wrap;
  letter-spacing: 0.01em;
}

.ai-chat-demo__cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: #8b5cf6;
  margin-left: 4px;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

.ai-chat-demo__thinking {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9375rem;
}

.ai-chat-demo__thinking-dots {
  display: flex;
  gap: 0.375rem;
}

.ai-chat-demo__thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  animation: thinkingDot 1.4s infinite ease-in-out;
}

.ai-chat-demo__thinking-dots span:nth-child(1) { animation-delay: -0.32s; }
.ai-chat-demo__thinking-dots span:nth-child(2) { animation-delay: -0.16s; }

.ai-chat-demo__thinking-text {
  font-weight: 500;
  letter-spacing: 0.02em;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes messageEnter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes thinkingDot {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.2); opacity: 1; }
}
</style>
