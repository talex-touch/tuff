<script setup lang="ts">
import type { CardSpreadVariant, MotionCardItem } from '@talex-touch/tuffex/card-spread'
import { CARD_SPREAD_VARIANTS, TxCardSpread } from '@talex-touch/tuffex/card-spread'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh' ? {
  all: '全部变体', variant: '变体', expand: '展开卡片', collapse: '收起卡片', animated: '启用动画',
  arc: '邮票弧度', gap: '邮票间距', offset: '邮票垂直偏移', colorful: '彩色邮票',
  selected: '当前项', item: '手绘卡片', hint: '悬停或聚焦以展开，点击真实卡片改变当前项。方向键、Home 和 End 也可选择。',
  blur: '模糊强度', opacity: '非当前项不透明度', brackets: '显示聚焦括号',
} : {
  all: 'All variants', variant: 'Variant', expand: 'Expand cards', collapse: 'Collapse cards', animated: 'Animate',
  arc: 'Stamp arc', gap: 'Stamp gap', offset: 'Stamp vertical offset', colorful: 'Colorful stamps',
  selected: 'Current item', item: 'Original card', hint: 'Hover or focus to expand; selecting a real card changes the current item. Arrow keys, Home and End work too.',
  blur: 'Blur amount', opacity: 'Inactive opacity', brackets: 'Show focus brackets',
})
const filter = ref<CardSpreadVariant | 'all'>('all')
const variants = computed(() => filter.value === 'all' ? CARD_SPREAD_VARIANTS : [filter.value])
const expanded = ref(false)
const animated = ref(true)
const colorful = ref(true)
const arc = ref(25)
const gap = ref(180)
const offset = ref(40)
const blur = ref(4)
const opacity = ref(0.4)
const brackets = ref(true)
const indices = reactive<Record<string, number>>({})
const colors = ['#4b77be', '#559d85', '#ae7757', '#8b71ac', '#a89343', '#447e99', '#916f79']
const items = computed<MotionCardItem[]>(() => colors.map((color, index) => ({
  id: `original-${index}`, title: `${copy.value.item} ${index + 1}`,
  src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="${color}"/><circle cx="${25 + index * 7}" cy="40" r="22" fill="#fff" opacity=".45"/><path d="M0 110L48 ${50 + index * 3}L86 95L128 58V128H0Z" fill="#fff" opacity=".6"/></svg>`)}`,
})))
function forVariant(variant: CardSpreadVariant) { return items.value.slice(0, variant === 'card-arc-7' ? 7 : 5) }
</script>

<template>
  <div class="card-spread-demo not-prose">
    <div class="card-spread-demo__controls">
      <label>{{ copy.variant }} <select v-model="filter"><option value="all">{{ copy.all }}</option><option v-for="variant in CARD_SPREAD_VARIANTS" :key="variant" :value="variant">{{ variant }}</option></select></label>
      <label><input v-model="expanded" type="checkbox">{{ copy.expand }}</label>
      <label><input v-model="animated" type="checkbox">{{ copy.animated }}</label>
      <label><input v-model="colorful" type="checkbox">{{ copy.colorful }}</label>
      <label>{{ copy.arc }} {{ arc }}° <input v-model.number="arc" type="range" min="0" max="60"></label>
      <label>{{ copy.gap }} {{ gap }}px <input v-model.number="gap" type="range" min="0" max="220"></label>
      <label>{{ copy.offset }} {{ offset }}px <input v-model.number="offset" type="range" min="0" max="80"></label>
      <label>{{ copy.blur }} {{ blur }}px <input v-model.number="blur" type="range" min="0" max="8" step="0.5"></label>
      <label>{{ copy.opacity }} {{ opacity }} <input v-model.number="opacity" type="range" min="0.1" max="1" step="0.1"></label>
      <label><input v-model="brackets" type="checkbox">{{ copy.brackets }}</label>
    </div>
    <p>{{ copy.hint }}</p>
    <div class="card-spread-demo__grid">
      <section v-for="variant in variants" :key="variant" class="card-spread-demo__specimen">
        <h3>{{ variant }}</h3>
        <TxCardSpread :items="forVariant(variant)" :variant="variant" :model-value="indices[variant] ?? 0" :expanded="expanded ? true : undefined" :animated="animated" :angle="variant === 'card-stamp-arc' ? arc : undefined" :gap="variant === 'card-stamp-arc' ? gap : undefined" :y-offset="variant === 'card-stamp-arc' ? offset : undefined" :colorful="colorful" :blur-amount="blur" :opacity-amount="opacity" :show-brackets="brackets" :aria-label="variant" :expand-label="copy.expand" :collapse-label="copy.collapse" size="sm" @update:model-value="indices[variant] = $event" @update:expanded="expanded = $event">
          <template v-if="variant === 'focus-blur'" #item="{ item }">
{{ item.title }}
</template>
        </TxCardSpread>
        <output>{{ copy.selected }}: {{ (indices[variant] ?? 0) + 1 }}</output>
      </section>
    </div>
  </div>
</template>

<style scoped>
.card-spread-demo { display: grid; gap: 16px; font-size: 13px; color: var(--tx-text-color-primary); }
.card-spread-demo__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.card-spread-demo__controls label { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card-spread-demo__controls select { max-width: 220px; font: inherit; background: var(--tx-bg-color); color: inherit; }
.card-spread-demo__controls input[type='range'] { width: 120px; accent-color: var(--tx-color-primary); }
.card-spread-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px; }
.card-spread-demo__specimen { min-width: 0; padding: 12px; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.card-spread-demo h3 { font-size: 14px; font-weight: 600; margin: 0; }
.card-spread-demo p { margin: 0; line-height: 1.5; }
.card-spread-demo output { display: block; text-align: center; color: var(--tx-text-color-regular); }
</style>
