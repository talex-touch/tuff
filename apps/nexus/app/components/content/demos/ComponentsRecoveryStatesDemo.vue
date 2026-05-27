<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const mode = ref<'loading' | 'empty' | 'error'>('empty')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '后台恢复状态',
      subtitle: '把加载、空态和错误态放进同一个数据面板，覆盖真实 Dashboard 的恢复路径。',
      loading: '加载中',
      empty: '无数据',
      error: '错误',
      refresh: '刷新',
      retry: '重试',
      create: '创建规则',
      learn: '查看教程',
      table: '自动化规则',
      loadingTitle: '正在加载规则',
      loadingDesc: '正在同步团队自动化规则，请稍等。',
      emptyTitle: '还没有自动化规则',
      emptyDesc: '创建第一条规则后，系统会自动展示触发条件、状态与最近执行记录。',
      errorTitle: '规则加载失败',
      errorDesc: '服务暂时不可用，请重试或检查后台日志。',
      noData: '没有规则数据',
      search: '搜索为空',
      noSelection: '未选择规则',
    }
  }

  return {
    title: 'Dashboard recovery states',
    subtitle: 'Place loading, empty, and error states inside one data panel to cover real recovery paths.',
    loading: 'Loading',
    empty: 'No data',
    error: 'Error',
    refresh: 'Refresh',
    retry: 'Retry',
    create: 'Create rule',
    learn: 'View guide',
    table: 'Automation rules',
    loadingTitle: 'Loading rules',
    loadingDesc: 'Syncing team automation rules. Please wait.',
    emptyTitle: 'No automation rules yet',
    emptyDesc: 'Create the first rule to show triggers, status, and recent executions.',
    errorTitle: 'Rules failed to load',
    errorDesc: 'The service is temporarily unavailable. Retry or check backend logs.',
    noData: 'No rule data',
    search: 'No search result',
    noSelection: 'No rule selected',
  }
})

const stateOptions = computed(() => [
  { value: 'loading', label: labels.value.loading },
  { value: 'empty', label: labels.value.empty },
  { value: 'error', label: labels.value.error },
] as const)
</script>

<template>
  <section class="recovery-demo">
    <header class="recovery-demo__header">
      <div>
        <p class="recovery-demo__eyebrow">
          Tuffex · Recovery
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew">
        {{ labels.refresh }}
      </TxButton>
    </header>

    <div class="recovery-demo__segmented" role="group" :aria-label="labels.title">
      <button
        v-for="option in stateOptions"
        :key="option.value"
        type="button"
        :class="{ 'is-active': mode === option.value }"
        @click="mode = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="recovery-demo__panel">
      <div class="recovery-demo__panel-title">
        <span>{{ labels.table }}</span>
        <TxStatusBadge :text="stateOptions.find(option => option.value === mode)?.label || labels.empty" :status="mode === 'error' ? 'danger' : mode === 'loading' ? 'warning' : 'muted'" size="sm" />
      </div>

      <TxLoadingState
        v-if="mode === 'loading'"
        :title="labels.loadingTitle"
        :description="labels.loadingDesc"
        surface="card"
        size="large"
      />

      <TxEmptyState
        v-else-if="mode === 'empty'"
        variant="no-data"
        :title="labels.emptyTitle"
        :description="labels.emptyDesc"
        surface="card"
        :primary-action="{ label: labels.create, type: 'primary', icon: 'i-carbon-add' }"
        :secondary-action="{ label: labels.learn, icon: 'i-carbon-book' }"
      />

      <TxErrorState
        v-else
        :title="labels.errorTitle"
        :description="labels.errorDesc"
        surface="card"
        :primary-action="{ label: labels.retry, type: 'primary', icon: 'i-carbon-renew' }"
        :secondary-action="{ label: labels.learn, icon: 'i-carbon-help' }"
      />
    </div>

    <div class="recovery-demo__presets">
      <TxNoData :title="labels.noData" size="small" surface="card" />
      <TxSearchEmpty :title="labels.search" size="small" surface="card" />
      <TxNoSelection :title="labels.noSelection" size="small" surface="card" />
    </div>
  </section>
</template>

<style scoped>
.recovery-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 820px);
  padding: 18px;
  border-radius: 24px;
  border: 1px solid var(--tx-border-color-lighter);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tx-color-primary) 10%, transparent), transparent 42%),
    var(--tx-bg-color);
}

.recovery-demo__header,
.recovery-demo__panel-title,
.recovery-demo__segmented,
.recovery-demo__presets {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recovery-demo__header,
.recovery-demo__panel-title {
  justify-content: space-between;
}

.recovery-demo__header {
  align-items: flex-start;
}

.recovery-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.recovery-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.recovery-demo__header span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.recovery-demo__segmented {
  width: fit-content;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
}

.recovery-demo__segmented button {
  border: 0;
  border-radius: 999px;
  padding: 7px 12px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.recovery-demo__segmented button.is-active {
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: 0 6px 18px rgb(15 23 42 / 0.08);
}

.recovery-demo__panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
}

.recovery-demo__panel-title {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.recovery-demo__presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.recovery-demo__presets :deep(.tx-empty-state) {
  min-height: 128px;
}

@media (max-width: 760px) {
  .recovery-demo__header,
  .recovery-demo__segmented,
  .recovery-demo__presets {
    display: grid;
  }

  .recovery-demo__presets {
    grid-template-columns: 1fr;
  }
}
</style>
