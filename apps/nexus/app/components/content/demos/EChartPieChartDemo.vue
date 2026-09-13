<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const data = computed(() => locale.value === 'zh'
  ? [
      { name: '文档', value: 4820 },
      { name: '博客', value: 3160 },
      { name: '商店', value: 2140 },
      { name: '定价', value: 980 },
      { name: '其他', value: 640 },
    ]
  : [
      { name: 'Docs', value: 4820 },
      { name: 'Blog', value: 3160 },
      { name: 'Store', value: 2140 },
      { name: 'Pricing', value: 980 },
      { name: 'Other', value: 640 },
    ])

const centerLabel = computed(() => locale.value === 'zh' ? '访问占比' : 'Traffic share')

const unit = computed(() => locale.value === 'zh' ? '次' : 'views')
</script>

<template>
  <div class="echart-demo">
    <TxPieChart
      :data="data"
      :donut="true"
      :center-label="centerLabel"
      :unit="unit"
      :height="260"
    />
  </div>
</template>

<style scoped>
.echart-demo {
  width: 100%;
  max-width: 560px;
}
</style>
