<script setup lang="ts">
import type { StreamRevealPreset, TxStreamTextInstance } from '@talex-touch/tuffex/stream-text'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      text: '开心果是这个月增长最快的口味，销量涨了 23%，毛利也比香草高出 8 个点。核果类口味正在同一个区间里升温。',
      replay: '重播',
      presets: { aurora: '极光', hue: '色相', blur: '模糊', languid: '慢浮现', none: '无' },
    }
  : {
      text: 'Pistachio is your fastest-growing flavor: sales are up 23% this month, and margins beat vanilla by 8 points. Stone-fruit flavors are trending in the same range.',
      replay: 'Replay',
      presets: { aurora: 'Aurora', hue: 'Hue', blur: 'Blur', languid: 'Languid', none: 'None' },
    })

const PRESETS: StreamRevealPreset[] = ['aurora', 'hue', 'blur', 'languid', 'none']
const preset = ref<StreamRevealPreset>('aurora')
const textRef = ref<TxStreamTextInstance | null>(null)
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// The content is complete, so each preset plays it back with `replay()`, and
// `reserve` holds the final layout: switching never moves the lines.
function play() {
  textRef.value?.replay()
}

watch([preset, copy], async () => {
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
  }, { threshold: 0.6 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="rootRef" class="stream-text-presets not-prose">
    <div class="stream-text-presets__bar">
      <TxFlatRadio v-model="preset" size="sm">
        <TxFlatRadioItem v-for="name in PRESETS" :key="name" :value="name" :label="copy.presets[name]" />
      </TxFlatRadio>
      <TxButton size="sm" variant="secondary" @click="play">
        {{ copy.replay }}
      </TxButton>
    </div>
    <p class="stream-text-presets__text">
      <TxStreamText ref="textRef" :content="copy.text" :reveal="preset" reserve />
    </p>
  </div>
</template>

<style scoped>
.stream-text-presets {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 34rem;
}

.stream-text-presets__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.stream-text-presets__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tx-text-color-primary);
}
</style>
