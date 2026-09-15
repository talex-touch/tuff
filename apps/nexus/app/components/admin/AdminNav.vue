<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

/**
 * The rail for the administrator console (`layouts/admin.vue`).
 *
 * This is the "管理员" group that used to be the third section of
 * `DashboardNav`, lifted out with its pages: the console is a separate shell
 * with its own route namespace (`/admin/*`) because its screens are tables that
 * needed the full viewport, not the centred account column.
 *
 * It reads `useAccountRole()` rather than installing its own profile fetch:
 * every page here declares `requiresAuth`, and `app.vue` fetches `auth-user`
 * for exactly those routes. `mounted` keeps the SSR markup and the first client
 * tick identical, since the server has no role payload — the same reason
 * `DashboardNav` waits for it.
 */
const { t } = useI18n()
const route = useRoute()
const runtimeConfig = useRuntimeConfig()

const { isAdmin: isAccountAdmin } = useAccountRole()
const mounted = ref(false)
const isAdmin = computed(() => mounted.value && isAccountAdmin.value)
const riskControlEnabled = computed(() => isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled))

/**
 * Console `id → href` table. Every id that can also be a route segment appears
 * in `activeSection` below; `AdminNav.routing.test.ts` cross-checks this table
 * against the files in `app/pages/admin/`.
 */
const sectionPaths: Record<string, string> = {
  updates: '/admin/updates',
  intelligence: '/admin/intelligence',
  'intelligence-overview': '/admin/intelligence-overview',
  'intelligence-chat': '/admin/intelligence-chat',
  'intelligence-audits': '/admin/intelligence-audits',
  'provider-registry': '/admin/provider-registry',
  governance: '/admin/governance',
  risk: '/admin/risk',
  images: '/admin/images',
  users: '/admin/users',
  subscriptions: '/admin/subscriptions',
  audits: '/admin/audits',
  reviews: '/admin/reviews',
  'doc-comments': '/admin/doc-comments',
  analytics: '/admin/analytics',
}

interface NavItem {
  id: string
  label: string
  icon: string
  to: string
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

function mapItems(items: Array<{ id: string, label: string, icon: string }>): NavItem[] {
  return items.map(item => ({
    ...item,
    to: sectionPaths[item.id] ?? '/admin/updates',
  }))
}

/**
 * The analytics panels, mirroring `analyticsSections` in
 * `app/pages/admin/analytics.vue`. The labels are English there because that
 * page renders them untranslated; the `t()` call below prefers a locale entry
 * and falls back to the same string, so the rail is translated even while the
 * page's own copy is not.
 *
 * `AdminNav.routing.test.ts` pins this list against the page so a panel added
 * to one and not the other fails instead of silently going unnavigable.
 */
const ANALYTICS_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'i-carbon-dashboard' },
  { id: 'performance', label: 'Performance', icon: 'i-carbon-meter' },
  { id: 'search', label: 'Search', icon: 'i-carbon-search' },
  { id: 'usage', label: 'Usage', icon: 'i-carbon-chart-line-smooth' },
  { id: 'intelligence', label: 'Intelligence', icon: 'i-carbon-ai-status' },
  { id: 'docs', label: 'Docs', icon: 'i-carbon-document' },
  { id: 'geo', label: 'Geo', icon: 'i-carbon-earth-americas' },
  { id: 'exchange', label: 'Exchange', icon: 'i-carbon-currency' },
  { id: 'messages', label: 'Alerts', icon: 'i-carbon-warning' },
] as const

/**
 * The rail is the console's only navigation surface: every destination is one
 * entry, and nothing is reachable solely through an in-page tab strip.
 *
 * Before this, four screens hid behind tabs — Intelligence carried Tuff AI,
 * overview, service channels and audits; Users and Subscriptions shared one
 * strip, as did the two comment queues. That meant two different controls for
 * the same kind of move (rail for some destinations, tabs for others) and made
 * the hidden ones unlinkable and invisible to anyone reading the rail.
 *
 * The groups are what keeps a flat list of thirteen legible. They are labels
 * only — no collapsing, no state — because a console rail that hides its own
 * entries reintroduces exactly the problem the tabs had.
 */
const menuGroups = computed<NavGroup[]>(() => {
  if (!isAdmin.value)
    return []

  const groups: NavGroup[] = [
    {
      id: 'content',
      label: t('dashboard.sections.menu.groups.content', '内容'),
      items: mapItems([
        {
          id: 'updates',
          label: t('dashboard.sections.menu.updates'),
          icon: 'i-carbon-notification',
        },
        {
          id: 'images',
          label: t('dashboard.sections.menu.images', 'Resources'),
          icon: 'i-carbon-image',
        },
        {
          id: 'reviews',
          label: t('dashboard.sections.menu.reviews', 'Review Moderation'),
          icon: 'i-carbon-chat',
        },
        {
          id: 'doc-comments',
          label: t('dashboard.sections.menu.docComments', 'Doc Comments'),
          icon: 'i-carbon-annotation-visibility',
        },
      ]),
    },
    {
      id: 'intelligence',
      label: t('dashboard.sections.menu.intelligence', '实验场'),
      items: mapItems([
        {
          id: 'intelligence',
          label: t('dashboard.sections.menu.intelligenceLab', 'Tuff AI'),
          icon: 'i-carbon-machine-learning',
        },
        {
          id: 'intelligence-overview',
          label: t('dashboard.sections.menu.intelligenceOverview', '概览'),
          icon: 'i-carbon-dashboard',
        },
        {
          id: 'intelligence-chat',
          label: t('dashboard.sections.menu.intelligenceChat', '对话探针'),
          icon: 'i-carbon-chat-bot',
        },
        {
          id: 'provider-registry',
          label: t('dashboard.sections.menu.providerRegistry', 'Provider Registry'),
          icon: 'i-carbon-cloud-service-management',
        },
        {
          id: 'intelligence-audits',
          label: t('dashboard.sections.menu.intelligenceAudits', 'AI 调用审计'),
          icon: 'i-carbon-document',
        },
      ]),
    },
    {
      id: 'accounts',
      label: t('dashboard.sections.menu.accounts', 'Account Management'),
      items: mapItems([
        {
          id: 'users',
          label: t('dashboard.sections.menu.users', 'User Management'),
          icon: 'i-carbon-user-avatar',
        },
        {
          id: 'subscriptions',
          label: t('dashboard.sections.menu.subscriptions', 'Subscription Management'),
          icon: 'i-carbon-license',
        },
      ]),
    },
    {
      id: 'analytics',
      label: t('dashboard.sections.menu.analytics', 'Analytics'),
      // The nine analytics panels. They address themselves with `?section=`
      // rather than nine routes because they are one page's worth of state on
      // one payload — `analytics.vue` loads its data once and switches panels
      // over it, so nine files would be nine copies of the same fetch.
      items: ANALYTICS_SECTIONS.map(section => ({
        id: `analytics:${section.id}`,
        label: t(`dashboard.sections.analytics.sections.${section.id}`, section.label),
        icon: section.icon,
        to: `/admin/analytics?section=${section.id}`,
      })),
    },
    {
      id: 'operations',
      label: t('dashboard.sections.menu.groups.operations', '运营'),
      items: mapItems([
        {
          id: 'governance',
          label: t('dashboard.sections.menu.governance', 'Data Governance'),
          icon: 'i-carbon-data-vis-4',
        },
        {
          id: 'audits',
          label: t('dashboard.sections.menu.adminAudits', '管理操作审计'),
          icon: 'i-carbon-list',
        },
      ]),
    },
  ]

  if (riskControlEnabled.value) {
    groups
      .find(group => group.id === 'operations')
      ?.items.push(...mapItems([
        {
          id: 'risk',
          label: t('dashboard.sections.menu.risk', '风控控制面'),
          icon: 'i-carbon-warning-alt',
        },
      ]))
  }

  return groups
})

const menuItems = computed(() => menuGroups.value.flatMap(group => group.items))

/**
 * Below `lg` the shell stacks, so this rail would sit above the page — a
 * disclosure showing where you are is what the dashboard does with the same
 * problem, and the markup agrees with it so the two consoles read as one
 * product. Forced open from `lg` up, where the summary is hidden.
 */
const isDesktop = ref(false)
let desktopQuery: MediaQueryList | null = null
const syncDesktop = (event: MediaQueryList | MediaQueryListEvent) => {
  isDesktop.value = event.matches
}

onMounted(() => {
  mounted.value = true
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  syncDesktop(desktopQuery)
  desktopQuery.addEventListener('change', syncDesktop)
})

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', syncDesktop)
  desktopQuery = null
})

/**
 * An ordered if-chain. Two things make the order load-bearing:
 *
 * - Longer prefixes first. `/admin/intelligence-overview` and
 *   `/admin/intelligence-audits` both start with `/admin/intelligence`, so a
 *   generic match on the short one would swallow them.
 * - Redirect sources light their destination: `…/codes` forwards to
 *   subscriptions and `…/credits` to users, so they highlight those entries
 *   during the hop rather than flashing the wrong one.
 *
 * Users/subscriptions and the two comment queues each used to collapse onto a
 * single entry because they shared a tab strip; they are separate rail entries
 * now, so they light themselves. Reordering this is silent, which is why the
 * routing test pins the whole map.
 */
const activeSection = computed(() => {
  if (route.path.startsWith('/admin/intelligence-overview'))
    return 'intelligence-overview'
  if (route.path.startsWith('/admin/intelligence-chat'))
    return 'intelligence-chat'
  if (route.path.startsWith('/admin/intelligence-audits'))
    return 'intelligence-audits'
  if (route.path.startsWith('/admin/intelligence-agent'))
    return 'intelligence'
  if (route.path.startsWith('/admin/intelligence-lab'))
    return 'intelligence'
  if (route.path.startsWith('/admin/intelligence'))
    return 'intelligence'
  if (route.path.startsWith('/admin/provider-registry'))
    return 'provider-registry'
  if (route.path.startsWith('/admin/doc-comments'))
    return 'doc-comments'
  if (route.path.startsWith('/admin/reviews'))
    return 'reviews'
  if (route.path.startsWith('/admin/subscriptions'))
    return 'subscriptions'
  if (route.path.startsWith('/admin/codes'))
    return 'subscriptions'
  if (route.path.startsWith('/admin/credits'))
    return 'users'
  if (route.path.startsWith('/admin/users'))
    return 'users'
  if (route.path.startsWith('/admin/audits'))
    return 'audits'
  if (route.path.startsWith('/admin/analytics')) {
    // The analytics entries are one route with nine `?section=` addresses, so
    // the query — not the path — decides which of them is lit. A bare
    // `/admin/analytics` is the overview, matching the page's own default.
    const section = typeof route.query.section === 'string' ? route.query.section : ''
    const known = ANALYTICS_SECTIONS.some(entry => entry.id === section)
    return `analytics:${known ? section : 'overview'}`
  }
  if (route.path.startsWith('/admin/governance'))
    return 'governance'
  if (route.path.startsWith('/admin/risk'))
    return 'risk'

  const segments = route.path.split('/').filter(Boolean)
  const section = segments[1] ?? 'updates'
  if (sectionPaths[section])
    return section
  return 'updates'
})

const activeLabel = computed(() => {
  return menuItems.value.find(item => item.id === activeSection.value)?.label
    ?? t('dashboard.sections.menu.adminTitle', '管理员')
})

/**
 * Same contract as the dashboard rail: the console owns the default tab title,
 * and a page that needs something more specific still wins because its own
 * `useHead` registers after this one.
 */
useHead(() => ({
  title: `${activeLabel.value} · Tuff Nexus`,
}))
</script>

<template>
  <details
    :open="isDesktop"
    class="admin-nav shrink-0 border-black/[0.04] border-solid dark:border-white/[0.06] lg:h-full lg:w-56 lg:self-stretch lg:overflow-y-auto lg:border-r xl:w-60"
  >
    <summary class="admin-nav-summary">
      <span class="min-w-0 flex items-center gap-2">
        <span class="i-carbon-menu text-[15px]" aria-hidden="true" />
        <span class="truncate">{{ activeLabel }}</span>
      </span>
      <span class="admin-nav-summary-chevron i-carbon-chevron-down text-[15px]" aria-hidden="true" />
    </summary>
    <nav class="relative p-4 space-y-5" aria-label="Admin console sections">
      <section v-for="group in menuGroups" :key="group.id">
        <p class="admin-nav-section-title mb-2 px-3">
          {{ group.label }}
        </p>
        <ul class="flex flex-col list-none gap-1 p-0 text-sm" role="listbox" :aria-label="group.label">
          <li v-for="item in group.items" :key="item.id">
            <NuxtLink
              :to="item.to"
              class="admin-nav-link group w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left no-underline transition-all duration-200"
              :class="activeSection === item.id ? 'admin-nav-link--active' : ''"
              role="option"
              :aria-selected="activeSection === item.id"
            >
              <span class="min-w-0 flex items-center gap-3">
                <span :class="['admin-nav-icon text-[15px]', item.icon]" aria-hidden="true" />
                <span class="truncate" :title="item.label">{{ item.label }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </nav>
  </details>
</template>

<style scoped>
/* Collapsed only below `lg`; the media query forces it open above that. */
.admin-nav-summary {
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

.admin-nav-summary::-webkit-details-marker {
  display: none;
}

.admin-nav-summary:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tx-color-primary, #1BB5F4) 60%, transparent);
  outline-offset: 2px;
}

.admin-nav[open] .admin-nav-summary-chevron {
  transform: rotate(180deg);
}

.admin-nav-summary-chevron {
  transition: transform 0.2s ease;
}

@media (min-width: 1024px) {
  .admin-nav-summary {
    display: none;
  }
}

.admin-nav-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.45));
  opacity: 0.75;
}

.admin-nav-link {
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.55));
}

.admin-nav-icon {
  color: var(--tx-text-color-secondary, rgba(0, 0, 0, 0.45));
  transition: color 0.2s;
}

.admin-nav-link:hover,
.admin-nav-link:focus-visible {
  color: var(--tx-text-color-primary, #000);
  background: rgba(0, 0, 0, 0.03);
}

:root.dark .admin-nav-link:hover,
:root.dark .admin-nav-link:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}

/* Neutral active pill, matching the dashboard rail; the accent stays on the icon. */
.admin-nav-link--active,
.admin-nav-link--active:hover,
.admin-nav-link--active:focus-visible {
  color: var(--tx-text-color-primary, #000);
  background: rgba(0, 0, 0, 0.05);
  font-weight: 600;
}

:root.dark .admin-nav-link--active,
:root.dark .admin-nav-link--active:hover {
  background: rgba(255, 255, 255, 0.07);
}

.admin-nav-link--active .admin-nav-icon {
  color: var(--tx-color-primary, #1BB5F4);
}
</style>