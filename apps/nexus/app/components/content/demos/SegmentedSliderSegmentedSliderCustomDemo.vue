<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const priceSegments = ref('')
const priceValue = ref('')
const ratingSegments = ref('')
const ratingValue = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
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
  </div>
  <div v-else>
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
  </div>
</template>
