<script setup lang="ts">
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()
const active = ref('')
const releaseMenuOpen = ref(false)
const insightOpen = ref(false)
const drawerVisible = ref(false)
const autoApply = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '后台导航配置壳层',
      subtitle: '用 Tabs 管理后台分区，用 DropdownMenu / Popover 承载轻量操作，用 Drawer 承载高密度配置。',
      overview: '总览',
      releases: '发布',
      security: '安全',
      review: '审阅状态',
      ready: '准备就绪',
      menu: '发布操作',
      quickRelease: '快速发布',
      rollback: '回滚批次',
      openDrawer: '打开配置抽屉',
      policyTitle: '发布策略',
      policyDesc: '展示当前分区的发布约束、护栏与审批配置。',
      insight: '策略说明',
      insightBody: '浮层只放短说明和轻量动作；长表单、权限矩阵和审计详情放进 Drawer。',
      action: '查看详情',
      guard: '自动护栏',
      approvals: '审批链路',
      scope: '作用范围',
      cancel: '关闭',
      save: '保存配置',
    }
  }

  return {
    title: 'Dashboard navigation shell',
    subtitle: 'Use Tabs for admin sections, DropdownMenu / Popover for lightweight actions, and Drawer for dense configuration.',
    overview: 'Overview',
    releases: 'Releases',
    security: 'Security',
    review: 'Review state',
    ready: 'Ready',
    menu: 'Release actions',
    quickRelease: 'Quick release',
    rollback: 'Rollback batch',
    openDrawer: 'Open config drawer',
    policyTitle: 'Release policy',
    policyDesc: 'Shows release constraints, guardrails, and approval settings for the active section.',
    insight: 'Policy notes',
    insightBody: 'Keep popovers short and action-light; move long forms, permission matrices, and audit detail into Drawer.',
    action: 'View detail',
    guard: 'Auto guardrail',
    approvals: 'Approval chain',
    scope: 'Scope',
    cancel: 'Close',
    save: 'Save config',
  }
})

const tabCards = computed<Array<{ label: string, value: string, tone: StatusTone }>>(() => [
  { label: labels.value.review, value: labels.value.ready, tone: 'success' },
  { label: labels.value.guard, value: autoApply.value ? 'ON' : 'OFF', tone: autoApply.value ? 'info' : 'warning' },
])

watch(
  () => locale.value,
  () => {
    active.value = labels.value.overview
  },
  { immediate: true },
)
</script>

<template>
  <section class="navigation-shell-demo">
    <header class="navigation-shell-demo__header">
      <div>
        <p class="navigation-shell-demo__eyebrow">
          Tuffex · Navigation
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxStatusBadge :text="labels.ready" status="success" size="sm" />
    </header>

    <div class="navigation-shell-demo__toolbar">
      <TxDropdownMenu
        v-model="releaseMenuOpen"
        :min-width="236"
        placement="bottom-start"
        panel-background="refraction"
      >
        <template #trigger>
          <button class="navigation-shell-demo__trigger" type="button">
            <span>{{ labels.menu }}</span>
            <TxIcon name="chevron-down" />
          </button>
        </template>

        <TxDropdownItem arrow>
          {{ labels.quickRelease }}
        </TxDropdownItem>
        <TxDropdownItem danger>
          {{ labels.rollback }}
        </TxDropdownItem>
      </TxDropdownMenu>

      <TxPopover
        v-model="insightOpen"
        placement="bottom-end"
        :min-width="280"
        :max-width="320"
        panel-background="glass"
      >
        <template #reference>
          <TxButton variant="secondary" size="sm" icon="i-carbon-information">
            {{ labels.insight }}
          </TxButton>
        </template>

        <div class="navigation-shell-demo__popover">
          <strong>{{ labels.insight }}</strong>
          <p>{{ labels.insightBody }}</p>
          <TxButton size="sm" variant="primary">
            {{ labels.action }}
          </TxButton>
        </div>
      </TxPopover>

      <TxButton variant="primary" size="sm" icon="i-carbon-settings-adjust" @click="drawerVisible = true">
        {{ labels.openDrawer }}
      </TxButton>
    </div>

    <TxTabs
      v-model="active"
      placement="left"
      :nav-min-width="176"
      :content-scrollable="false"
      indicator-variant="pill"
      indicator-motion="glide"
      auto-height
      :animation="{ size: { enabled: true, durationMs: 220 }, content: true }"
    >
      <TxTabItem :name="labels.overview" icon-class="i-carbon-dashboard" activation>
        <div class="navigation-shell-demo__panel">
          <div v-for="item in tabCards" :key="item.label" class="navigation-shell-demo__metric">
            <span>{{ item.label }}</span>
            <TxStatusBadge :text="item.value" :status="item.tone" size="sm" />
          </div>
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.releases" icon-class="i-carbon-rocket">
        <div class="navigation-shell-demo__panel">
          <TxProgressBar :percentage="82" status="success" show-text height="10px" />
          <p>{{ labels.policyDesc }}</p>
        </div>
      </TxTabItem>
      <TxTabItem :name="labels.security" icon-class="i-carbon-security">
        <div class="navigation-shell-demo__panel">
          <TxStatusBadge :text="labels.approvals" status="warning" size="sm" />
          <p>{{ labels.insightBody }}</p>
        </div>
      </TxTabItem>
    </TxTabs>

    <ClientOnly>
      <TxDrawer
        v-model:visible="drawerVisible"
        :title="labels.policyTitle"
        width="min(420px, 92vw)"
      >
        <div class="navigation-shell-demo__drawer">
          <p>{{ labels.policyDesc }}</p>
          <label>
            <span>{{ labels.guard }}</span>
            <TuffSwitch v-model="autoApply" />
          </label>
          <div>
            <span>{{ labels.approvals }}</span>
            <TxStatusBadge :text="labels.ready" status="success" size="sm" />
          </div>
          <div>
            <span>{{ labels.scope }}</span>
            <TxTag label="Nexus / Tuffex" icon="i-carbon-branch" />
          </div>
        </div>

        <template #footer>
          <div class="navigation-shell-demo__drawer-actions">
            <TxButton variant="secondary" @click="drawerVisible = false">
              {{ labels.cancel }}
            </TxButton>
            <TxButton variant="primary" @click="drawerVisible = false">
              {{ labels.save }}
            </TxButton>
          </div>
        </template>
      </TxDrawer>
    </ClientOnly>
  </section>
</template>

<style scoped>
.navigation-shell-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 900px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 16%, var(--tx-border-color-lighter));
  border-radius: 24px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--tx-color-primary) 15%, transparent), transparent 30%),
    radial-gradient(circle at 100% 12%, color-mix(in srgb, var(--tx-color-success) 14%, transparent), transparent 32%),
    var(--tx-bg-color);
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.08);
}

.navigation-shell-demo__header,
.navigation-shell-demo__toolbar,
.navigation-shell-demo__metric,
.navigation-shell-demo__drawer label,
.navigation-shell-demo__drawer > div,
.navigation-shell-demo__drawer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.navigation-shell-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.navigation-shell-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.navigation-shell-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.navigation-shell-demo__header span,
.navigation-shell-demo__panel p,
.navigation-shell-demo__popover p,
.navigation-shell-demo__drawer p,
.navigation-shell-demo__drawer span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.navigation-shell-demo__toolbar {
  flex-wrap: wrap;
}

.navigation-shell-demo__trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
  color: var(--tx-text-color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
}

.navigation-shell-demo__panel {
  display: grid;
  gap: 12px;
  min-height: 166px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 70%, transparent);
}

.navigation-shell-demo__metric {
  justify-content: space-between;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color) 82%, transparent);
}

.navigation-shell-demo__popover {
  display: grid;
  gap: 8px;
}

.navigation-shell-demo__popover strong {
  color: var(--tx-text-color-primary);
  font-size: 14px;
}

.navigation-shell-demo__popover p,
.navigation-shell-demo__drawer p {
  margin: 0;
  line-height: 1.7;
}

.navigation-shell-demo__drawer {
  display: grid;
  gap: 14px;
}

.navigation-shell-demo__drawer label,
.navigation-shell-demo__drawer > div {
  justify-content: space-between;
  padding: 12px;
  border-radius: 14px;
  background: var(--tx-fill-color-light);
}

.navigation-shell-demo__drawer-actions {
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .navigation-shell-demo__header {
    display: grid;
  }
}
</style>
