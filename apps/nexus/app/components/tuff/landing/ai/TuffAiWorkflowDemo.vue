<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CoreBoxMock from './CoreBoxMock.vue'

const props = withDefaults(defineProps<{
  active?: boolean
  autoPlay?: boolean
}>(), {
  active: false,
  autoPlay: true,
})

const { t } = useI18n()

interface WorkflowStep {
  id: string
  label: string
  icon: string
  iconColor: string
  status: 'pending' | 'running' | 'done'
}

interface WorkflowScenario {
  id: string
  trigger: string
  steps: Omit<WorkflowStep, 'status'>[]
  resultLabel: string
  resultText: string
}

const scenarios = computed<WorkflowScenario[]>(() => [
  {
    id: 'translate-email',
    trigger: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.trigger'),
    steps: [
      { id: 'read', label: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.steps.read'), icon: 'i-carbon-document', iconColor: '#60a5fa' },
      { id: 'translate', label: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.steps.translate'), icon: 'i-carbon-translate', iconColor: '#a78bfa' },
      { id: 'format', label: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.steps.format'), icon: 'i-carbon-text-align-left', iconColor: '#f59e0b' },
      { id: 'copy', label: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.steps.copy'), icon: 'i-carbon-copy', iconColor: '#4ade80' },
    ],
    resultLabel: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.resultLabel'),
    resultText: t('landing.os.aiOverview.demo.workflow.scenarios.translateEmail.resultText'),
  },
  {
    id: 'summarize-save',
    trigger: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.trigger'),
    steps: [
      { id: 'fetch', label: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.steps.fetch'), icon: 'i-carbon-link', iconColor: '#60a5fa' },
      { id: 'extract', label: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.steps.extract'), icon: 'i-carbon-filter', iconColor: '#f472b6' },
      { id: 'summarize', label: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.steps.summarize'), icon: 'i-carbon-text-short-paragraph', iconColor: '#a78bfa' },
      { id: 'save', label: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.steps.save'), icon: 'i-carbon-save', iconColor: '#4ade80' },
    ],
    resultLabel: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.resultLabel'),
    resultText: t('landing.os.aiOverview.demo.workflow.scenarios.summarizeSave.resultText'),
  },
  {
    id: 'code-review',
    trigger: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.trigger'),
    steps: [
      { id: 'diff', label: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.steps.diff'), icon: 'i-carbon-compare', iconColor: '#60a5fa' },
      { id: 'analyze', label: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.steps.analyze'), icon: 'i-carbon-search', iconColor: '#f59e0b' },
      { id: 'report', label: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.steps.report'), icon: 'i-carbon-report', iconColor: '#a78bfa' },
    ],
    resultLabel: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.resultLabel'),
    resultText: t('landing.os.aiOverview.demo.workflow.scenarios.codeReview.resultText'),
  },
])

const currentScenarioIndex = ref(0)
const currentScenario = computed(() => scenarios.value[currentScenarioIndex.value]!)

const phase = ref<'idle' | 'typing' | 'running' | 'result' | 'hold'>('idle')
const inputText = ref('')
const activeSteps = ref<WorkflowStep[]>([])
const currentStepIndex = ref(-1)
const showResult = ref(false)

const timers = new Set<ReturnType<typeof setTimeout>>()
let typingTimer: ReturnType<typeof setInterval> | null = null

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
  if (typingTimer) {
    clearInterval(typingTimer)
    typingTimer = null
  }
}

function resetState() {
  clearAllTimers()
  phase.value = 'idle'
  inputText.value = ''
  activeSteps.value = []
  currentStepIndex.value = -1
  showResult.value = false
}

function buildSteps(): WorkflowStep[] {
  return currentScenario.value.steps.map(s => ({ ...s, status: 'pending' as const }))
}

function runStepSequence(index: number) {
  if (index >= activeSteps.value.length) {
    showResult.value = true
    phase.value = 'result'
    schedule(() => {
      phase.value = 'hold'
      schedule(() => {
        currentScenarioIndex.value = (currentScenarioIndex.value + 1) % scenarios.value.length
        runScenario()
      }, 1800)
    }, 2800)
    return
  }

  currentStepIndex.value = index
  activeSteps.value[index]!.status = 'running'

  schedule(() => {
    activeSteps.value[index]!.status = 'done'
    schedule(() => {
      runStepSequence(index + 1)
    }, 200)
  }, 900)
}

function runScenario() {
  resetState()
  phase.value = 'typing'

  const text = currentScenario.value.trigger
  let charIndex = 0

  typingTimer = setInterval(() => {
    charIndex += 1
    inputText.value = text.slice(0, charIndex)

    if (charIndex >= text.length) {
      if (typingTimer) {
        clearInterval(typingTimer)
        typingTimer = null
      }

      schedule(() => {
        phase.value = 'running'
        activeSteps.value = buildSteps()
        schedule(() => {
          runStepSequence(0)
        }, 400)
      }, 500)
    }
  }, 32)
}

watch(() => props.active, (newVal) => {
  if (newVal && props.autoPlay) {
    runScenario()
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
  <div class="ai-workflow-demo">
    <div class="ai-workflow-demo__container">
      <CoreBoxMock
        class="ai-workflow-demo__corebox"
        :input-text="inputText"
        :placeholder="t('landing.os.aiOverview.demo.workflow.placeholder')"
        :show-results="false"
        :show-logo="true"
      >
        <template #input-suffix>
          <Transition name="badge-fade">
            <span v-if="phase === 'running' || phase === 'result' || phase === 'hold'" class="ai-workflow-demo__badge">
              <span class="i-carbon-flow" />
              {{ t('landing.os.aiOverview.demo.workflow.badge') }}
            </span>
          </Transition>
        </template>

        <!-- Workflow Pipeline -->
        <Transition name="pipeline-fade" mode="out-in">
          <div v-if="phase !== 'idle' && phase !== 'typing'" class="ai-workflow-demo__pipeline">
            <div class="ai-workflow-demo__steps">
              <div
                v-for="(step, index) in activeSteps"
                :key="step.id"
                class="ai-workflow-demo__step"
                :class="{
                  'is-pending': step.status === 'pending',
                  'is-running': step.status === 'running',
                  'is-done': step.status === 'done',
                }"
              >
                <div class="ai-workflow-demo__step-icon">
                  <span v-if="step.status === 'running'" class="ai-workflow-demo__step-spinner" />
                  <span v-else-if="step.status === 'done'" class="i-carbon-checkmark-filled ai-workflow-demo__step-check" />
                  <span v-else :class="step.icon" :style="{ color: step.iconColor }" />
                </div>
                <span class="ai-workflow-demo__step-label">{{ step.label }}</span>
                <span v-if="index < activeSteps.length - 1" class="ai-workflow-demo__step-arrow">
                  <span class="i-carbon-arrow-right" />
                </span>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="ai-workflow-demo__progress">
              <div
                class="ai-workflow-demo__progress-bar"
                :style="{
                  width: activeSteps.length
                    ? `${(activeSteps.filter(s => s.status === 'done').length / activeSteps.length) * 100}%`
                    : '0%',
                }"
              />
            </div>

            <!-- Result -->
            <Transition name="result-fade">
              <div v-if="showResult" class="ai-workflow-demo__result">
                <div class="ai-workflow-demo__result-header">
                  <span class="i-carbon-checkmark-filled" style="color: #4ade80" />
                  <span>{{ currentScenario.resultLabel }}</span>
                </div>
                <p class="ai-workflow-demo__result-text">
                  {{ currentScenario.resultText }}
                </p>
              </div>
            </Transition>
          </div>
        </Transition>

        <div class="ai-workflow-demo__footer">
          {{ t('landing.os.aiOverview.demo.workflow.footer') }}
        </div>
      </CoreBoxMock>
    </div>
  </div>
</template>

<style scoped>
.ai-workflow-demo {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 2rem;
}

.ai-workflow-demo__container {
  width: 100%;
  max-width: 580px;
  margin: 0 auto;
}

.ai-workflow-demo__corebox {
  width: 100%;
}

.ai-workflow-demo__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(139, 92, 246, 0.9);
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 20px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.ai-workflow-demo__pipeline {
  padding: 1rem 1.25rem 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.04), transparent);
}

.ai-workflow-demo__steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.ai-workflow-demo__step {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.ai-workflow-demo__step.is-running {
  border-color: rgba(139, 92, 246, 0.35);
  background: rgba(139, 92, 246, 0.08);
  box-shadow: 0 0 20px -4px rgba(139, 92, 246, 0.2);
}

.ai-workflow-demo__step.is-done {
  border-color: rgba(74, 222, 128, 0.2);
  background: rgba(74, 222, 128, 0.05);
}

.ai-workflow-demo__step.is-pending {
  opacity: 0.45;
}

.ai-workflow-demo__step-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.ai-workflow-demo__step-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-top-color: rgba(139, 92, 246, 0.9);
  border-radius: 50%;
  animation: workflow-spin 0.65s linear infinite;
}

.ai-workflow-demo__step-check {
  color: #4ade80;
  font-size: 1rem;
}

.ai-workflow-demo__step-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
}

.ai-workflow-demo__step.is-running .ai-workflow-demo__step-label {
  color: rgba(255, 255, 255, 0.95);
}

.ai-workflow-demo__step.is-done .ai-workflow-demo__step-label {
  color: rgba(255, 255, 255, 0.6);
}

.ai-workflow-demo__step-arrow {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.2);
  margin-left: 0.125rem;
}

.ai-workflow-demo__step.is-done .ai-workflow-demo__step-arrow {
  color: rgba(74, 222, 128, 0.4);
}

.ai-workflow-demo__progress {
  margin-top: 0.75rem;
  height: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.ai-workflow-demo__progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #4ade80);
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.ai-workflow-demo__result {
  margin-top: 0.875rem;
  padding: 0.875rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(74, 222, 128, 0.15);
  background: rgba(74, 222, 128, 0.04);
}

.ai-workflow-demo__result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.ai-workflow-demo__result-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
}

.ai-workflow-demo__footer {
  padding: 0.65rem 1rem 0.75rem;
  text-align: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* Transitions */
.badge-fade-enter-active,
.badge-fade-leave-active {
  transition: all 0.3s ease;
}

.badge-fade-enter-from,
.badge-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.pipeline-fade-enter-active {
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.pipeline-fade-leave-active {
  transition: all 0.25s ease-out;
}

.pipeline-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.pipeline-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.result-fade-enter-active {
  transition: all 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.result-fade-leave-active {
  transition: all 0.2s ease-out;
}

.result-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}

.result-fade-leave-to {
  opacity: 0;
}

@keyframes workflow-spin {
  to { transform: rotate(360deg); }
}
</style>
