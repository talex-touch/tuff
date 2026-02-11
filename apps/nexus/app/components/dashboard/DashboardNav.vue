<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

const { t } = useI18n()
const route = useRoute()
const { user, refresh, isAuthenticated } = useAuthUser()

const revalidateUser = () => {
  if (!isAuthenticated.value)
    return
  void refresh()
}

onMounted(() => {
  revalidateUser()
})

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/dashboard/admin') || !user.value)
      revalidateUser()
  },
)

const isAdmin = computed(() => String(user.value?.role || '').toLowerCase() === 'admin')

const sectionPaths: Record<string, string> = {
  overview: '/dashboard/overview',
  assets: '/dashboard/assets',
  plugins: '/dashboard/assets',
  team: '/dashboard/team',
  'api-keys': '/dashboard/api-keys',
  credits: '/dashboard/credits',
  updates: '/dashboard/updates',
  releases: '/dashboard/releases',
  images: '/dashboard/images',
  codes: '/dashboard/admin/codes',
  reviews: '/dashboard/admin/reviews',
  'doc-comments': '/dashboard/admin/doc-comments',
  analytics: '/dashboard/admin/analytics',
  privacy: '/dashboard/privacy',
  account: '/dashboard/account',
  devices: '/dashboard/devices',
}

function mapItems(items: Array<{ id: string, label: string, icon: string }>) {
  return items.map(item => ({
    ...item,
    to: sectionPaths[item.id] ?? '/dashboard/overview',
  }))
}

const workspaceMenuItems = computed(() => mapItems([
  {
    id: 'overview',
    label: t('dashboard.sections.menu.overview'),
    icon: 'i-carbon-dashboard',
  },
  {
    id: 'assets',
    label: t('dashboard.sections.menu.plugins'),
    icon: 'i-carbon-plug',
  },
  {
    id: 'team',
    label: t('dashboard.sections.menu.team'),
    icon: 'i-carbon-user-multiple',
  },
  {
    id: 'credits',
    label: t('dashboard.sections.menu.credits', 'AI 积分'),
    icon: 'i-carbon-currency',
  },
]))

const accountMenuItems = computed(() => mapItems([
  {
    id: 'account',
    label: t('dashboard.sections.menu.account', '账号与安全'),
    icon: 'i-carbon-user',
  },
  {
    id: 'api-keys',
    label: t('dashboard.sections.menu.apiKeys', 'API Keys'),
    icon: 'i-carbon-key',
  },
  {
    id: 'devices',
    label: t('dashboard.sections.menu.devices', 'Devices'),
    icon: 'i-carbon-laptop',
  },
  {
    id: 'privacy',
    label: t('dashboard.sections.menu.privacy', '隐私设置'),
    icon: 'i-carbon-security',
  },
]))

const adminMenuItems = computed(() => {
  if (!isAdmin.value) {
    return []
  }

  return mapItems([
    {
      id: 'updates',
      label: t('dashboard.sections.menu.updates'),
      icon: 'i-carbon-notification',
    },
    {
      id: 'releases',
      label: t('dashboard.sections.menu.releases', 'Release Notes'),
      icon: 'i-carbon-document',
    },
    {
      id: 'images',
      label: t('dashboard.sections.menu.images', 'Resources'),
      icon: 'i-carbon-image',
    },
    {
      id: 'codes',
      label: t('dashboard.sections.menu.codes', 'Activation Codes'),
      icon: 'i-carbon-code',
    },
    {
      id: 'reviews',
      label: t('dashboard.sections.menu.reviews', 'Review Moderation'),
      icon: 'i-carbon-chat',
    },
    {
      id: 'doc-comments',
      label: t('dashboard.sections.menu.docComments', 'Doc Comments'),
      icon: 'i-carbon-chat-launch',
    },
    {
      id: 'analytics',
      label: t('dashboard.sections.menu.analytics', 'Analytics'),
      icon: 'i-carbon-chart-line-data',
    },
  ])
})

const activeSection = computed(() => {
  if (route.path.startsWith('/dashboard/admin/codes'))
    return 'codes'
  if (route.path.startsWith('/dashboard/admin/reviews'))
    return 'reviews'
  if (route.path.startsWith('/dashboard/admin/doc-comments'))
    return 'doc-comments'
  if (route.path.startsWith('/dashboard/admin/analytics'))
    return 'analytics'
  if (route.path.startsWith('/dashboard/credits'))
    return 'credits'
  if (route.path.startsWith('/dashboard/account'))
    return 'account'
  if (route.path.startsWith('/dashboard/api-keys'))
    return 'api-keys'
  if (route.path.startsWith('/dashboard/devices'))
    return 'devices'
  if (route.path.startsWith('/dashboard/releases'))
    return 'releases'
  if (route.path.startsWith('/dashboard/assets') || route.path.startsWith('/dashboard/plugins'))
    return 'assets'
  const segments = route.path.split('/').filter(Boolean)
  const section = segments[1] ?? 'overview'
  if (sectionPaths[section])
    return section
  return 'overview'
})
</script>

<template>
  <aside class="dashboard-nav sticky top-24 space-y-6">
    <nav class="relative p-4" aria-label="Dashboard workspace sections">
      <p class="apple-section-title mb-4 px-3">
        {{ t('dashboard.sections.menu.workspaceTitle', '工作台') }}
      </p>
      <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" aria-label="Dashboard workspace panels">
        <li v-for="item in workspaceMenuItems" :key="item.id">
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="flex items-center gap-3">
              <span :class="['dashboard-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="mx-4 border-t border-black/[0.04] dark:border-white/[0.06]" />

    <nav class="relative p-4 pt-0" aria-label="Account settings">
      <p class="apple-section-title mb-4 px-3">
        {{ t('dashboard.sections.menu.accountTitle', '账户') }}
      </p>
      <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" aria-label="Account panels">
        <li v-for="item in accountMenuItems" :key="item.id">
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="flex items-center gap-3">
              <span :class="['dashboard-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <template v-if="adminMenuItems.length">
      <div class="mx-4 border-t border-black/[0.04] dark:border-white/[0.06]" />

      <nav class="relative p-4 pt-0" aria-label="Admin panels">
        <p class="apple-section-title mb-4 px-3">
          {{ t('dashboard.sections.menu.adminTitle', '管理员') }}
        </p>
        <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" aria-label="Admin panels">
          <li v-for="item in adminMenuItems" :key="item.id">
            <NuxtLink
              :to="item.to"
              class="dashboard-nav-link group w-full flex items-center rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
              :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
              role="option"
              :aria-selected="activeSection === item.id"
            >
              <span class="flex items-center gap-3">
                <span :class="['dashboard-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </template>
  </aside>
</template>

<style scoped>
.dashboard-nav-link {
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.55));
}

.dashboard-nav-icon {
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.45));
  transition: color 0.2s;
}

.dashboard-nav-link:hover,
.dashboard-nav-link:focus-visible {
  color: var(--tx-text-color-primary, #000);
  background: rgba(0, 0, 0, 0.03);
}

:root.dark .dashboard-nav-link:hover,
:root.dark .dashboard-nav-link:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}

.dashboard-nav-link--active,
.dashboard-nav-link--active:hover,
.dashboard-nav-link--active:focus-visible {
  color: var(--tx-color-primary, #1BB5F4);
  background: rgba(27, 181, 244, 0.06);
  font-weight: 500;
}

:root.dark .dashboard-nav-link--active,
:root.dark .dashboard-nav-link--active:hover {
  background: rgba(27, 181, 244, 0.1);
}

.dashboard-nav-link--active .dashboard-nav-icon {
  color: var(--tx-color-primary, #1BB5F4);
}
</style>
