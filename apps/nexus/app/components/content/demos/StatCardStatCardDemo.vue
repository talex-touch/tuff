<script setup lang="ts">
import NumberFlow from '@number-flow/vue'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const isZh = computed(() => locale.value === 'zh')
const texts = computed(() => {
  if (isZh.value) {
    return {
      shuffle: '随机刷新',
      defaultVariant: '默认样式 (default)',
      insightVariant: '趋势样式 (insight)',
      progressVariant: '进度样式 (progress)',
      totalPlugins: '插件总数',
      activeUsers: '活跃用户',
      resourceLoad: '资源负载',
      cloudSync: '云同步',
    }
  }

  return {
    shuffle: 'Shuffle',
    defaultVariant: 'Default Variant',
    insightVariant: 'Insight Variant',
    progressVariant: 'Progress Variant',
    totalPlugins: 'Total Plugins',
    activeUsers: 'Active Users',
    resourceLoad: 'Resource Load',
    cloudSync: 'Cloud Sync',
  }
})

const totalPlugins = ref(2847)

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

const healthProgress = ref(78)
const healthDelay = ref(2)

const healthStatus = computed(() => {
  if (healthProgress.value > 85) {
    return isZh.value ? '已同步' : 'Synced'
  }
  return isZh.value ? '同步中' : 'Syncing'
})

const healthMeta = computed(() => {
  if (isZh.value) {
    return `上次同步：${healthDelay.value}s 前 (v2.4.0)`
  }
  return `Last sync: ${healthDelay.value}s ago (v2.4.0)`
})

function bump() {
  const nextPlugins = Math.floor(Math.random() * 4000) + 1000
  const nextUsers = Math.floor(Math.random() * 8000) + 14000
  const nextLoad = Math.floor(Math.random() * 50) + 30
  const nextProgress = Math.floor(Math.random() * 50) + 40
  const nextDelay = Math.floor(Math.random() * 16) + 2

  totalPlugins.value = nextPlugins

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
  healthDelay.value = nextDelay
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; gap: 8px;">
      <TxButton @click="bump">
        {{ texts.shuffle }}
      </TxButton>
    </div>

    <section style="display: flex; flex-direction: column; gap: 8px;">
      <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--tx-color-text-2, #64748b);">
        {{ texts.defaultVariant }}
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        <TxStatCard
          :value="totalPlugins"
          :label="texts.totalPlugins"
          icon-class="i-carbon-download text-6xl text-[var(--tx-color-primary)]"
          clickable
        />
      </div>
    </section>

    <section style="display: flex; flex-direction: column; gap: 8px;">
      <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--tx-color-text-2, #64748b);">
        {{ texts.insightVariant }}
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        <TxStatCard
          :value="activeUsers"
          :label="texts.activeUsers"
          icon-class="i-carbon-task text-6xl text-[var(--tx-color-success)]"
          :insight="activeInsight"
        />
        <TxStatCard
          :value="resourceLoad"
          :label="texts.resourceLoad"
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
    </section>

    <section style="display: flex; flex-direction: column; gap: 8px;">
      <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--tx-color-text-2, #64748b);">
        {{ texts.progressVariant }}
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        <TxStatCard
          variant="progress"
          :value="healthStatus"
          :label="texts.cloudSync"
          :meta="healthMeta"
          :progress="healthProgress"
          icon-class="i-carbon-cloud text-[var(--tx-color-primary)]"
        />
      </div>
    </section>
  </div>
</template>
