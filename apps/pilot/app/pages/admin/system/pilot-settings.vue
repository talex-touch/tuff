<script setup lang="ts">
definePageMeta({
  name: 'PilotSettingsHub',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const entries = [
  {
    title: 'Channels',
    description: '管理渠道、每个渠道的模型列表与启用模型。',
    path: '/admin/system/channels',
    icon: 'i-carbon-settings-adjust',
  },
  {
    title: 'Storage',
    description: '管理附件存储策略与 MinIO 配置。',
    path: '/admin/system/storage',
    icon: 'i-carbon-data-base-alt',
  },
  {
    title: 'Model Groups',
    description: '按组管理模型（含 icon、评分/计费、渠道模型映射）。',
    path: '/admin/system/model-groups',
    icon: 'i-carbon-machine-learning-model',
  },
  {
    title: 'Route Combos',
    description: '管理路由组合、LangGraph 绑定与 route 规则。',
    path: '/admin/system/route-combos',
    icon: 'i-carbon-flow-data',
  },
  {
    title: 'Routing Policy',
    description: '管理 routing / LB / memory 策略参数。',
    path: '/admin/system/routing-policy',
    icon: 'i-carbon-settings-check',
  },
  {
    title: 'Routing Metrics',
    description: '查看路由评比与成功率、TTFT 等指标。',
    path: '/admin/system/routing-metrics',
    icon: 'i-carbon-chart-line',
  },
]
</script>

<template>
  <el-container class="PilotSettingsHub">
    <el-main>
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="Pilot Settings 已拆分"
        description="为降低复杂度，原聚合页面已拆分为独立功能页面，请从下方入口进入。"
      />

      <div class="hub-grid">
        <NuxtLink
          v-for="entry in entries"
          :key="entry.path"
          class="hub-card"
          :to="entry.path"
        >
          <div class="hub-card-title">
            <i :class="entry.icon" />
            <h3>{{ entry.title }}</h3>
          </div>
          <p>{{ entry.description }}</p>
        </NuxtLink>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.hub-grid {
  margin-top: 12px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hub-card {
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 14px;
  text-decoration: none;
  color: var(--el-text-color-primary);
  transition: 0.2s ease;
}

.hub-card:hover {
  border-color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.hub-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hub-card-title h3 {
  margin: 0;
  font-size: 16px;
}

.hub-card p {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

@media (max-width: 900px) {
  .hub-grid {
    grid-template-columns: 1fr;
  }
}
</style>
