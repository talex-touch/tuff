<script setup lang="ts">
import { ref } from 'vue'

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
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 24px; width: 400px;">
    <div>
      <div style="font-size: 14px; margin-bottom: 12px;">
        价格档位选择
      </div>
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        当前: {{ priceValue }}
      </div>
      <TxSegmentedSlider v-model="priceValue" :segments="priceSegments" />
    </div>

    <div>
      <div style="font-size: 14px; margin-bottom: 12px;">
        评分选择
      </div>
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        当前: {{ ratingValue }} 星
      </div>
      <TxSegmentedSlider v-model="ratingValue" :segments="ratingSegments" />
    </div>
  </div>
</template>
