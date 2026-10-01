<script setup lang="ts">
import type { StreamPart, TxStreamElementInstance } from '@talex-touch/tuffex/stream-element'
import type { StreamState } from '@talex-touch/tuffex/stream-text'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const SOURCE = { id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' }

const copy = computed(() => zh.value
  ? {
      parts: [
        { type: 'paragraph', inlines: [
          { type: 'text', text: '开心果连续三周领跑' },
          { type: 'citation', source: SOURCE, index: 1 },
          { type: 'text', text: '，走势如下：' },
        ] },
        { type: 'custom', name: 'chart', props: { values: [42, 55, 61, 78, 94] } },
        { type: 'paragraph', inlines: [{ type: 'text', text: '按这个斜率，下周会突破 1,300 份。' }] },
      ] satisfies StreamPart[],
      replay: '重播',
      state: '状态',
      states: { idle: '未开始', streaming: '输出中', paused: '停顿', draining: '收尾', done: '完成' },
      doneNote: '已完成，可以追问',
    }
  : {
      parts: [
        { type: 'paragraph', inlines: [
          { type: 'text', text: 'Pistachio has led for three weeks' },
          { type: 'citation', source: SOURCE, index: 1 },
          { type: 'text', text: ', and the trend looks like this:' },
        ] },
        { type: 'custom', name: 'chart', props: { values: [42, 55, 61, 78, 94] } },
        { type: 'paragraph', inlines: [{ type: 'text', text: 'At this slope, next week passes 1,300 scoops.' }] },
      ] satisfies StreamPart[],
      replay: 'Replay',
      state: 'State',
      states: { idle: 'Idle', streaming: 'Streaming', paused: 'Paused', draining: 'Draining', done: 'Done' },
      doneNote: 'Done: ask a follow-up',
    })

const elementRef = ref<TxStreamElementInstance | null>(null)
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function play() {
  elementRef.value?.replay()
}

watch(copy, async () => {
  await nextTick()
  play()
})

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
  }, { threshold: 0.5 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function barHeight(value: number, values: number[]): string {
  return `${Math.round((value / Math.max(...values)) * 100)}%`
}
</script>

<template>
  <div ref="rootRef" class="stream-element-slots not-prose">
    <TxStreamElement ref="elementRef" :parts="copy.parts" :word-ms="40" reserve>
      <!-- Every built-in piece can be replaced, and each slot is told where the stream is. -->
      <template #caret="{ state }">
        <span class="stream-element-slots__caret" :data-state="state" />
      </template>
      <template #citation="{ index }">
        <sup class="stream-element-slots__cite">{{ index }}</sup>
      </template>
      <template #part-chart="{ part, state }">
        <div class="stream-element-slots__chart" :data-state="state">
          <span
            v-for="(value, index) in (part.props?.values as number[])"
            :key="index"
            class="stream-element-slots__bar"
            :style="{ height: barHeight(value, part.props?.values as number[]) }"
          />
        </div>
      </template>
      <template #footer="{ state, done }">
        <div class="stream-element-slots__footer">
          <span>{{ copy.state }} · {{ copy.states[state as StreamState] }}</span>
          <span v-if="done">{{ copy.doneNote }}</span>
          <TxButton size="sm" variant="secondary" @click="play">
            {{ copy.replay }}
          </TxButton>
        </div>
      </template>
    </TxStreamElement>
  </div>
</template>

<style scoped>
.stream-element-slots {
  max-width: 34rem;
}

.stream-element-slots__caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  border-radius: 1px;
  background: var(--tx-color-primary);
}

.stream-element-slots__caret[data-state='paused'] {
  opacity: 0.4;
}

.stream-element-slots__cite {
  margin: 0 2px;
  color: var(--tx-color-primary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.stream-element-slots__chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 64px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
}

.stream-element-slots__bar {
  flex: 1;
  border-radius: 4px 4px 0 0;
  background: color-mix(in srgb, var(--tx-color-primary) 70%, transparent);
}

.stream-element-slots__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
</style>
