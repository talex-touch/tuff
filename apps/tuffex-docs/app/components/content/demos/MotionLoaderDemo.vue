<script setup lang="ts">
import type { MotionLoaderSize, MotionLoaderVariant } from '@talex-touch/tuffex/motion-loader'
import { MOTION_LOADER_SOURCES } from '@talex-touch/tuffex/motion-loader'
import { computed, ref, useId } from 'vue'

const { locale } = useI18n()
const id = useId()
const query = ref('')
const size = ref<MotionLoaderSize>('sm')
const speed = ref(1)
const showLabels = ref(true)
const playing = ref<Record<MotionLoaderVariant, boolean>>(
  Object.fromEntries(MOTION_LOADER_SOURCES.map(source => [source.id, true])) as Record<MotionLoaderVariant, boolean>,
)
const copy = computed(() => locale.value.startsWith('zh')
  ? {
      filter: '按名称、变体或源文件筛选',
      play: '播放',
      stop: '停止',
      playAll: '全部播放',
      stopAll: '全部停止',
      size: '尺寸',
      speed: '速度',
      showLabels: '显示状态文字',
      matches: '个匹配场景',
      source: '查看源文件',
      empty: '没有匹配的加载场景。',
      note: '全部 137 个场景均可独立控制。滚动离屏、隐藏页面或减少动态效果时，自动停止动画并保留可读画面。',
      labels: { loading: '加载中', thinking: '思考中', waiting: '请稍候', unlock: '滑动解锁', terminal: '加载中……', paused: '已暂停' },
    }
  : {
      filter: 'Filter by name, variant or source file',
      play: 'Play',
      stop: 'Stop',
      playAll: 'Play all',
      stopAll: 'Stop all',
      size: 'Size',
      speed: 'Speed',
      showLabels: 'Show status text',
      matches: 'matching scenes',
      source: 'View source',
      empty: 'No loading scenes match this filter.',
      note: 'All 137 scenes have independent playback controls. Offscreen, hidden-page and reduced-motion states stop animation and retain readable artwork.',
      labels: { loading: 'Loading', thinking: 'Thinking', waiting: 'Wait', unlock: 'Slide to unlock', terminal: 'loading...', paused: 'Paused' },
    })
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return MOTION_LOADER_SOURCES.filter(source =>
    `${source.name} ${source.id} ${source.source}`.toLowerCase().includes(needle))
})

function setAll(value: boolean): void {
  for (const source of MOTION_LOADER_SOURCES)
    playing.value[source.id] = value
}
</script>

<template>
  <div class="motion-loader-demo not-prose">
    <div class="motion-loader-demo__toolbar">
      <label :for="`${id}-filter`">{{ copy.filter }}</label>
      <input :id="`${id}-filter`" v-model="query" type="search" :placeholder="copy.filter">
      <div class="motion-loader-demo__controls">
        <TxButton size="sm" @click="setAll(true)">
{{ copy.playAll }}
</TxButton>
        <TxButton size="sm" @click="setAll(false)">
{{ copy.stopAll }}
</TxButton>
        <label :for="`${id}-size`">{{ copy.size }}</label>
        <select :id="`${id}-size`" v-model="size">
          <option value="xs">
xs
</option>
          <option value="sm">
sm
</option>
          <option value="md">
md
</option>
          <option value="lg">
lg
</option>
        </select>
        <label :for="`${id}-speed`">{{ copy.speed }} {{ speed }}×</label>
        <input :id="`${id}-speed`" v-model.number="speed" type="range" min="0.25" max="3" step="0.25">
        <label class="motion-loader-demo__checkbox">
          <input v-model="showLabels" type="checkbox">
          {{ copy.showLabels }}
        </label>
      </div>
    </div>
    <p class="motion-loader-demo__note">
{{ copy.note }}
</p>
    <p role="status">
{{ filtered.length }} / {{ MOTION_LOADER_SOURCES.length }} {{ copy.matches }}
</p>
    <div class="motion-loader-demo__catalog">
      <article v-for="source in filtered" :key="source.id" class="motion-loader-demo__entry">
        <h3>{{ source.name }}</h3>
        <code>{{ source.id }}</code>
        <div class="motion-loader-demo__stage">
          <TxMotionLoader
            :variant="source.id"
            :playing="playing[source.id]"
            :size="size"
            :speed="speed"
            :labels="copy.labels"
            :show-label="showLabels"
            :label="`${source.name} · ${copy.labels.loading}`"
          />
        </div>
        <div class="motion-loader-demo__actions">
          <TxButton
            size="sm"
            :aria-pressed="playing[source.id]"
            :aria-label="`${playing[source.id] ? copy.stop : copy.play} ${source.name}`"
            @click="playing[source.id] = !playing[source.id]"
          >
            {{ playing[source.id] ? copy.stop : copy.play }}
          </TxButton>
          <a
            :href="`https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/43c29ce9cdd16459e3eab4992381b8d35b38776a/${source.source}`"
            target="_blank"
            rel="noopener noreferrer"
          >{{ copy.source }}</a>
        </div>
      </article>
      <p v-if="!filtered.length">
{{ copy.empty }}
</p>
    </div>
  </div>
</template>

<style scoped>
.motion-loader-demo { display: grid; gap: 12px; font-size: 14px; }
.motion-loader-demo__toolbar { display: grid; gap: 6px; }
.motion-loader-demo__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.motion-loader-demo input[type='search'], .motion-loader-demo select {
  min-height: 32px;
  padding: 5px 10px;
  color: var(--tx-text-color-primary);
  background: var(--tx-bg-color);
  border: 0;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font: inherit;
}
.motion-loader-demo input:focus-visible, .motion-loader-demo select:focus-visible, .motion-loader-demo a:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}
.motion-loader-demo select, .motion-loader-demo input[type='range'], .motion-loader-demo input[type='checkbox'] { cursor: pointer; }
.motion-loader-demo__checkbox { display: inline-flex; align-items: center; gap: 6px; }
.motion-loader-demo__note { margin: 0; color: var(--tx-text-color-regular); }
.motion-loader-demo__catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 16px;
  max-height: 650px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 2px;
}
.motion-loader-demo__entry { display: grid; align-content: start; gap: 6px; padding: 12px 0; border-top: 1px solid var(--tx-border-color); }
.motion-loader-demo__entry h3 { margin: 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.motion-loader-demo__entry code { font-size: 12px; color: var(--tx-text-color-regular); overflow-wrap: anywhere; }
.motion-loader-demo__stage { display: flex; min-height: 152px; align-items: center; justify-content: center; overflow: hidden; }
.motion-loader-demo__actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.motion-loader-demo__actions a { color: var(--tx-text-color-regular); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
</style>
