<script setup lang="ts">
import type { StreamState } from '@talex-touch/tuffex/stream-text'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      text: '把 ls 打成 sl，终端不会报错，而是放出一列蒸汽火车，按它自己慢悠悠的节奏从屏幕上驶过。模型在这里停顿了一下，光标还在呼吸；随后它说完剩下的话，光标也跟着收起。',
      pauseAfter: '驶过。',
      replay: '重播',
      state: '状态',
      states: { idle: '未开始', streaming: '输出中', paused: '模型停顿', draining: '收尾', done: '完成' },
    }
  : {
      text: 'Mistype ls as sl and the terminal does not complain: it sends a steam locomotive across the screen at its own unhurried pace. The model pauses here while the caret keeps breathing, then finishes the rest, and the caret folds away.',
      pauseAfter: 'pace.',
      replay: 'Replay',
      state: 'State',
      states: { idle: 'Idle', streaming: 'Streaming', paused: 'Paused', draining: 'Draining', done: 'Done' },
    })

const content = ref('')
const streaming = ref(false)
const state = ref<StreamState>('idle')
const rootRef = ref<HTMLElement | null>(null)
let timer: number | undefined
let observer: IntersectionObserver | null = null

// Tokens arrive the way a model streams them: uneven bursts of 1–6 characters
// every 20–90ms, and one long pause mid-answer. The component smooths the
// bursts into a steady flow; the pause shows the caret's idle state.
function play() {
  window.clearTimeout(timer)
  const source = copy.value.text
  const pauseAt = source.indexOf(copy.value.pauseAfter) + copy.value.pauseAfter.length
  let index = 0
  let paused = false
  content.value = ''
  streaming.value = true
  const tick = () => {
    index = Math.min(source.length, index + 1 + Math.floor(Math.random() * 6))
    if (!paused && index >= pauseAt) {
      index = pauseAt
      paused = true
      content.value = source.slice(0, index)
      timer = window.setTimeout(tick, 1600)
      return
    }
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = window.setTimeout(tick, 20 + Math.random() * 70)
  }
  timer = window.setTimeout(tick, 160)
}

// Docs demos mount before they scroll into view; start when the reader can see it.
onMounted(() => {
  const el = rootRef.value
  if (!el || typeof IntersectionObserver === 'undefined') {
    play()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    play()
  }, { threshold: 0.6 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  window.clearTimeout(timer)
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="rootRef" class="stream-text-demo not-prose">
    <p class="stream-text-demo__text">
      <TxStreamText :content="content" :streaming="streaming" @state-change="state = $event" />
    </p>
    <div class="stream-text-demo__bar">
      <TxButton size="sm" variant="secondary" @click="play">
        {{ copy.replay }}
      </TxButton>
      <span class="stream-text-demo__state">{{ copy.state }} · {{ copy.states[state] }}</span>
    </div>
  </div>
</template>

<style scoped>
.stream-text-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 34rem;
}

.stream-text-demo__text {
  min-height: 5.1em;
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tx-text-color-primary);
}

.stream-text-demo__bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stream-text-demo__state {
  font-size: 12px;
  color: var(--tx-text-color-regular);
  font-variant-numeric: tabular-nums;
}
</style>
