<script setup lang="ts">
interface AdminNavItem {
  path: string
  label: string
  icon: string
}

interface AdminNavGroup {
  title: string
  items: AdminNavItem[]
}

const route = useRoute()

const groups: AdminNavGroup[] = [
  {
    title: '总览',
    items: [
      { path: '/admin', label: '管理首页', icon: 'i-carbon-dashboard' },
    ],
  },
  {
    title: '系统管理',
    items: [
      { path: '/admin/system/user', label: '用户管理', icon: 'i-carbon-user-multiple' },
      { path: '/admin/system/dept', label: '部门管理', icon: 'i-carbon-tree' },
      { path: '/admin/system/dict-type', label: '字典类型', icon: 'i-carbon-catalog' },
      { path: '/admin/system/orders', label: '订单管理', icon: 'i-carbon-purchase' },
      { path: '/admin/system/coupon', label: '券码管理', icon: 'i-carbon-ticket' },
      { path: '/admin/system/feedbackManage', label: '反馈管理', icon: 'i-carbon-chat' },
      { path: '/admin/system/guide', label: '系统指南', icon: 'i-carbon-book' },
      { path: '/admin/system/monitor', label: '系统监控', icon: 'i-carbon-chart-line' },
      { path: '/admin/system/param-config', label: '参数配置', icon: 'i-carbon-settings-check' },
      { path: '/admin/system/schedule', label: '任务调度', icon: 'i-carbon-timer' },
      { path: '/admin/system/subscriptions', label: '订阅管理', icon: 'i-carbon-certificate' },
    ],
  },
  {
    title: '内容运营',
    items: [
      { path: '/admin/marketing/banners', label: 'Banner 管理', icon: 'i-carbon-image' },
      { path: '/admin/wechat/livechat', label: 'LiveChat', icon: 'i-carbon-chat-bot' },
      { path: '/admin/wechat/menu', label: '微信公众号菜单', icon: 'i-carbon-logo-wechat' },
      { path: '/admin/tool/storage', label: '文件存储', icon: 'i-carbon-document' },
    ],
  },
  {
    title: 'AIGC 管理',
    items: [
      { path: '/admin/aigc/prompt', label: 'Prompt 管理', icon: 'i-carbon-ai-status' },
      { path: '/admin/aigc/prompt_tags', label: 'Prompt Tags', icon: 'i-carbon-tag' },
      { path: '/admin/aigc/log', label: '对话日志', icon: 'i-carbon-document-view' },
    ],
  },
  {
    title: 'App 管理',
    items: [
      { path: '/admin/system/channels', label: 'Channels', icon: 'i-carbon-settings-adjust' },
      { path: '/admin/system/storage', label: 'Storage', icon: 'i-carbon-data-base-alt' },
      { path: '/admin/system/model-groups', label: 'Model Groups', icon: 'i-carbon-machine-learning-model' },
      { path: '/admin/system/route-combos', label: 'Route Combos', icon: 'i-carbon-flow-data' },
      { path: '/admin/system/routing-policy', label: 'Routing Policy', icon: 'i-carbon-settings-check' },
      { path: '/admin/system/routing-metrics', label: 'Routing Metrics', icon: 'i-carbon-chart-line' },
      { path: '/admin/system/pilot-settings', label: '管理总览', icon: 'i-carbon-dashboard' },
    ],
  },
]

function isActive(path: string): boolean {
  if (path === '/admin') {
    return route.path === '/admin'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<template>
  <aside class="AdminSideNav">
    <div class="AdminSideNav-Brand">
      <img src="/logo.png" alt="Pilot">
      <div>
        <strong>Pilot Admin</strong>
        <p>Legacy CMS 已迁移</p>
      </div>
    </div>

    <el-scrollbar class="AdminSideNav-Scroll">
      <div class="AdminSideNav-Inner">
        <section v-for="group in groups" :key="group.title" class="AdminSideNav-Group">
          <p class="AdminSideNav-Title">
            {{ group.title }}
          </p>
          <NuxtLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="AdminSideNav-Link"
            :class="{ 'is-active': isActive(item.path) }"
          >
            <i :class="item.icon" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </section>
      </div>
    </el-scrollbar>
  </aside>
</template>

<style scoped lang="scss">
.AdminSideNav {
  width: 280px;
  min-width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color);
}

.AdminSideNav-Brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  img {
    width: 32px;
    height: 32px;
  }

  strong {
    font-size: 14px;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.AdminSideNav-Scroll {
  flex: 1;
  min-height: 0;
}

:deep(.AdminSideNav-Scroll .el-scrollbar__wrap) {
  overflow-x: hidden;
}

.AdminSideNav-Inner {
  padding: 12px;
}

.AdminSideNav-Group + .AdminSideNav-Group {
  margin-top: 14px;
}

.AdminSideNav-Title {
  margin: 0 0 8px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.AdminSideNav-Link {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  transition: 0.2s;

  &:hover {
    background-color: var(--el-fill-color-light);
  }

  &.is-active {
    background-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
    color: var(--el-color-primary);
  }
}
</style>
