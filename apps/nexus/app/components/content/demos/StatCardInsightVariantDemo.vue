<script setup lang="ts">
import NumberFlow from '@number-flow/vue'
import { ref } from 'vue'

const { locale } = useI18n()

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

function bump() {
  const nextUsers = Math.floor(Math.random() * 8000) + 14000
  const nextLoad = Math.floor(Math.random() * 50) + 30

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
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; gap: 8px;">
      <TxButton @click="bump">
        {{ locale === 'zh' ? '随机刷新' : 'Shuffle' }}
      </TxButton>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <TxStatCard
        :value="activeUsers"
        :label="locale === 'zh' ? '活跃用户' : 'Active Users'"
        icon-class="i-carbon-task text-6xl text-[var(--tx-color-success)]"
        :insight="activeInsight"
      />
      <TxStatCard
        :value="resourceLoad"
        :label="locale === 'zh' ? '资源负载' : 'Resource Load'"
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
    </div>
  </div>
</template>
