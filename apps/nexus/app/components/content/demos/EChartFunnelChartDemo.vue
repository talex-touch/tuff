<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const data = computed(() => locale.value === 'zh'
  ? [
      { name: '访问', value: 12000 },
      { name: '注册', value: 3600 },
      { name: '试用', value: 1800 },
      { name: '付费', value: 540 },
      { name: '续费', value: 380 },
    ]
  : [
      { name: 'Visit', value: 12000 },
      { name: 'Signup', value: 3600 },
      { name: 'Trial', value: 1800 },
      { name: 'Paid', value: 540 },
      { name: 'Renew', value: 380 },
    ])

const unit = computed(() => locale.value === 'zh' ? '人' : 'users')
</script>

<template>
  <div class="echart-demo">
    <TxFunnelChart
      :data="data"
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
