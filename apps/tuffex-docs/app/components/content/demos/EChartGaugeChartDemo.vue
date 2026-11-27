<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const name = computed(() => locale.value === 'zh' ? 'P95 命中率' : 'P95 hit rate')
</script>

<template>
  <div class="echart-demo">
    <TxGaugeChart
      :value="72"
      :name="name"
      unit="%"
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
