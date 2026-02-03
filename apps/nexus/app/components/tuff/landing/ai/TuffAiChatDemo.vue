<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { gsap } from 'gsap'
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

const commands = computed<CoreBoxCommand[]>(() => [
  {
    id: 'summarize',
    label: t('landing.os.aiOverview.demo.chat.commands.summarize.label'),
    description: t('landing.os.aiOverview.demo.chat.commands.summarize.description'),
    icon: 'i-carbon-text-align-left',
    iconColor: '#60a5fa',
  },
  {
    id: 'askChatGPT',
    label: t('landing.os.aiOverview.demo.chat.commands.ask.label'),
    description: t('landing.os.aiOverview.demo.chat.commands.ask.description'),
    icon: 'i-carbon-chat',
    iconColor: '#a78bfa',
  },
  {
    id: 'explain',
    label: t('landing.os.aiOverview.demo.chat.commands.explain.label'),
    description: t('landing.os.aiOverview.demo.chat.commands.explain.description'),
    icon: 'i-carbon-list-boxes',
    iconColor: '#f59e0b',
  },
])

const promptBank = computed(() => [
  {
    question: t('landing.os.aiOverview.demo.chat.prompts.composition.question'),
    intro: t('landing.os.aiOverview.demo.chat.prompts.composition.intro'),
    bullets: [
      t('landing.os.aiOverview.demo.chat.prompts.composition.bullets.first'),
      t('landing.os.aiOverview.demo.chat.prompts.composition.bullets.second'),
    ],
    note: t('landing.os.aiOverview.demo.chat.prompts.composition.note'),
  },
  {
    question: t('landing.os.aiOverview.demo.chat.prompts.whenUse.question'),
    intro: t('landing.os.aiOverview.demo.chat.prompts.whenUse.intro'),
    bullets: [
      t('landing.os.aiOverview.demo.chat.prompts.whenUse.bullets.first'),
      t('landing.os.aiOverview.demo.chat.prompts.whenUse.bullets.second'),
    ],
    note: t('landing.os.aiOverview.demo.chat.prompts.whenUse.note'),
  },
  {
    question: t('landing.os.aiOverview.demo.chat.prompts.reuse.question'),
    intro: t('landing.os.aiOverview.demo.chat.prompts.reuse.intro'),
    bullets: [
      t('landing.os.aiOverview.demo.chat.prompts.reuse.bullets.first'),
      t('landing.os.aiOverview.demo.chat.prompts.reuse.bullets.second'),
    ],
    note: t('landing.os.aiOverview.demo.chat.prompts.reuse.note'),
  },
  {
    question: t('landing.os.aiOverview.demo.chat.prompts.reactivity.question'),
    intro: t('landing.os.aiOverview.demo.chat.prompts.reactivity.intro'),
    bullets: [
      t('landing.os.aiOverview.demo.chat.prompts.reactivity.bullets.first'),
      t('landing.os.aiOverview.demo.chat.prompts.reactivity.bullets.second'),
    ],
    note: t('landing.os.aiOverview.demo.chat.prompts.reactivity.note'),
  },
])

const activePromptIndex = ref(0)
const activePrompt = computed(() => promptBank.value[activePromptIndex.value])
const codeExample = ref(`<script setup>
import { ref, computed, onMounted } from 'vue'

const count = ref(0)
const doubleCount = computed(() => count.value * 2)

function increment() {
  count.value++
}

onMounted(() => {
  console.log('Component mounted')
})
<\\/script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <p>Double: {{ doubleCount }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>`)

const isThinking = ref(false)
const showAnswer = ref(false)
const showEnter = ref(false)
const showCommands = ref(false)
const selectedCommandId = ref<string | null>(null)
const inputText = ref('')
const isRevealing = ref(false)

const TYPING_INTERVAL = 36
const ENTER_DELAY = 360
const COMMAND_SELECT_DELAY = 520
const COMMAND_CONFIRM_DELAY = 520
const THINKING_DURATION = 1360
const ANSWER_HOLD = 4800
const LOOP_GAP = 1440

let typingTimer: ReturnType<typeof setInterval> | null = null
const timers = new Set<ReturnType<typeof setTimeout>>()
const answerRef = ref<HTMLElement | null>(null)
const answerTrackRef = ref<HTMLElement | null>(null)
let answerTimeline: gsap.core.Timeline | null = null

const showAnswerPanel = computed(() => props.active && showAnswer.value)

function clearTimers() {
  if (typingTimer) {
    clearInterval(typingTimer)
    typingTimer = null
  }
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()
}

function schedule(fn: () => void, delay: number) {
  const timer = setTimeout(() => {
    timers.delete(timer)
    fn()
  }, delay)
  timers.add(timer)
}

function resetState() {
  clearTimers()
  inputText.value = ''
  showEnter.value = false
  showCommands.value = false
  selectedCommandId.value = null
  isThinking.value = false
  showAnswer.value = false
  isRevealing.value = false
}

function revealAnswerContent() {
  if (typeof window === 'undefined')
    return
  answerTimeline?.kill()
  answerTimeline = null
  const container = answerRef.value
  if (!container)
    return

  isRevealing.value = true
  const items = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal-block]'))
  if (!items.length) {
    isRevealing.value = false
    return
  }

  const track = answerTrackRef.value
  const itemDuration = 0.85
  const itemStagger = 0.5
  const totalDuration = itemDuration + (items.length - 1) * itemStagger
  const baseShift = 12
  const overflow = track ? Math.max(track.scrollHeight - container.clientHeight, 0) : 0
  const trackShift = overflow > 0 ? Math.min(overflow + 24, 180) : 36

  gsap.set(items, { autoAlpha: 0, y: 18, filter: 'blur(14px)' })
  if (track)
    gsap.set(track, { y: baseShift })
  answerTimeline = gsap.timeline({
    onComplete: () => {
      isRevealing.value = false
    },
  })
  if (track) {
    answerTimeline.to(track, {
      y: -trackShift,
      duration: totalDuration,
      ease: 'power1.out',
    }, 0)
  }
  answerTimeline.to(items, {
    autoAlpha: 1,
    y: 0,
    filter: 'blur(0px)',
    duration: itemDuration,
    ease: 'power2.out',
    stagger: itemStagger,
  })
}

function queueReveal(attempt = 0) {
  if (typeof window === 'undefined')
    return
  if (answerRef.value) {
    revealAnswerContent()
    return
  }
  if (attempt >= 12) {
    isRevealing.value = false
    return
  }
  window.requestAnimationFrame(() => queueReveal(attempt + 1))
}

function startSequence() {
  if (typeof window === 'undefined')
    return
  resetState()

  if (promptBank.value.length > 1) {
    let nextIndex = Math.floor(Math.random() * promptBank.value.length)
    if (nextIndex === activePromptIndex.value)
      nextIndex = (nextIndex + 1) % promptBank.value.length
    activePromptIndex.value = nextIndex
  }

  let index = 0
  typingTimer = setInterval(() => {
    index += 1
    inputText.value = activePrompt.value.question.slice(0, index)
    if (index < activePrompt.value.question.length)
      return

    if (typingTimer) {
      clearInterval(typingTimer)
      typingTimer = null
    }

    showEnter.value = true
    schedule(() => {
      showEnter.value = false
      showCommands.value = true

      schedule(() => {
        selectedCommandId.value = 'askChatGPT'

        schedule(() => {
          showCommands.value = false
          isThinking.value = true

          schedule(() => {
            isThinking.value = false
            showAnswer.value = true

            schedule(() => {
              if (!props.active || !props.autoPlay)
                return
              showAnswer.value = false
              schedule(() => {
                if (props.active && props.autoPlay)
                  startSequence()
              }, LOOP_GAP)
            }, ANSWER_HOLD)
          }, THINKING_DURATION)
        }, COMMAND_CONFIRM_DELAY)
      }, COMMAND_SELECT_DELAY)
    }, ENTER_DELAY)
  }, TYPING_INTERVAL)
}

function handleCommandSelect(command: CoreBoxCommand) {
  selectedCommandId.value = command.id
}

watch(() => [props.active, props.autoPlay], ([active, autoPlay]) => {
  if (typeof window === 'undefined')
    return
  if (active && autoPlay) {
    startSequence()
    return
  }
  resetState()
}, { immediate: true })

watch(showAnswer, (visible) => {
  if (visible) {
    nextTick(() => {
      if (typeof window === 'undefined')
        return
      queueReveal()
    })
    return
  }
  answerTimeline?.kill()
  answerTimeline = null
  isRevealing.value = false
})

onBeforeUnmount(() => {
  answerTimeline?.kill()
  answerTimeline = null
})
</script>

<template>
  <div class="ai-chat-demo">
    <div class="ai-chat-demo__container">
      <CoreBoxMock
        class="ai-chat-demo__corebox"
        :commands="commands"
        :input-text="inputText"
        :placeholder="t('landing.os.aiOverview.demo.chat.placeholder')"
        :selected-id="selectedCommandId"
        :show-results="showCommands"
        :results-title="t('landing.os.aiOverview.demo.chat.commandsTitle')"
        :show-logo="true"
        @select="handleCommandSelect"
      >
        <template #input-suffix>
          <span class="ai-chat-demo__enter" :class="{ 'is-active': showEnter }">↵</span>
          <span class="ai-chat-demo__enter-label">{{ t('landing.os.aiOverview.demo.chat.send') }}</span>
        </template>
        <div class="ai-chat-demo__panel">
          <Transition name="fade" mode="out-in">
            <div v-if="showAnswerPanel" key="answer" class="ai-chat-demo__answer">
              <div ref="answerRef" class="ai-chat-demo__answer-scroll" :class="{ 'is-revealing': isRevealing }">
                <div ref="answerTrackRef" class="ai-chat-demo__answer-track">
                  <div class="ai-chat-demo__answer-body">
                  <p data-reveal-block>
                    {{ activePrompt.intro }}
                  </p>
                  <ul>
                    <li
                      v-for="(bullet, idx) in activePrompt.bullets"
                      :key="idx"
                      data-reveal-block
                    >
                      {{ bullet }}
                    </li>
                  </ul>
                  <p v-if="activePrompt.note" class="ai-chat-demo__answer-note" data-reveal-block>
                    {{ activePrompt.note }}
                  </p>
                </div>
                <div class="ai-chat-demo__code-block" data-reveal-block>
                  <div class="ai-chat-demo__code-header">
                    <span class="ai-chat-demo__code-lang">vue</span>
                    <button type="button" class="ai-chat-demo__code-copy">
                      <span class="i-carbon-copy" />
                    </button>
                  </div>
                  <pre class="ai-chat-demo__code-content"><code>{{ codeExample }}</code></pre>
                </div>
                </div>
              </div>
            </div>
            <div v-else-if="isThinking" key="thinking" class="ai-chat-demo__thinking">
              <div class="ai-chat-demo__thinking-dots">
                <span />
                <span />
                <span />
              </div>
              <span class="ai-chat-demo__thinking-text">{{ t('landing.os.aiOverview.demo.chat.thinking') }}</span>
            </div>
          </Transition>
        </div>
        <div class="ai-chat-demo__footer">
          {{ t('landing.os.aiOverview.demo.chat.footer') }}
        </div>
      </CoreBoxMock>
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
  align-items: center;
  padding: 2rem;
}

.ai-chat-demo__container {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.ai-chat-demo__corebox {
  width: 100%;
}

.ai-chat-demo__corebox :deep(.corebox-mock__input) {
  background: rgba(255, 255, 255, 0.02);
}

.ai-chat-demo__corebox :deep(.corebox-mock__input-value) {
  font-weight: 500;
}

.ai-chat-demo__enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.ai-chat-demo__enter.is-active {
  color: #fff;
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.2);
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.35);
  transform: translateY(-1px);
}

.ai-chat-demo__enter-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ai-chat-demo__panel {
  padding: 0.875rem 1rem 1rem;
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.06), rgba(139, 92, 246, 0.02));
}

.ai-chat-demo__answer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-chat-demo__answer-scroll {
  max-height: 240px;
  overflow: hidden;
  padding-right: 0.5rem;
}

.ai-chat-demo__answer-scroll.is-revealing [data-reveal-block] {
  opacity: 0;
  filter: blur(12px);
  transform: translateY(12px);
}

.ai-chat-demo__answer-track {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  will-change: transform;
}

.ai-chat-demo__answer-scroll [data-reveal-block] {
  will-change: opacity, transform, filter;
}

.ai-chat-demo__answer-body {
  font-size: 0.9375rem;
  line-height: 1.7;
  white-space: pre-wrap;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.85);
}

.ai-chat-demo__answer-body p {
  margin: 0 0 0.75rem;
}

.ai-chat-demo__answer-body ul {
  margin: 0 0 0.75rem;
  padding-left: 1.1rem;
  color: rgba(255, 255, 255, 0.78);
}

.ai-chat-demo__answer-body li + li {
  margin-top: 0.35rem;
}

.ai-chat-demo__answer-note {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.55);
}

.ai-chat-demo__code-block {
  margin-top: 1rem;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
}

.ai-chat-demo__code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.ai-chat-demo__code-lang {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-chat-demo__code-copy {
  display: flex;
  align-items: center;
  padding: 0.375rem;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-chat-demo__code-copy:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.ai-chat-demo__code-content {
  margin: 0;
  padding: 1.25rem;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}

.ai-chat-demo__code-content code {
  display: block;
  white-space: pre;
}

.code-fade-enter-active {
  transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.code-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.code-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.ai-chat-demo__thinking {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
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

.ai-chat-demo__footer {
  padding: 0.65rem 1rem 0.75rem;
  text-align: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

@keyframes thinkingDot {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.2); opacity: 1; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
