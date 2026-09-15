<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { requestJson, useTypedFetch } from '~/utils/request'

const { t } = useI18n()
const route = useRoute()
const { user, refresh, isAuthenticated } = useAuthUser()
const notificationUnreadCount = useState<number>('dashboard-notification-unread-count', () => 0)
const mounted = ref(false)
const { data: teamData, refresh: refreshTeamData } = useTypedFetch<{
  team?: {
    type?: string
    role?: string
  }
}>('/api/dashboard/team', {
  immediate: false,
  server: false,
})

const revalidateUser = () => {
  if (!isAuthenticated.value)
    return
  void refresh()
}

const revalidateTeam = () => {
  if (!mounted.value || !isAuthenticated.value)
    return
  void refreshTeamData()
}

function setNotificationUnreadCount(value: unknown) {
  const count = Number(value)
  notificationUnreadCount.value = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

async function refreshNotificationUnreadCount() {
  if (!import.meta.client || !mounted.value)
    return
  if (!isAuthenticated.value) {
    setNotificationUnreadCount(0)
    return
  }

  try {
    const data = await requestJson<{ unreadCount?: unknown }>('/api/dashboard/notifications/inbox', {
      query: {
        status: 'unread',
        limit: 1,
      },
    })
    setNotificationUnreadCount(data.unreadCount)
  }
  catch {
    // The notifications page surfaces full inbox errors.
  }
}

onMounted(() => {
  mounted.value = true
  revalidateUser()
  revalidateTeam()
  void refreshNotificationUnreadCount()
})

watch(
  () => route.path,
  (path) => {
    if (!user.value)
      revalidateUser()
    if (path.startsWith('/dashboard/team') || path.startsWith('/dashboard/oauth'))
      revalidateTeam()
    if (path.startsWith('/dashboard'))
      void refreshNotificationUnreadCount()
  },
)

watch(
  () => isAuthenticated.value,
  (authed) => {
    if (authed) {
      revalidateTeam()
      void refreshNotificationUnreadCount()
    }
    else {
      setNotificationUnreadCount(0)
    }
  },
  { immediate: true },
)

/**
 * Both gates wait for `mounted`: the OAuth entry is absent from the SSR markup
 * (no user payload there), so rendering it on the first client tick would be a
 * hydration mismatch.
 */
const { isAdmin: isAccountAdmin } = useAccountRole()
const { isTeamAdmin: isTeamAdminRole } = useTeamRole(() => teamData.value?.team)

const isAdmin = computed(() => mounted.value && isAccountAdmin.value)
const isTeamAdmin = computed(() => mounted.value && isTeamAdminRole.value)
const canManageOauthApps = computed(() => isAdmin.value || isTeamAdmin.value)
const notificationUnreadBadgeText = computed(() => notificationUnreadCount.value > 99 ? '99+' : String(notificationUnreadCount.value))
const notificationUnreadBadgeLabel = computed(() => t('dashboard.notifications.unreadBadgeLabel', {
  count: notificationUnreadCount.value,
}))

const sectionPaths: Record<string, string> = {
  overview: '/dashboard/overview',
  assets: '/dashboard/assets',
  plugins: '/dashboard/assets',
  team: '/dashboard/team',
  'api-keys': '/dashboard/api-keys',
  oauth: '/dashboard/oauth',
  privacy: '/dashboard/privacy',
  account: '/dashboard/account',
  devices: '/dashboard/devices',
  storage: '/dashboard/storage',
  notifications: '/dashboard/notifications',
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
]))

const accountMenuItems = computed(() => {
  const items: Array<{ id: string, label: string, icon: string }> = [
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
      id: 'storage',
      label: t('dashboard.sections.menu.storage', 'Storage & Sync'),
      icon: 'i-carbon-data-base-alt',
    },
    {
      id: 'notifications',
      label: t('dashboard.sections.menu.notifications', 'Notifications'),
      icon: 'i-carbon-notification',
    },
    {
      id: 'privacy',
      label: t('dashboard.sections.menu.privacy', '隐私设置'),
      icon: 'i-carbon-security',
    },
  ]

  if (canManageOauthApps.value) {
    items.splice(2, 0, {
      id: 'oauth',
      label: t('dashboard.sections.menu.oauth', 'OAuth Apps'),
      icon: 'i-carbon-application',
    })
  }

  return mapItems(items)
})

/**
 * Below `lg` the dashboard shell drops to one column, so this whole nav used to
 * stack above the page: ~270px of links to scroll past before the heading, on
 * every dashboard route. The header's hamburger is the site nav and carries
 * none of these destinations, so hiding it was not an option — it collapses to
 * a disclosure showing where you are instead. Forced open from `lg` up, where
 * the summary is hidden and the markup is exactly what it always was.
 */
const isDesktop = ref(false)
let desktopQuery: MediaQueryList | null = null
const syncDesktop = (event: MediaQueryList | MediaQueryListEvent) => {
  isDesktop.value = event.matches
}

onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  syncDesktop(desktopQuery)
  desktopQuery.addEventListener('change', syncDesktop)
})

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', syncDesktop)
  desktopQuery = null
})

const activeLabel = computed(() => {
  const all = [...workspaceMenuItems.value, ...accountMenuItems.value]
  return all.find(item => item.id === activeSection.value)?.label
    ?? t('dashboard.sections.menu.workspaceTitle', '工作台')
})

const activeSection = computed(() => {
  if (route.path.startsWith('/dashboard/account'))
    return 'account'
  if (route.path.startsWith('/dashboard/oauth'))
    return 'oauth'
  if (route.path.startsWith('/dashboard/api-keys'))
    return 'api-keys'
  if (route.path.startsWith('/dashboard/devices'))
    return 'devices'
  if (route.path.startsWith('/dashboard/storage'))
    return 'storage'
  if (route.path.startsWith('/dashboard/notifications'))
    return 'notifications'
  if (route.path.startsWith('/dashboard/assets') || route.path.startsWith('/dashboard/plugins'))
    return 'assets'
  const segments = route.path.split('/').filter(Boolean)
  const section = segments[1] ?? 'overview'
  if (sectionPaths[section])
    return section
  return 'overview'
})

/**
 * Every dashboard route used to render `document.title` as `Tuff Docs` — the
 * global `appName` default from app.vue, i.e. the docs site's name on the admin
 * console. Deriving it from `activeLabel` rather than from a second table is
 * what keeps the tab title and the highlighted menu entry from drifting apart:
 * they are the same string. Pages that need something more specific still win,
 * because their own `useHead` registers after this one.
 */
useHead(() => ({
  title: `${activeLabel.value} · Tuff Nexus`,
}))
</script>

<template>
  <details :open="isDesktop" class="dashboard-nav sticky top-24 max-h-[calc(100vh-6rem)] self-start overflow-y-auto pr-1 space-y-6">
    <summary class="dashboard-nav-summary">
      <span class="min-w-0 flex items-center gap-2">
        <span class="i-carbon-menu text-[15px]" aria-hidden="true" />
        <span class="truncate">{{ activeLabel }}</span>
      </span>
      <span class="dashboard-nav-summary-chevron i-carbon-chevron-down text-[15px]" aria-hidden="true" />
    </summary>
    <nav class="relative p-4" aria-label="Dashboard workspace sections">
      <p class="dashboard-nav-section-title mb-4 px-3">
        {{ t('dashboard.sections.menu.workspaceTitle', '工作台') }}
      </p>
      <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" aria-label="Dashboard workspace panels">
        <li v-for="item in workspaceMenuItems" :key="item.id">
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="min-w-0 flex items-center gap-3">
              <span :class="['dashboard-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
              <span class="truncate" :title="item.label">{{ item.label }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="mx-4 border-t border-black/[0.04] dark:border-white/[0.06]" />

    <nav class="relative p-4 pt-0" aria-label="Account settings">
      <p class="dashboard-nav-section-title mb-4 px-3">
        {{ t('dashboard.sections.menu.accountTitle', '账户') }}
      </p>
      <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" aria-label="Account panels">
        <li v-for="item in accountMenuItems" :key="item.id">
          <NuxtLink
            :to="item.to"
            class="dashboard-nav-link group w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
            :class="activeSection === item.id ? 'dashboard-nav-link--active' : ''"
            role="option"
            :aria-selected="activeSection === item.id"
          >
            <span class="min-w-0 flex items-center gap-3">
              <span :class="['dashboard-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
              <span class="truncate" :title="item.label">{{ item.label }}</span>
            </span>
            <span
              v-if="item.id === 'notifications' && notificationUnreadCount > 0"
              class="dashboard-nav-unread-badge"
              :aria-label="notificationUnreadBadgeLabel"
            >
              {{ notificationUnreadBadgeText }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </details>
</template>

<style scoped>
/* Collapsed only below `lg`; the media query forces it open above that so the
   desktop layout is byte-for-byte what it was. */
.dashboard-nav-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  list-style: none;
  color: var(--tx-text-color-primary, #000);
}

.dashboard-nav-summary::-webkit-details-marker {
  display: none;
}

.dashboard-nav-summary:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tx-color-primary, #1BB5F4) 60%, transparent);
  outline-offset: 2px;
}

.dashboard-nav[open] .dashboard-nav-summary-chevron {
  transform: rotate(180deg);
}

.dashboard-nav-summary-chevron {
  transition: transform 0.2s ease;
}

@media (min-width: 1024px) {
  .dashboard-nav-summary {
    display: none;
  }
}

.dashboard-nav-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.45));
  opacity: 0.75;
}

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

/**
 * The active row is a neutral pill, not a tinted one: with three groups open at
 * once a coloured fill on the selected row competed with the status colours in
 * the panel beside it. The accent survives on the icon alone.
 */
.dashboard-nav-link--active,
.dashboard-nav-link--active:hover,
.dashboard-nav-link--active:focus-visible {
  color: var(--tx-text-color-primary, #000);
  background: rgba(0, 0, 0, 0.05);
  font-weight: 600;
}

:root.dark .dashboard-nav-link--active,
:root.dark .dashboard-nav-link--active:hover {
  background: rgba(255, 255, 255, 0.07);
}

.dashboard-nav-link--active .dashboard-nav-icon {
  color: var(--tx-color-primary, #1BB5F4);
}

.dashboard-nav-unread-badge {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--tx-color-primary, #1BB5F4);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1;
}
</style>
