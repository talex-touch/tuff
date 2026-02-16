<script setup lang="ts">
import NumberFlow from '@number-flow/vue'
import { ref } from 'vue'

const value = ref(2847)
const insight = ref({
  from: 2531,
  to: value.value,
  type: 'percent',
  color: 'success',
  precision: 1,
})

const activeUsers = ref(18200)
const activeInsight = ref({
  from: 16800,
  to: activeUsers.value,
  type: 'delta',
  color: 'success',
  iconClass: 'i-carbon-growth',
})

const resourceLoad = ref(42)
const resourceInsight = ref({
  from: 35,
  to: resourceLoad.value,
  type: 'percent',
  color: 'danger',
  iconClass: 'i-carbon-arrow-up-right',
  precision: 1,
})

const healthStatus = ref('Synced')
const healthProgress = ref(78)
const healthMeta = ref('Last sync: 2s ago (v2.4.0)')

function bump() {
  const next = Math.floor(Math.random() * 4000) + 1000
  const nextUsers = Math.floor(Math.random() * 8000) + 14000
  const nextLoad = Math.floor(Math.random() * 50) + 30
  const nextProgress = Math.floor(Math.random() * 50) + 40
  const nextDelay = Math.floor(Math.random() * 16) + 2

  insight.value = {
    ...insight.value,
    from: value.value,
    to: next,
  }
  value.value = next

  activeInsight.value = {
    ...activeInsight.value,
    from: activeUsers.value,
    to: nextUsers,
  }
  activeUsers.value = nextUsers

  resourceInsight.value = {
    ...resourceInsight.value,
    from: resourceLoad.value,
    to: nextLoad,
  }
  resourceLoad.value = nextLoad

  healthProgress.value = nextProgress
  healthStatus.value = nextProgress > 85 ? 'Synced' : 'Syncing'
  healthMeta.value = `Last sync: ${nextDelay}s ago (v2.4.0)`
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; gap: 8px;">
      <TxButton @click="bump">
        Shuffle
      </TxButton>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <TxStatCard
        :value="value"
        label="Total Plugins"
        icon-class="i-carbon-download text-6xl text-[var(--tx-color-primary)]"
        :insight="insight"
        clickable
      />
      <TxStatCard
        :value="activeUsers"
        label="Active Users"
        icon-class="i-carbon-task text-6xl text-[var(--tx-color-success)]"
        :insight="activeInsight"
      />
      <TxStatCard
        :value="resourceLoad"
        label="Resource Load"
        icon-class="i-carbon-chip text-6xl text-[var(--tx-color-warning)]"
        :insight="resourceInsight"
      >
        <template #value>
          <div style="display: flex; align-items: baseline; gap: 6px;">
            <NumberFlow :value="resourceLoad" />
            <span style="font-size: 16px;">%</span>
          </div>
        </template>
      </TxStatCard>
      <TxStatCard
        variant="progress"
        :value="healthStatus"
        label="Cloud Sync"
        :meta="healthMeta"
        :progress="healthProgress"
        icon-class="i-carbon-cloud text-[var(--tx-color-primary)]"
      />
    </div>
  </div>
</template>
