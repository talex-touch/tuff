<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CoreBoxMock from './CoreBoxMock.vue'
import type { CoreBoxCommand } from './CoreBoxMock.vue'

const props = withDefaults(defineProps<{
  active?: boolean
  autoPlay?: boolean
}>(), {
  active: false,
  autoPlay: true,
})

const { t } = useI18n()

// 多个演示场景
interface DemoScenario {
  id: string
  commandId: string
  originalText: string
  resultLabel: string
  resultText: string
  resultIcon: string
  resultColor: string
}

const scenarios: DemoScenario[] = [
  {
    id: 'fixSpelling',
    commandId: 'fixSpelling',
    originalText: 'Europe offkrs an incredibla variety of ski destinations, from the towering peaks of the Alps.',
    resultLabel: 'Corrected',
    resultText: 'Europe offers an incredible variety of ski destinations, from the towering peaks of the Alps.',
    resultIcon: 'i-carbon-checkmark-filled',
    resultColor: '#4ade80',
  },
  {
    id: 'translate',
    commandId: 'translate',
    originalText: 'The quick brown fox jumps over the lazy dog.',
    resultLabel: 'Translated',
    resultText: '敏捷的棕色狐狸跳过了懒狗。',
    resultIcon: 'i-carbon-translate',
    resultColor: '#60a5fa',
  },
  {
    id: 'changeTone',
    commandId: 'changeToneCasual',
    originalText: 'We would like to inform you that your request has been processed.',
    resultLabel: 'Casual Tone',
    resultText: 'Hey! Just wanted to let you know your request is all done! 🎉',
    resultIcon: 'i-carbon-face-satisfied',
    resultColor: '#fbbf24',
  },
  {
    id: 'summarize',
    commandId: 'summarize',
    originalText: 'Machine learning is a subset of artificial intelligence that enables systems to learn from data.',
    resultLabel: 'Summary',
    resultText: 'ML: AI systems that learn from data automatically.',
    resultIcon: 'i-carbon-text-short-paragraph',
    resultColor: '#a78bfa',
  },
]

const commands = computed<CoreBoxCommand[]>(() => [
  {
    id: 'changeToneConfident',
    label: t('landing.os.aiOverview.demo.assist.commands.changeToneConfident'),
    icon: 'i-carbon-radio-button',
    iconColor: '#f472b6',
  },
  {
    id: 'changeToneCasual',
    label: t('landing.os.aiOverview.demo.assist.commands.changeToneCasual'),
    icon: 'i-carbon-radio-button',
    iconColor: '#f472b6',
  },
  {
    id: 'fixSpelling',
    label: t('landing.os.aiOverview.demo.assist.commands.fixSpelling'),
    icon: 'i-carbon-checkmark-filled',
    iconColor: '#a78bfa',
  },
  {
    id: 'translate',
    label: t('landing.os.aiOverview.demo.assist.commands.translate'),
    icon: 'i-carbon-translate',
    iconColor: '#60a5fa',
  },
  {
    id: 'summarize',
    label: t('landing.os.aiOverview.demo.assist.commands.summarize'),
    icon: 'i-carbon-text-short-paragraph',
    iconColor: '#a78bfa',
  },
])

const currentScenarioIndex = ref(0)
const currentScenario = computed((): DemoScenario => scenarios[currentScenarioIndex.value]!)

// 状态
const phase = ref<'idle' | 'showDoc' | 'showPanel' | 'selectCommand' | 'processing' | 'showResult' | 'hold'>('idle')
const selectedCommandId = ref<string | null>(null)
const isGenerating = ref(false)

const timers = new Set<ReturnType<typeof setTimeout>>()

function schedule(fn: () => void, delay: number) {
  const timer = setTimeout(() => {
    timers.delete(timer)
    fn()
  }, delay)
  timers.add(timer)
}

function clearAllTimers() {
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()
}

function resetState() {
  clearAllTimers()
  phase.value = 'idle'
  selectedCommandId.value = null
  isGenerating.value = false
}

function runScenario() {
  phase.value = 'showDoc'

  // 显示命令面板
  schedule(() => {
    phase.value = 'showPanel'

    // 选择命令
    schedule(() => {
      phase.value = 'selectCommand'
      selectedCommandId.value = currentScenario.value.commandId

      // 开始处理
      schedule(() => {
        phase.value = 'processing'
        isGenerating.value = true

        // 显示结果
        schedule(() => {
          isGenerating.value = false
          phase.value = 'showResult'

          // 保持展示
          schedule(() => {
            phase.value = 'hold'

            // 切换到下一个场景
            schedule(() => {
              currentScenarioIndex.value = (currentScenarioIndex.value + 1) % scenarios.length
              runScenario()
            }, 1500)
          }, 3000)
        }, 1800)
      }, 800)
    }, 600)
  }, 500)
}

function startAnimation() {
  resetState()
  currentScenarioIndex.value = 0
  runScenario()
}

watch(() => props.active, (newVal) => {
  if (newVal && props.autoPlay) {
    startAnimation()
  }
  else {
    resetState()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  clearAllTimers()
})
</script>

<template>
  <div class="ai-assist-demo">
    <div class="ai-assist-demo__stage">
      <!-- 文档窗口 -->
      <Transition name="doc">
        <div v-if="phase !== 'idle'" class="ai-assist-demo__doc">
          <div class="ai-assist-demo__doc-header">
            <div class="ai-assist-demo__doc-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div class="ai-assist-demo__doc-body">
            <p class="ai-assist-demo__doc-text" :class="{ 'is-selected': phase !== 'hold' }">
              {{ currentScenario.originalText }}
            </p>
          </div>
        </div>
      </Transition>

      <!-- 悬浮命令面板 -->
      <Transition name="panel">
        <div v-if="phase !== 'idle' && phase !== 'showDoc'" class="ai-assist-demo__panel-wrapper">
          <!-- 光晕效果 -->
          <div class="ai-assist-demo__glow" :class="{ 'is-active': isGenerating }" />

          <CoreBoxMock
            class="ai-assist-demo__panel"
            :commands="commands"
            :placeholder="t('landing.os.aiOverview.demo.assist.searchPlaceholder')"
            :selected-id="selectedCommandId"
            :show-results="phase === 'showPanel' || phase === 'selectCommand'"
            :results-title="t('landing.os.aiOverview.demo.assist.resultsTitle')"
            :show-logo="true"
          >
            <!-- 处理中 -->
            <Transition name="content-fade" mode="out-in">
              <div v-if="phase === 'processing'" key="processing" class="ai-assist-demo__processing">
                <div class="ai-assist-demo__processing-glow" />
                <div class="ai-assist-demo__processing-spinner" />
                <span>{{ t('landing.os.aiOverview.demo.assist.processing') }}</span>
              </div>

              <!-- 结果 -->
              <div v-else-if="phase === 'showResult' || phase === 'hold'" key="result" class="ai-assist-demo__result">
                <div class="ai-assist-demo__result-header">
                  <span :class="currentScenario.resultIcon" :style="{ color: currentScenario.resultColor }" />
                  <span>{{ currentScenario.resultLabel }}</span>
                </div>
                <div class="ai-assist-demo__result-text">
                  {{ currentScenario.resultText }}
                </div>
              </div>
            </Transition>
          </CoreBoxMock>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ai-assist-demo {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.ai-assist-demo__stage {
  position: relative;
  width: 100%;
  min-height: 320px;
}

/* 文档窗口 */
.ai-assist-demo__doc {
  width: 100%;
  max-width: 420px;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
}

.ai-assist-demo__doc-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ai-assist-demo__doc-dots {
  display: flex;
  gap: 0.5rem;
}

.ai-assist-demo__doc-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.ai-assist-demo__doc-dots span:nth-child(1) { background: #FF5F57; }
.ai-assist-demo__doc-dots span:nth-child(2) { background: #FEBC2E; }
.ai-assist-demo__doc-dots span:nth-child(3) { background: #28C840; }

.ai-assist-demo__doc-body {
  padding: 1.25rem 1.5rem;
}

.ai-assist-demo__doc-text {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.8);
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  transition: all 0.4s ease;
}

.ai-assist-demo__doc-text.is-selected {
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  border-radius: 4px;
  padding: 0.125rem 0.25rem;
  margin: -0.125rem -0.25rem;
}

/* 悬浮面板 */
.ai-assist-demo__panel-wrapper {
  position: absolute;
  top: 50%;
  right: 0;
  width: min(55%, 720px);
  transform: translateY(-50%);
  z-index: 10;
}

.ai-assist-demo__glow {
  position: absolute;
  inset: -40px;
  background: radial-gradient(circle at center, rgba(139, 92, 246, 0.2), transparent 70%);
  filter: blur(30px);
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
  z-index: -1;
}

.ai-assist-demo__glow.is-active {
  opacity: 1;
  animation: glowPulse 1.5s ease-in-out infinite;
}

.ai-assist-demo__panel {
  width: 100%;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 25px 60px -12px rgba(0, 0, 0, 0.6);
}

/* 处理中 */
.ai-assist-demo__processing {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.875rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.ai-assist-demo__processing-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.08), transparent);
  animation: shimmer 1.5s ease-in-out infinite;
}

.ai-assist-demo__processing-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(139, 92, 246, 0.9);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

/* 结果 */
.ai-assist-demo__result {
  padding: 1rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.05), transparent);
}

.ai-assist-demo__result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-assist-demo__result-text {
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}

/* 过渡动画 */
.doc-enter-active {
  transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.doc-leave-active {
  transition: all 0.3s ease-out;
}

.doc-enter-from {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}

.doc-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.panel-enter-active {
  transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.panel-leave-active {
  transition: all 0.3s ease-out;
}

.panel-enter-from {
  opacity: 0;
  transform: translateY(-50%) translateX(30px) scale(0.95);
}

.panel-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.95);
}

.content-fade-enter-active,
.content-fade-leave-active {
  transition: all 0.35s ease;
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.content-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
