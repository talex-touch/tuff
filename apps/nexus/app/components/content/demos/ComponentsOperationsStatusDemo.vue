<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const autoGuard = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '运营状态面板',
      subtitle: '用指标卡、状态徽标和进度条组合出后台监控页的首屏状态。',
      review: '审阅完成',
      build: '构建稳定',
      sync: '同步健康',
      guard: '自动护栏',
      refresh: '刷新',
      health: '健康度',
      usage: '容量使用',
      queue: '待处理队列',
      api: 'API 可用率',
      release: '发布批次',
      checks: '质量检查',
      storage: '存储水位',
      alerts: '告警',
      ok: '正常',
      warning: '关注',
      blocked: '阻塞',
    }
  }

  return {
    title: 'Operations status panel',
    subtitle: 'Compose metric cards, status badges, and progress bars into a dashboard status header.',
    review: 'Review done',
    build: 'Build stable',
    sync: 'Sync healthy',
    guard: 'Auto guard',
    refresh: 'Refresh',
    health: 'Health',
    usage: 'Capacity',
    queue: 'Pending queue',
    api: 'API availability',
    release: 'Release batch',
    checks: 'Quality checks',
    storage: 'Storage waterline',
    alerts: 'Alerts',
    ok: 'Normal',
    warning: 'Watch',
    blocked: 'Blocked',
  }
})

const metrics = computed(() => [
  {
    label: labels.value.api,
    value: '99.9%',
    meta: labels.value.ok,
    iconClass: 'i-carbon-cloud-monitoring text-[var(--tx-color-success)]',
    status: 'success',
    progress: 99,
  },
  {
    label: labels.value.queue,
    value: 18,
    meta: labels.value.warning,
    iconClass: 'i-carbon-queued text-[var(--tx-color-warning)]',
    status: 'warning',
    progress: 64,
  },
  {
    label: labels.value.alerts,
    value: 2,
    meta: labels.value.blocked,
    iconClass: 'i-carbon-warning-alt text-[var(--tx-color-danger)]',
    status: 'danger',
    progress: 22,
  },
] as const)
</script>

<template>
  <section class="operations-demo">
    <header class="operations-demo__header">
      <div>
        <p class="operations-demo__eyebrow">
          Tuffex · Dashboard
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>

      <div class="operations-demo__actions">
        <label>
          <span>{{ labels.guard }}</span>
          <TuffSwitch v-model="autoGuard" size="small" />
        </label>
        <TxButton variant="secondary" size="sm" icon="i-carbon-renew">
          {{ labels.refresh }}
        </TxButton>
      </div>
    </header>

    <div class="operations-demo__badges">
      <TxStatusBadge :text="labels.review" status="success" size="sm" />
      <TxStatusBadge :text="labels.build" status="success" size="sm" os="linux" />
      <TxStatusBadge :text="labels.sync" status-key="granted" size="sm" />
    </div>

    <div class="operations-demo__cards">
      <TxStatCard
        v-for="metric in metrics"
        :key="metric.label"
        variant="progress"
        :value="metric.value"
        :label="metric.label"
        :meta="metric.meta"
        :progress="metric.progress"
        :icon-class="metric.iconClass"
      />
    </div>

    <div class="operations-demo__progress">
      <div>
        <span>{{ labels.release }}</span>
        <strong>86%</strong>
      </div>
      <TxProgressBar
        :percentage="86"
        status="success"
        height="10px"
        show-text
        flow-effect="shimmer"
        mask-variant="dashed"
      />
      <div>
        <span>{{ labels.checks }}</span>
        <strong>72%</strong>
      </div>
      <TxProgressBar
        :percentage="72"
        status="warning"
        height="10px"
        show-text
        flow-effect="wave"
      />
      <div>
        <span>{{ labels.storage }}</span>
        <strong>48%</strong>
      </div>
      <TxProgressBar
        :percentage="48"
        height="10px"
        show-text
        indicator-effect="sparkle"
      />
    </div>
  </section>
</template>

<style scoped>
.operations-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 820px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 18%, var(--tx-border-color-lighter));
  border-radius: 24px;
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--tx-color-success) 16%, transparent), transparent 30%),
    radial-gradient(circle at 96% 16%, color-mix(in srgb, var(--tx-color-primary) 18%, transparent), transparent 32%),
    color-mix(in srgb, var(--tx-bg-color) 86%, transparent);
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.08);
}

.operations-demo__header,
.operations-demo__actions,
.operations-demo__badges,
.operations-demo__progress > div {
  display: flex;
  align-items: center;
  gap: 12px;
}

.operations-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.operations-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.operations-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.operations-demo__header span,
.operations-demo__progress span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.operations-demo__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.operations-demo__actions label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
}

.operations-demo__badges {
  flex-wrap: wrap;
}

.operations-demo__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.operations-demo__progress {
  display: grid;
  gap: 9px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
}

.operations-demo__progress > div {
  justify-content: space-between;
}

.operations-demo__progress strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
}

@media (max-width: 760px) {
  .operations-demo__header,
  .operations-demo__actions {
    display: grid;
    justify-content: stretch;
  }

  .operations-demo__cards {
    grid-template-columns: 1fr;
  }
}
</style>
