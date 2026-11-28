<script setup lang="ts">
import type { StreamInline, StreamState, TxStreamTextInstance } from '@talex-touch/tuffex/stream-text'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const SCOOP = { id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' }
const TRENDS = { id: 'trends', url: 'https://trends.google.com/trends/', title: 'Trends Index' }

const copy = computed(() => zh.value
  ? {
      content: [
        { type: 'text', text: '开心果是这个月增长最快的口味' },
        { type: 'citation', source: SCOOP, index: 1 },
        { type: 'text', text: '，销量 ' },
        { type: 'custom', name: 'delta', props: { value: '+23%' } },
        { type: 'text', text: '，核果类口味也在同一区间升温' },
        { type: 'citation', source: TRENDS, index: 2 },
        { type: 'text', text: '。' },
      ] satisfies StreamInline[],
      replay: '重播',
      states: { idle: '未开始', streaming: '输出中', paused: '停顿', draining: '收尾', done: '完成' },
    }
  : {
      content: [
        { type: 'text', text: 'Pistachio is your fastest-growing flavor' },
        { type: 'citation', source: SCOOP, index: 1 },
        { type: 'text', text: ', with sales ' },
        { type: 'custom', name: 'delta', props: { value: '+23%' } },
        { type: 'text', text: ', and stone-fruit is trending in the same range' },
        { type: 'citation', source: TRENDS, index: 2 },
        { type: 'text', text: '.' },
      ] satisfies StreamInline[],
      replay: 'Replay',
      states: { idle: 'Idle', streaming: 'Streaming', paused: 'Paused', draining: 'Draining', done: 'Done' },
    })

const state = ref<StreamState>('done')
const opened = ref<string | null>(null)
const textRef = ref<TxStreamTextInstance | null>(null)
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function play() {
  opened.value = null
  textRef.value?.replay()
}

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
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="rootRef" class="stream-text-slots not-prose">
    <p class="stream-text-slots__text">
      <TxStreamText ref="textRef" :content="copy.content" :word-ms="40" reserve @state-change="state = $event">
        <!-- Every built-in piece can be replaced, and each slot is told where the stream is. -->
        <template #caret="{ state: live }">
          <span class="stream-text-slots__caret" :data-state="live" />
        </template>
        <template #citation="{ source, index }">
          <button type="button" class="stream-text-slots__cite" :title="source.title" @click="opened = source.title ?? source.url">
            {{ index }}
          </button>
        </template>
        <template #inline="{ name, props }">
          <span v-if="name === 'delta'" class="stream-text-slots__delta">{{ props?.value }}</span>
        </template>
      </TxStreamText>
    </p>
    <div class="stream-text-slots__bar">
      <TxButton size="sm" variant="secondary" @click="play">
        {{ copy.replay }}
      </TxButton>
      <span class="stream-text-slots__meta">{{ copy.states[state] }}<template v-if="opened"> · {{ opened }}</template></span>
    </div>
  </div>
</template>

<style scoped>
.stream-text-slots {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 34rem;
}

.stream-text-slots__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tx-text-color-primary);
}

.stream-text-slots__caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  border-radius: 1px;
  background: var(--tx-color-primary);
}

.stream-text-slots__caret[data-state='paused'] {
  opacity: 0.4;
}

.stream-text-slots__cite {
  display: inline-grid;
  place-items: center;
  min-width: 1.35em;
  height: 1.35em;
  margin: 0 2px;
  padding: 0 4px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  vertical-align: 0.15em;
  cursor: pointer;
}

.stream-text-slots__cite:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 1px;
}

.stream-text-slots__delta {
  padding: 0 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-success) 50%, var(--tx-text-color-primary));
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.stream-text-slots__bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stream-text-slots__meta {
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
</style>
