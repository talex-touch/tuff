<script setup lang="ts">
import type { StreamState } from '@talex-touch/tuffex/stream-text'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const CODE = `export async function churnBatch(flavor: string) {
  const base = await dairy.fetch({ flavor })
  if (!base.approved)
    return null

  await freezer.store(base, { temp: '-16C' })
  return base.gallons
}`

// The streamed box grows line by line; holding the finished height keeps the
// page below it still.
const MIN_HEIGHT = `calc(${CODE.split('\n').length} * 1.7em + 20px)`

const copy = computed(() => zh.value
  ? {
      replay: '重播',
      state: '状态',
      states: { idle: '未开始', streaming: '输出中', paused: '模型停顿', draining: '收尾', done: '完成' },
      copyLabel: '复制',
      copiedLabel: '已复制',
    }
  : {
      replay: 'Replay',
      state: 'State',
      states: { idle: 'Idle', streaming: 'Streaming', paused: 'Paused', draining: 'Draining', done: 'Done' },
      copyLabel: 'Copy',
      copiedLabel: 'Copied',
    })

const code = ref('')
const streaming = ref(false)
const state = ref<StreamState>('idle')
const rootRef = ref<HTMLElement | null>(null)
let timer: number | undefined
let observer: IntersectionObserver | null = null

// Tokens arrive the way a model streams them: uneven bursts of 1–6 characters
// every 20–90ms, and one long pause after the early return. The component
// turns the bursts into a steady word-by-word flow.
function play() {
  window.clearTimeout(timer)
  const pauseAt = CODE.indexOf('return null') + 'return null'.length
  let index = 0
  let paused = false
  code.value = ''
  streaming.value = true
  const tick = () => {
    index = Math.min(CODE.length, index + 1 + Math.floor(Math.random() * 6))
    if (!paused && index >= pauseAt) {
      index = pauseAt
      paused = true
      code.value = CODE.slice(0, index)
      timer = window.setTimeout(tick, 1400)
      return
    }
    code.value = CODE.slice(0, index)
    if (index >= CODE.length) {
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
  <div ref="rootRef" class="code-stream-live not-prose">
    <TxCodeStream
      :code="code"
      :streaming="streaming"
      lang="ts"
      filename="churn.ts"
      lang-label="TypeScript"
      :min-height="MIN_HEIGHT"
      :copy-label="copy.copyLabel"
      :copied-label="copy.copiedLabel"
      @state-change="state = $event"
    />
    <div class="code-stream-live__bar">
      <TxButton size="sm" variant="secondary" @click="play">
        {{ copy.replay }}
      </TxButton>
      <span class="code-stream-live__state">{{ copy.state }} · {{ copy.states[state] }}</span>
    </div>
  </div>
</template>

<style scoped>
.code-stream-live {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 34rem;
}

.code-stream-live__bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.code-stream-live__state {
  font-size: 12px;
  color: var(--tx-text-color-regular);
  font-variant-numeric: tabular-nums;
}
</style>
