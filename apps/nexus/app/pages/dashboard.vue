<script setup lang="ts">
import { RedirectToSignIn, SignedIn, SignedOut } from '@clerk/nuxt/components'
import { computed } from 'vue'

definePageMeta({
  layout: 'dashboard',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()
const redirectUrl = computed(() => route.fullPath)

const { user } = useUser()

const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

const sectionPaths: Record<string, string> = {
  'overview': '/dashboard/overview',
  'plugins': '/dashboard/plugins',
  'team': '/dashboard/team',
  'api-keys': '/dashboard/api-keys',
  'updates': '/dashboard/updates',
  'images': '/dashboard/images',
  'codes': '/dashboard/admin/codes',
  'analytics': '/dashboard/admin/analytics',
  'privacy': '/dashboard/privacy',
}

const menuItems = computed(() => {
  const items = [
    {
      id: 'overview',
      label: t('dashboard.sections.menu.overview'),
      section: 'main',
    },
    {
      id: 'plugins',
      label: t('dashboard.sections.menu.plugins'),
      section: 'main',
    },
    {
      id: 'team',
      label: t('dashboard.sections.menu.team'),
      section: 'main',
    },
    {
      id: 'api-keys',
      label: t('dashboard.sections.menu.apiKeys', 'API Keys'),
      section: 'main',
    },
  ]

  if (isAdmin.value) {
    items.push({
      id: 'updates',
      label: t('dashboard.sections.menu.updates'),
      section: 'main',
    })
    items.push({
      id: 'images',
      label: t('dashboard.sections.menu.images', 'Resources'),
      section: 'main',
    })
    items.push({
      id: 'codes',
      label: t('dashboard.sections.menu.codes', 'Activation Codes'),
      section: 'main',
    })
    items.push({
      id: 'analytics',
      label: t('dashboard.sections.menu.analytics', 'Analytics'),
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
  if (route.path.startsWith('/dashboard/admin/analytics'))
    return 'analytics'
  const segments = route.path.split('/').filter(Boolean)
  const section = segments[1] ?? 'overview'
  if (sectionPaths[section])
    return section
  return 'overview'
})
</script>

<template>
  <div class="relative">
    <SignedIn>
      <section class="grid gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
        <aside class="sticky top-24 space-y-6">
          <nav
            class="relative border border-primary/10 rounded-3xl bg-white/80 p-5 dark:border-light/10 dark:bg-dark/70"
            aria-label="Dashboard sections"
          >
            <p class="text-sm text-black/70 font-semibold tracking-wide uppercase dark:text-light/80">
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
                  class="group w-full flex items-center justify-between rounded-2xl px-3 py-2 text-left text-black/75 no-underline transition hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
                  :class="activeSection === item.id ? 'bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
                  role="option"
                  :aria-selected="activeSection === item.id"
                >
                  <span>{{ item.label }}</span>
                  <span class="i-carbon-arrow-right text-base opacity-20 transition duration-200 group-hover:translate-x-0.5 group-hover:opacity-70" />
                </NuxtLink>
              </li>
            </ul>
          </nav>

          <!-- Account Menu -->
          <nav
            class="relative border border-primary/10 rounded-3xl bg-white/80 p-5 dark:border-light/10 dark:bg-dark/70"
            aria-label="Account settings"
          >
            <p class="text-sm text-black/70 font-semibold tracking-wide uppercase dark:text-light/80">
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
                  class="group w-full flex items-center justify-between rounded-2xl px-3 py-2 text-left text-black/75 no-underline transition hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
                  :class="activeSection === item.id ? 'bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
                  role="option"
                  :aria-selected="activeSection === item.id"
                >
                  <span class="flex items-center gap-2">
                    <span :class="item.icon" class="text-base opacity-60" />
                    {{ item.label }}
                  </span>
                  <span class="i-carbon-arrow-right text-base opacity-20 transition duration-200 group-hover:translate-x-0.5 group-hover:opacity-70" />
                </NuxtLink>
              </li>
            </ul>
          </nav>
        </aside>

        <div class="space-y-8">
          <NuxtPage />
        </div>
      </section>
    </SignedIn>
    <SignedOut>
      <RedirectToSignIn :redirect-url="redirectUrl" />
    </SignedOut>
  </div>
</template>
