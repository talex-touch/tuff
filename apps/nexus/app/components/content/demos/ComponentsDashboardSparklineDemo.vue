<script setup lang="ts">
import { computed } from 'vue'
import DashboardSparklineChart from '~/components/dashboard/DashboardSparklineChart.client.vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: 'Dashboard 趋势图',
      subtitle: '复用后台图表封装，避免在页面里手写 SVG 折线。',
      search: '搜索',
      storage: '同步',
      healthy: '运行正常',
    }
  : {
      title: 'Dashboard trend chart',
      subtitle: 'Reuse the dashboard chart wrapper instead of hand-written SVG sparklines.',
      search: 'Search',
      storage: 'Sync',
      healthy: 'Healthy',
    }))
</script>

<template>
  <div class="sparkline-demo">
    <div class="sparkline-demo__header">
      <div>
        <p class="sparkline-demo__eyebrow">
          ECharts
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxStatusBadge :text="labels.healthy" status="success" size="sm" />
    </div>

    <div class="sparkline-demo__grid">
      <section>
        <div class="sparkline-demo__metric">
          <span>{{ labels.search }}</span>
          <strong>1,284</strong>
        </div>
        <DashboardSparklineChart
          :values="[18, 24, 21, 36, 42, 38, 54]"
          :labels="['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
          :height="116"
          color="var(--tx-color-primary, #409eff)"
          :aria-label="labels.search"
          show-grid
        />
      </section>

      <section>
        <div class="sparkline-demo__metric">
          <span>{{ labels.storage }}</span>
          <strong>98%</strong>
        </div>
        <DashboardSparklineChart
          :values="[90, 92, 91, 93, 95, 94, 98]"
          :height="116"
          color="#a855f7"
          :aria-label="labels.storage"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.sparkline-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 760px);
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color);
}

.sparkline-demo__header,
.sparkline-demo__grid,
.sparkline-demo__metric {
  display: flex;
  gap: 12px;
}

.sparkline-demo__header,
.sparkline-demo__metric {
  align-items: flex-start;
  justify-content: space-between;
}

.sparkline-demo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sparkline-demo__grid section {
  min-width: 0;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
  padding: 14px;
}

.sparkline-demo__eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--tx-color-primary);
  text-transform: uppercase;
}

.sparkline-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 20px;
}

.sparkline-demo span {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.sparkline-demo__metric strong {
  color: var(--tx-text-color-primary);
  font-size: 18px;
}

@media (max-width: 720px) {
  .sparkline-demo__grid,
  .sparkline-demo__header {
    display: grid;
  }
}
</style>
