<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'

const { locale } = useI18n()
const NumberFlowComponent = import.meta.client
  ? defineAsyncComponent(() => import('@number-flow/vue'))
  : null

const healthProgress = ref(78)
const healthDelay = ref(2)

const healthStatus = computed(() => {
  if (healthProgress.value > 85) {
    return locale.value === 'zh' ? '已同步' : 'Synced'
  }
  return locale.value === 'zh' ? '同步中' : 'Syncing'
})

const healthMeta = computed(() => {
  if (locale.value === 'zh') {
    return `${healthStatus.value} · 上次同步：${healthDelay.value}s 前 (v2.4.0)`
  }
  return `${healthStatus.value} · Last sync: ${healthDelay.value}s ago (v2.4.0)`
})

function bump() {
  healthProgress.value = Math.floor(Math.random() * 50) + 40
  healthDelay.value = Math.floor(Math.random() * 16) + 2
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; gap: 8px;">
      <TxButton @click="bump">
        {{ locale === 'zh' ? '随机刷新' : 'Shuffle' }}
      </TxButton>
    </div>

    <TxStatCard
      variant="progress"
      :value="healthProgress"
      :label="locale === 'zh' ? '云同步' : 'Cloud Sync'"
      :meta="healthMeta"
      :progress="healthProgress"
      icon-class="i-carbon-cloud text-[var(--tx-color-primary)]"
    >
      <template #value>
        <div style="display: flex; align-items: baseline; gap: 6px;">
          <component :is="NumberFlowComponent" v-if="NumberFlowComponent" :value="healthProgress" />
          <span v-else>{{ healthProgress }}</span>
          <span style="font-size: 16px;">%</span>
        </div>
      </template>
    </TxStatCard>
  </div>
</template>
