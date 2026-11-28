<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const priceValue = ref('pro')
const priceSegments = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' },
]

const ratingValue = ref(3)
const ratingSegments = [
  { value: 1, label: '⭐' },
  { value: 2, label: '⭐⭐' },
  { value: 3, label: '⭐⭐⭐' },
  { value: 4, label: '⭐⭐⭐⭐' },
  { value: 5, label: '⭐⭐⭐⭐⭐' },
]

const labels = computed(() => locale.value === 'zh'
  ? { priceTitle: '价格档位选择', ratingTitle: '评分选择', current: '当前', stars: '星' }
  : { priceTitle: 'Price tier selection', ratingTitle: 'Rating selection', current: 'Current', stars: 'stars' })
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 24px; width: 400px;">
    <div>
      <div style="font-size: 14px; margin-bottom: 12px;">
        {{ labels.priceTitle }}
      </div>
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        {{ labels.current }}: {{ priceValue }}
      </div>
      <TxSegmentedSlider v-model="priceValue" :segments="priceSegments" />
    </div>

    <div>
      <div style="font-size: 14px; margin-bottom: 12px;">
        {{ labels.ratingTitle }}
      </div>
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        {{ labels.current }}: {{ ratingValue }} {{ labels.stars }}
      </div>
      <TxSegmentedSlider v-model="ratingValue" :segments="ratingSegments" />
    </div>
  </div>
</template>
