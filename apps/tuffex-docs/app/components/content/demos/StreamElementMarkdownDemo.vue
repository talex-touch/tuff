<script setup lang="ts">
import type { TxStreamElementInstance } from '@talex-touch/tuffex/stream-element'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      content: [
        '本周的口味排行：',
        '',
        '| 口味 | 销量 | 环比 |',
        '|---|---|---|',
        '| 开心果 | 1,240 | +23% |',
        '| 香草 | 980 | +2% |',
        '| 桃子 | 610 | +11% |',
        '',
        '增速按 $g = (s_1 - s_0) / s_0$ 计算。下一步：',
        '',
        '- [x] 补货开心果原料',
        '- [ ] 给桃子加一次试吃',
        '',
        '```ts',
        'const growth = (now: number, before: number) => (now - before) / before',
        '```',
      ].join('\n'),
      replay: '重播',
    }
  : {
      content: [
        'This week\'s flavours:',
        '',
        '| Flavour | Sold | Change |',
        '|---|---|---|',
        '| Pistachio | 1,240 | +23% |',
        '| Vanilla | 980 | +2% |',
        '| Peach | 610 | +11% |',
        '',
        'Growth is $g = (s_1 - s_0) / s_0$. Next:',
        '',
        '- [x] Restock the pistachio base',
        '- [ ] Run a peach tasting',
        '',
        '```ts',
        'const growth = (now: number, before: number) => (now - before) / before',
        '```',
      ].join('\n'),
      replay: 'Replay',
    })

const elementRef = ref<TxStreamElementInstance | null>(null)
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// Complete content played back: `reserve` holds the final layout, so the table
// and the math arrive in order without moving anything below them.
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
  }, { threshold: 0.4 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="rootRef" class="stream-element-markdown not-prose">
    <TxButton size="sm" variant="secondary" class="stream-element-markdown__replay" @click="play">
      {{ copy.replay }}
    </TxButton>
    <TxStreamElement ref="elementRef" :content="copy.content" :locale="zh ? 'zh' : 'en'" reserve />
  </div>
</template>

<style scoped>
.stream-element-markdown {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 36rem;
}

.stream-element-markdown__replay {
  align-self: flex-start;
}
</style>
