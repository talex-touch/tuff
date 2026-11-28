<script setup lang="ts">
import type { AiSourceItem, AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { TxStreamElementInstance } from '@talex-touch/tuffex/stream-element'
import type { StreamRevealPreset, StreamState } from '@talex-touch/tuffex/stream-text'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const SOURCES: AiSourceItem[] = [
  { id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' },
  { id: 'trends', url: 'https://trends.google.com/trends/', title: 'Trends Index' },
  { id: 'dairy', url: 'https://dairy.example.com/docs/fetch', title: 'Dairy API' },
]

const CODE = [
  '```ts',
  'const cache = new Map<string, Promise<Base>>()',
  '',
  'export function fetchBase(flavor: string) {',
  '  if (!cache.has(flavor))',
  '    cache.set(flavor, dairy.fetch({ flavor }))',
  '  return cache.get(flavor)!',
  '}',
  '```',
].join('\n')

const copy = computed(() => zh.value
  ? {
      question: '为什么这批 churnBatch 跑得这么慢？',
      answer: [
        '## 慢在取数，不在排序',
        '',
        '排序是 **O(n log n)**，reduce 也不是瓶颈，真正慢的是每一行都调用一次 `dairy.fetch` [3]。开心果这个月的订单涨了 23% [1]，核果类口味也在同一区间升温 [2]，批次一大，等待就被放大了。',
        '',
        '- 按口味缓存 `dairy.fetch` 的结果',
        '- 保留迭代写法，省掉递归的栈开销',
        '- 批次超过 500 行时分片处理',
        '',
        CODE,
      ].join('\n'),
      pauseAfter: '被放大了。',
      replay: '重播',
      speed: '节奏',
      speeds: { 16: '快', 24: '标准', 48: '慢' } as Record<number, string>,
      presets: { aurora: '极光', hue: '色相', blur: '模糊', languid: '慢浮现', none: '无' },
      state: '状态',
      states: { idle: '未开始', streaming: '输出中', paused: '模型停顿', draining: '收尾', done: '完成' },
      sources: (n: number) => `引用了 ${n} 个来源`,
      opened: '打开来源',
      followUps: [
        { id: 'f1', text: '缓存要多久失效比较合适？' },
        { id: 'f2', text: '分片之后怎么保证顺序？' },
      ] as AiSuggestion[],
      helpful: '有帮助',
      unhelpful: '没帮助',
      copyLabel: '复制',
      copiedLabel: '已复制',
      regenerateLabel: '重新生成',
    }
  : {
      question: 'Why is this churnBatch run so slow?',
      answer: [
        '## The fetch, not the sort',
        '',
        'Sorting is **O(n log n)** and the reduce is not the bottleneck: every row calls `dairy.fetch` once [3]. Pistachio orders are up 23% this month [1], and stone-fruit is trending in the same range [2], so a bigger batch multiplies the wait.',
        '',
        '- Cache `dairy.fetch` per flavor',
        '- Keep the iterative form, without the recursion\'s stack',
        '- Split batches over 500 rows',
        '',
        CODE,
      ].join('\n'),
      pauseAfter: 'multiplies the wait.',
      replay: 'Replay',
      speed: 'Pace',
      speeds: { 16: 'Fast', 24: 'Normal', 48: 'Slow' } as Record<number, string>,
      presets: { aurora: 'Aurora', hue: 'Hue', blur: 'Blur', languid: 'Languid', none: 'None' },
      state: 'State',
      states: { idle: 'Idle', streaming: 'Streaming', paused: 'Paused', draining: 'Draining', done: 'Done' },
      sources: (n: number) => `Used ${n} sources`,
      opened: 'Opened',
      followUps: [
        { id: 'f1', text: 'How long should the cache live?' },
        { id: 'f2', text: 'How do I keep the order once batches are split?' },
      ] as AiSuggestion[],
      helpful: 'Helpful',
      unhelpful: 'Not helpful',
      copyLabel: 'Copy',
      copiedLabel: 'Copied',
      regenerateLabel: 'Regenerate',
    })

const PRESETS: StreamRevealPreset[] = ['aurora', 'hue', 'blur', 'languid', 'none']
const SPEEDS = [16, 24, 48]

const preset = ref<StreamRevealPreset>('aurora')
const speed = ref(24)
const question = ref('')
const content = ref('')
const streaming = ref(false)
const state = ref<StreamState>('idle')
const feedback = ref<'up' | 'down' | null>(null)
const opened = ref<AiSourceItem | null>(null)
const sourcesKey = ref(0)
const rootRef = ref<HTMLElement | null>(null)
// A live stream follows its source; a replay of the finished answer is where the pace (`wordMs`) sets the cadence.
const answerRef = ref<TxStreamElementInstance | null>(null)
let timer: number | undefined
let observer: IntersectionObserver | null = null

// Tokens arrive the way a model streams them: uneven bursts every 25–70ms and
// one long pause after the paragraph. The element paces them into one steady
// flow across heading, text, list and code.
function play(nextQuestion?: string) {
  window.clearTimeout(timer)
  const source = copy.value.answer
  const pauseAt = source.indexOf(copy.value.pauseAfter) + copy.value.pauseAfter.length
  let index = 0
  let paused = false
  question.value = nextQuestion ?? copy.value.question
  content.value = ''
  streaming.value = true
  feedback.value = null
  opened.value = null
  const tick = () => {
    index = Math.min(source.length, index + 2 + Math.floor(Math.random() * 6))
    if (!paused && index >= pauseAt) {
      index = pauseAt
      paused = true
      content.value = source.slice(0, index)
      timer = window.setTimeout(tick, 1200)
      return
    }
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = window.setTimeout(tick, 25 + Math.random() * 45)
  }
  timer = window.setTimeout(tick, 240)
}

// A chip names its source: open the list and say which one.
function onCite(source: AiSourceItem) {
  opened.value = source
  sourcesKey.value++
}

watch(copy, () => play())

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
  }, { threshold: 0.3 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  window.clearTimeout(timer)
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="rootRef" class="answer-demo not-prose">
    <div class="answer-demo__bar">
      <TxFlatRadio v-model="preset" size="sm">
        <TxFlatRadioItem v-for="name in PRESETS" :key="name" :value="name" :label="copy.presets[name]" />
      </TxFlatRadio>
      <TxFlatRadio v-model="speed" size="sm" :aria-label="copy.speed">
        <TxFlatRadioItem v-for="ms in SPEEDS" :key="ms" :value="ms" :label="copy.speeds[ms]" />
      </TxFlatRadio>
      <TxButton size="sm" variant="secondary" :disabled="state !== 'done'" @click="answerRef?.replay()">
        {{ copy.replay }}
      </TxButton>
    </div>

    <div class="answer-demo__question">
      {{ question || copy.question }}
    </div>

    <TxStreamElement
      ref="answerRef"
      class="answer-demo__answer"
      :content="content"
      :streaming="streaming"
      :sources="SOURCES"
      :reveal="preset"
      :word-ms="speed"
      :locale="zh ? 'zh' : 'en'"
      @cite="onCite"
      @state-change="state = $event"
    >
      <!-- Everything under the answer waits for it to finish. -->
      <template #footer="{ done }">
        <div v-if="done" class="answer-demo__footer">
          <TxMessageActions
            :copy-text="copy.answer"
            regenerable
            :copy-label="copy.copyLabel"
            :copied-label="copy.copiedLabel"
            :regenerate-label="copy.regenerateLabel"
            @regenerate="play()"
          >
            <button
              type="button"
              class="tx-message-actions__btn"
              :aria-pressed="feedback === 'up'"
              :aria-label="copy.helpful"
              :title="copy.helpful"
              @click="feedback = feedback === 'up' ? null : 'up'"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" :fill="feedback === 'up' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M7 10v11H4V10h3Zm0 0 4-7c1.1 0 2 .9 2 2v4h5.3a2 2 0 0 1 2 2.3l-1.2 7.2a2 2 0 0 1-2 1.7H7" />
              </svg>
            </button>
            <button
              type="button"
              class="tx-message-actions__btn"
              :aria-pressed="feedback === 'down'"
              :aria-label="copy.unhelpful"
              :title="copy.unhelpful"
              @click="feedback = feedback === 'down' ? null : 'down'"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" :fill="feedback === 'down' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M17 14V3h3v11h-3Zm0 0-4 7c-1.1 0-2-.9-2-2v-4H5.7a2 2 0 0 1-2-2.3l1.2-7.2a2 2 0 0 1 2-1.7H17" />
              </svg>
            </button>
          </TxMessageActions>
          <TxSources
            :key="sourcesKey"
            class="answer-demo__rise"
            :sources="SOURCES"
            variant="stack"
            :default-open="opened !== null"
            :label-formatter="copy.sources"
            @open="opened = $event"
          />
          <TxSuggestionChips class="answer-demo__rise answer-demo__rise--late" :suggestions="copy.followUps" layout="list" @select="play($event.text)" />
        </div>
      </template>
    </TxStreamElement>

    <div class="answer-demo__status">
      <span>{{ copy.state }} · {{ copy.states[state] }}</span>
      <span v-if="opened">{{ copy.opened }} · {{ opened.title }}</span>
    </div>
  </div>
</template>

<style scoped>
.answer-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 40rem;
}

.answer-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.answer-demo__question {
  align-self: flex-end;
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

/* The finished answer's height, held so the page below does not jump while it streams. */
.answer-demo__answer {
  min-height: 27rem;
}

.answer-demo__footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

@media (prefers-reduced-motion: no-preference) {
  .answer-demo__rise {
    animation: answer-demo-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
  }

  .answer-demo__rise--late {
    animation-delay: 240ms;
  }
}

@keyframes answer-demo-rise {
  from {
    opacity: 0;
    translate: 0 6px;
  }
}

.answer-demo__status {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 12px;
  color: var(--tx-text-color-regular);
  font-variant-numeric: tabular-nums;
}
</style>
