<script setup lang="ts">
import type { Carousel3DVariant } from '@talex-touch/tuffex/carousel-3d'
import { CAROUSEL_3D_VARIANTS, TxCarousel3D } from '@talex-touch/tuffex/carousel-3d'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh' ? {
  all: '全部变体', variant: '变体', previous: '上一项', next: '下一项', item: '原创景物',
  current: '当前项', timeline: '时间轴', animated: '启用动画', loop: '循环切换',
  expanded: '固定展开弧线', date: ['今天', '昨天', '上周', '上月', '去年'],
  hint: '三种轨迹各有彩色和单色版本。点击卡片、指示点或时间轴，拖动滑块；方向键和 Home/End 同样可操作。',
  slot: '自定义卡片插槽', descriptions: ['湖边晨光', '林间小径', '山谷落日', '暮色山脊', '海岸薄雾'],
} : {
  all: 'All variants', variant: 'Variant', previous: 'Previous', next: 'Next', item: 'Original landscape',
  current: 'Current item', timeline: 'Timeline', animated: 'Animate', loop: 'Loop',
  expanded: 'Keep arc expanded', date: ['Today', 'Yesterday', 'Last week', 'Last month', 'Last year'],
  hint: 'Each spatial path has color and monochrome versions. Select cards, dots or timeline ticks; drag the scrubber. Arrow keys and Home/End work as well.',
  slot: 'Custom item slot', descriptions: ['Lake at dawn', 'Forest path', 'Valley sunset', 'Ridge at dusk', 'Coastal mist'],
})
const filter = ref<Carousel3DVariant | 'all'>('all')
const variants = computed(() => filter.value === 'all' ? CAROUSEL_3D_VARIANTS : [filter.value])
const animated = ref(true)
const loop = ref(false)
const expanded = ref(false)
const indices = reactive<Record<string, number>>({})
const slotIndex = ref(0)
const colors = ['#536f92', '#648b77', '#a8825b', '#7f739d', '#567f85']
const items = computed(() => colors.map((color, index) => ({
  id: index, title: `${copy.value.item} ${index + 1}`, date: copy.value.date[index], description: copy.value.descriptions[index],
  src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160"><rect width="220" height="160" fill="${color}"/><circle cx="${50 + index * 20}" cy="50" r="25" fill="#fff" opacity=".7"/><path d="M0 160V120L70 60L120 100L190 50L220 100V160Z" fill="#fff" opacity=".45"/></svg>`)}`,
})))
</script>

<template>
  <div class="carousel-demo not-prose">
    <div class="carousel-demo__controls">
      <label>{{ copy.variant }} <select v-model="filter"><option value="all">{{ copy.all }}</option><option v-for="variant in CAROUSEL_3D_VARIANTS" :key="variant" :value="variant">{{ variant }}</option></select></label>
      <label><input v-model="animated" type="checkbox">{{ copy.animated }}</label>
      <label><input v-model="loop" type="checkbox">{{ copy.loop }}</label>
      <label><input v-model="expanded" type="checkbox">{{ copy.expanded }}</label>
    </div>
    <p>{{ copy.hint }}</p>
    <div class="carousel-demo__grid">
      <section v-for="variant in variants" :key="variant" class="carousel-demo__specimen">
        <h3>{{ variant }}</h3>
        <TxCarousel3D :variant="variant" :items="items" :model-value="indices[variant] ?? (variant.includes('time-machine') ? 0 : 2)" :animated="animated" :loop="loop" :expanded="expanded ? true : undefined" size="sm" :aria-label="variant" :previous-label="copy.previous" :next-label="copy.next" :item-label="copy.item" :timeline-label="copy.timeline" @update:model-value="indices[variant] = $event" />
        <output>{{ copy.current }}: {{ (indices[variant] ?? (variant.includes('time-machine') ? 0 : 2)) + 1 }}</output>
      </section>
    </div>
    <section class="carousel-demo__specimen">
      <h3>{{ copy.slot }}</h3>
      <TxCarousel3D v-model="slotIndex" :items="items" variant="card-cover-flow" :animated="animated" :previous-label="copy.previous" :next-label="copy.next" :item-label="copy.item" :aria-label="copy.slot">
        <template #item="{ item, index, active }">
<span class="carousel-demo__slot" :class="{ 'is-current': active }"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" :r="18 + index * 3" fill="none" stroke="currentColor" stroke-width="4" /><path d="M12 40H68M40 12V68" stroke="currentColor" /></svg><span>{{ item.title }}</span></span>
</template>
      </TxCarousel3D>
    </section>
  </div>
</template>

<style scoped>
.carousel-demo { display: grid; gap: 16px; color: var(--tx-text-color-primary); font-size: 13px; }
.carousel-demo__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.carousel-demo__controls label { display: flex; align-items: center; gap: 6px; }
.carousel-demo select { max-width: 230px; font: inherit; background: var(--tx-bg-color); color: inherit; }
.carousel-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.carousel-demo__specimen { padding: 12px; min-width: 0; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.carousel-demo h3 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
.carousel-demo p { margin: 0; line-height: 1.5; }
.carousel-demo output { display: block; text-align: center; color: var(--tx-text-color-regular); }
.carousel-demo__slot { display: grid; height: 100%; align-content: center; padding: 8px; box-sizing: border-box; color: var(--tx-text-color-regular); }
.carousel-demo__slot svg { width: 100%; }
.carousel-demo__slot.is-current { color: var(--tx-color-primary); }
</style>
