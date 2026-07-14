<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { sanitizeRedirect } from '~/composables/useOauthContext'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'

withDefaults(defineProps<{
  title?: string
}>(), {
  title: 'Tuff',
})

const HeaderUserMenu = defineAsyncComponent(() => import('./HeaderUserMenu.vue'))

const route = useRoute()
const { status } = useNexusAuth()

const scrolled = ref(false)
const { locale, t } = useI18n()
const docsLink = (path: string) => toLocalizedDocsPath(path, locale.value === 'zh' ? 'zh' : 'en')

function handleScroll() {
  scrolled.value = window.scrollY > 8
}

const links = computed(() => [
  { to: '/store', label: t('nav.store') },
  { to: docsLink('/docs/guide/start'), label: t('nav.tutorial') },
  { to: docsLink('/docs'), label: t('nav.doc') },
  // { to: '/#developer', label: t('nav.developer') },
  { to: '/updates', label: t('nav.download') },
  // { to: '/#blog', label: t('nav.blog') },
  // { to: '/pricing', label: t('nav.pricing') },
])

const fullPath = computed(() => route.fullPath || '/')
const authRedirectTarget = computed(() => {
  return sanitizeRedirect(fullPath.value, '/dashboard')
})

const signInRoute = computed(() => ({
  path: '/sign-in',
  query: {
    redirect_url: authRedirectTarget.value,
  },
}))

const isAuthenticated = computed(() => status.value === 'authenticated')

const currentPath = computed(() => route.path || '/')
const normalizedPath = computed(() => {
  const path = currentPath.value
  const trimmed = path.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
})

const isDocs = computed(() => normalizedPath.value.startsWith('/docs'))
const isHome = computed(() => normalizedPath.value === '/')

function isActiveLink(link: { to: string }) {
  const path = normalizedPath.value
  const matches = (item: { to: string }) => {
    if (item.to === '/')
      return path === '/'
    return path === item.to || path.startsWith(`${item.to}/`)
  }

  if (!matches(link))
    return false

  const bestMatch = links.value.reduce<{ to: string } | null>((best, item) => {
    if (!matches(item))
      return best
    if (!best || item.to.length > best.to.length)
      return item
    return best
  }, null)

  return bestMatch?.to === link.to
}

onMounted(() => {
  handleScroll()
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <header
    class="TuffHeader"
    data-role="main-header"
  >
    <div
      class="TuffHeader-Main mx-auto flex flex-wrap items-center justify-between gap-4 border-1 border-transparent border-solid px-4 py-2 sm:flex-nowrap"
      :class="{
        'TuffHeader-Main--scrolled': scrolled,
      }"
    >
      <NuxtLink
        to="/"
        class="TuffHeader-Brand flex items-center gap-1 text-black font-semibold tracking-tight no-underline dark:text-light"
      >
        <IconComposer />
      </NuxtLink>

      <nav class="TuffHeader-Nav flex flex-1 items-center justify-between gap-2 overflow-hidden text-sm">
        <div class="TuffHeader-NavLinks ml-auto flex items-center gap-1 sm:gap-2">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-full px-2.5 py-1 text-black/65 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
            :class="isActiveLink(link) ? 'bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
          >
            {{ link.label }}
          </NuxtLink>
        </div>

        <HeaderControls
          :show-search-button="isDocs || isHome"
          :show-language-toggle="!isAuthenticated"
          :show-dark-toggle="!isHome && !isAuthenticated"
          :github-url="isHome ? 'https://github.com/talex-touch/tuff' : ''"
        />

        <div v-if="isHome" class="header-auth-divider" />

        <div class="TuffHeader-Auth flex shrink-0 items-center gap-2 sm:gap-3">
          <template v-if="!isAuthenticated">
            <NuxtLink
              :to="signInRoute"
              class="shrink-0 whitespace-nowrap border border-primary/20 rounded-full bg-transparent px-3 py-1 text-sm text-black font-medium leading-none transition dark:border-light/15 hover:border-primary/40 hover:bg-dark/5 dark:text-light dark:hover:bg-light/10"
            >
              {{ t('nav.login') }}
            </NuxtLink>
          </template>
          <template v-else>
            <HeaderUserMenu />
          </template>
        </div>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.TuffHeader {
  z-index: 10000;
  position: fixed;

  top: 0;
  left: 0;

  width: 100%;
  height: 64px;
}

.TuffHeader-Main {
  --header-border-color: transparent;
  --header-bg-color: transparent;
  --header-shadow: 0 0 0 rgba(0, 0, 0, 0);
  --header-backdrop-filter: blur(18px) saturate(180%);

  position: absolute;

  top: 1rem;
  left: 50%;

  width: min(1056px, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);

  border-radius: 24px;
  border-color: var(--header-border-color);
  background-color: var(--header-bg-color);
  box-shadow: var(--header-shadow);
  transition:
    width 720ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 620ms cubic-bezier(0.4, 0, 0.2, 1),
    background-color 620ms cubic-bezier(0.4, 0, 0.2, 1),
    backdrop-filter 620ms cubic-bezier(0.4, 0, 0.2, 1),
    -webkit-backdrop-filter 620ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 720ms cubic-bezier(0.4, 0, 0.2, 1);

  isolation: isolate;
  overflow: hidden;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  animation: tuff-header-quick-reveal 350ms cubic-bezier(0.7, 0, 1, 1) backwards;
}

.TuffHeader-Main {
  transform: translate3d(calc(-50% + var(--wm-jitter-x1, 0px)), var(--wm-jitter-y1, 0px), 0);
}

.TuffHeader-Main--scrolled {
  width: min(840px, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  border-color: rgba(0, 0, 0, 0.1);
  background-color: rgba(255, 255, 255, 0.58);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%)) !important;
  -webkit-backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%)) !important;
}

.dark .TuffHeader-Main--scrolled {
  border-color: rgba(255, 255, 255, 0.12);
  background-color: rgba(8, 10, 12, 0.58);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
}

.TuffHeader-Brand,
.TuffHeader-Nav,
.TuffHeader-NavLinks,
.TuffHeader-Auth {
  min-width: 0;
}

nav :deep(a) {
  letter-spacing: var(--wm-letter-space-1, 0px);
}

.header-auth-divider {
  width: 1px;
  height: 28px;
  background: rgba(0, 0, 0, 0.12);
}

.dark .header-auth-divider {
  background: rgba(255, 255, 255, 0.12);
}

@keyframes tuff-header-quick-reveal {
  from {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .TuffHeader-Main {
    animation: none;
  }
}

@media (max-width: 768px) {
  .TuffHeader-Main {
    left: 1rem;
    right: 1rem;
    width: auto;
    max-width: none;
    transform: translate3d(var(--wm-jitter-x1, 0px), var(--wm-jitter-y1, 0px), 0);
  }

  .TuffHeader-Main--scrolled {
    width: auto;
    max-width: none;
  }

  nav {
    justify-content: flex-end;
  }

  nav > div:first-child {
    display: none;
  }
}
</style>
