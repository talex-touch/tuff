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

const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

const sectionPaths: Record<string, string> = {
  'overview': '/dashboard/overview',
  'plugins': '/dashboard/plugins',
  'team': '/dashboard/team',
  'api-keys': '/dashboard/api-keys',
  'credits': '/dashboard/credits',
  'updates': '/dashboard/updates',
  'releases': '/dashboard/releases',
  'images': '/dashboard/images',
  'codes': '/dashboard/admin/codes',
  'reviews': '/dashboard/admin/reviews',
  'analytics': '/dashboard/admin/analytics',
  'privacy': '/dashboard/privacy',
  'account': '/dashboard/account',
  'devices': '/dashboard/devices',
}

const menuItems = computed(() => {
  const items = [
    {
      id: 'overview',
      label: t('dashboard.sections.menu.overview'),
      icon: 'i-carbon-dashboard',
      section: 'main',
    },
    {
      id: 'plugins',
      label: t('dashboard.sections.menu.plugins'),
      icon: 'i-carbon-plug',
      section: 'main',
    },
    {
      id: 'team',
      label: t('dashboard.sections.menu.team'),
      icon: 'i-carbon-user-multiple',
      section: 'main',
    },
    {
      id: 'api-keys',
      label: t('dashboard.sections.menu.apiKeys', 'API Keys'),
      icon: 'i-carbon-key',
      section: 'main',
    },
    {
      id: 'credits',
      label: t('dashboard.sections.menu.credits', 'AI 积分'),
      icon: 'i-carbon-currency',
      section: 'main',
    },
  ]

  if (isAdmin.value) {
    items.push({
      id: 'updates',
      label: t('dashboard.sections.menu.updates'),
      icon: 'i-carbon-notification',
      section: 'main',
    })
    items.push({
      id: 'releases',
      label: t('dashboard.sections.menu.releases', 'Release Notes'),
      icon: 'i-carbon-document',
      section: 'main',
    })
    items.push({
      id: 'images',
      label: t('dashboard.sections.menu.images', 'Resources'),
      icon: 'i-carbon-image',
      section: 'main',
    })
    items.push({
      id: 'codes',
      label: t('dashboard.sections.menu.codes', 'Activation Codes'),
      icon: 'i-carbon-code',
      section: 'main',
    })
    items.push({
      id: 'reviews',
      label: t('dashboard.sections.menu.reviews', 'Review Moderation'),
      icon: 'i-carbon-chat',
      section: 'main',
    })
    items.push({
      id: 'analytics',
      label: t('dashboard.sections.menu.analytics', 'Analytics'),
      icon: 'i-carbon-chart-line-data',
      section: 'main',
    })
  }

  return items.map(item => ({
    ...item,
    to: sectionPaths[item.id] ?? '/dashboard/overview',
  }))
})

const accountMenuItems = computed(() => {
  return [
    {
      id: 'account',
      label: t('dashboard.sections.menu.account', '账号与安全'),
      icon: 'i-carbon-user',
    },
    {
      id: 'privacy',
      label: t('dashboard.sections.menu.privacy', '隐私设置'),
      icon: 'i-carbon-security',
    },
  ].map(item => ({
    ...item,
    to: sectionPaths[item.id] ?? '/dashboard/privacy',
  }))
})

const activeSection = computed(() => {
  if (route.path.startsWith('/dashboard/admin/codes'))
    return 'codes'
  if (route.path.startsWith('/dashboard/admin/reviews'))
    return 'reviews'
  if (route.path.startsWith('/dashboard/admin/analytics'))
    return 'analytics'
  if (route.path.startsWith('/dashboard/credits'))
    return 'credits'
  if (route.path.startsWith('/dashboard/account'))
    return 'account'
  if (route.path.startsWith('/dashboard/devices'))
    return 'devices'
  if (route.path.startsWith('/dashboard/releases'))
    return 'releases'
  const segments = route.path.split('/').filter(Boolean)
  const section = segments[1] ?? 'overview'
  if (sectionPaths[section])
    return section
  return 'overview'
})
</script>

<template>
  <aside class="dashboard-nav sticky top-24 space-y-4">
    <nav
      class="relative border border-primary/10 rounded-3xl bg-white/80 p-5 dark:border-light/10 dark:bg-dark/70"
      aria-label="Dashboard sections"
    >
      <p class="dashboard-nav-title text-sm font-semibold tracking-wide uppercase">
        {{ t('dashboard.sections.menu.title') }}
      </p>
      <ul
        class="mt-4 flex flex-col list-none gap-2 p-0 text-sm"
        role="listbox"
        aria-label="Dashboard panels"
      >
        <li
          v-for="item in menuItems"
          :key="item.id"
        >
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left no-underline transition"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="flex items-center gap-2">
              <span :class="['dashboard-nav-icon', item.icon]" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </span>
            <span class="dashboard-nav-arrow i-carbon-arrow-right text-base transition duration-200 group-hover:translate-x-0.5" />
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- Account Menu -->
    <nav
      class="relative border border-primary/10 rounded-3xl bg-white/80 p-5 dark:border-light/10 dark:bg-dark/70"
      aria-label="Account settings"
    >
      <p class="dashboard-nav-title text-sm font-semibold tracking-wide uppercase">
        {{ t('dashboard.sections.menu.accountTitle', '账户') }}
      </p>
      <ul
        class="mt-4 flex flex-col list-none gap-2 p-0 text-sm"
        role="listbox"
        aria-label="Account panels"
      >
        <li
          v-for="item in accountMenuItems"
          :key="item.id"
        >
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left no-underline transition"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="flex items-center gap-2">
              <span :class="['dashboard-nav-icon', item.icon]" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </span>
            <span class="dashboard-nav-arrow i-carbon-arrow-right text-base transition duration-200 group-hover:translate-x-0.5" />
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.dashboard-nav {
  --nav-accent: var(--tx-color-primary);
  --nav-ink: var(--tx-text-color-primary);
  --nav-muted: var(--tx-text-color-secondary);
  --nav-border: var(--tx-border-color-light, var(--tx-border-color));
  --nav-surface: var(--tx-fill-color-light);
  --nav-surface-strong: var(--tx-fill-color);
  color: var(--nav-muted);
}

.dashboard-nav-link {
  color: var(--nav-muted);
  border-color: transparent;
}

.dashboard-nav-title {
  color: var(--nav-muted);
}

.dashboard-nav-icon {
  font-size: 1rem;
  color: var(--nav-muted);
}

.dashboard-nav-arrow {
  color: var(--nav-muted);
  opacity: 0.55;
}

.dashboard-nav-link:hover,
.dashboard-nav-link:focus-visible {
  color: var(--nav-accent);
  background: var(--nav-surface);
  border-color: color-mix(in srgb, var(--nav-border) 70%, transparent);
}

.dashboard-nav-link:hover .dashboard-nav-icon,
.dashboard-nav-link:focus-visible .dashboard-nav-icon {
  color: var(--nav-accent);
}

.dashboard-nav-link:hover .dashboard-nav-arrow,
.dashboard-nav-link:focus-visible .dashboard-nav-arrow {
  color: var(--nav-accent);
  opacity: 0.75;
}

.dashboard-nav-link--active,
.dashboard-nav-link--active:hover,
.dashboard-nav-link--active:focus-visible {
  color: var(--nav-accent);
  background: var(--nav-surface-strong);
  border-color: color-mix(in srgb, var(--nav-border) 90%, transparent);
}

.dashboard-nav-link--active .dashboard-nav-icon,
.dashboard-nav-link--active:hover .dashboard-nav-icon,
.dashboard-nav-link--active:focus-visible .dashboard-nav-icon {
  color: var(--nav-accent);
}

.dashboard-nav-link--active .dashboard-nav-arrow,
.dashboard-nav-link--active:hover .dashboard-nav-arrow,
.dashboard-nav-link--active:focus-visible .dashboard-nav-arrow {
  color: var(--nav-accent);
  opacity: 0.9;
}
</style>
