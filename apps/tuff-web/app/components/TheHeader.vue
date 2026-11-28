<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  hasSessionHintCookie,
  resolveLocaleFromPath,
  sanitizeRedirectPath,
  stripLocalePrefix,
  toLocalizedDocsPath,
  toLocalizedWebPath,
} from '~/utils/web-route'

withDefaults(defineProps<{
  title?: string
}>(), {
  title: 'Tuff',
})

const LazyUiDrawer = defineAsyncComponent(() => import('~/components/ui/Drawer.vue'))

const route = useRoute()
const { t } = useI18n()

const scrolled = ref(false)
const mobileMenuOpen = ref(false)
const mobileMenuMounted = ref(false)
const hasSessionHint = ref(false)

function openMobileMenu() {
  mobileMenuMounted.value = true
  mobileMenuOpen.value = true
}

const headerLocale = computed<'en' | 'zh'>(() => resolveLocaleFromPath(route.path))
const normalizedPath = computed(() => stripLocalePrefix(route.path))
const isDocs = computed(() => normalizedPath.value === '/docs' || normalizedPath.value.startsWith('/docs/'))
const isHome = computed(() => normalizedPath.value === '/')

function handleScroll() {
  if (!hasWindow())
    return
  scrolled.value = window.scrollY > 8
}

interface HeaderNavLink {
  to: string
  label: string
  external?: boolean
}

const links = computed<HeaderNavLink[]>(() => [
  { to: toLocalizedWebPath('/store', headerLocale.value), label: t('nav.store') },
  { to: toLocalizedDocsPath('/docs/guide/start', headerLocale.value), label: t('nav.tutorial') },
  { to: toLocalizedDocsPath('/docs/dev', headerLocale.value), label: t('nav.developer') },
  { to: `/tuffex/${headerLocale.value}`, label: 'TuffEx', external: true },
  { to: toLocalizedWebPath('/updates', headerLocale.value), label: t('nav.download') },
  { to: toLocalizedWebPath('/pricing', headerLocale.value), label: t('nav.pricing') },
])

const homeLink = computed(() => toLocalizedWebPath('/', headerLocale.value))

// External hard-navigation to `apps/nexus-console` so zero auth/console JS enters `apps/tuff-web`.
const signInHref = computed(() => {
  const redirect = sanitizeRedirectPath(route.fullPath || '/', '/dashboard')
  return `/sign-in?redirect_url=${encodeURIComponent(redirect)}`
})
const consoleHref = computed(() => (hasSessionHint.value ? '/dashboard' : signInHref.value))
const consoleLabel = computed(() => (hasSessionHint.value ? t('nav.dashboard') : t('nav.login')))

function isActiveLink(link: HeaderNavLink) {
  if (link.external)
    return false

  const path = normalizedPath.value
  const matches = (item: HeaderNavLink) => {
    if (item.external)
      return false
    const target = stripLocalePrefix(item.to)
    if (target === '/')
      return path === '/'
    return path === target || path.startsWith(`${target}/`)
  }

  if (!matches(link))
    return false

  const bestMatch = links.value.reduce<HeaderNavLink | null>((best, item) => {
    if (!matches(item))
      return best
    if (!best || stripLocalePrefix(item.to).length > stripLocalePrefix(best.to).length)
      return item
    return best
  }, null)

  return bestMatch?.to === link.to
}

watch(() => route.fullPath, () => {
  mobileMenuOpen.value = false
})

onMounted(() => {
  hasSessionHint.value = hasSessionHintCookie()
  handleScroll()
  if (hasWindow())
    window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  if (hasWindow())
    window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <header class="TuffHeader" data-role="main-header">
    <div
      class="TuffHeader-Main mx-auto flex flex-wrap items-center justify-between gap-4 border-1 border-transparent border-solid px-4 py-2 sm:flex-nowrap"
      :class="{
        'TuffHeader-Main--scrolled': scrolled,
      }"
    >
      <NuxtLink
        :to="homeLink"
        class="TuffHeader-Brand flex items-center gap-1 text-black font-semibold tracking-tight no-underline dark:text-light"
      >
        <IconComposer />
      </NuxtLink>

      <nav class="TuffHeader-Nav flex flex-1 items-center justify-between gap-2 overflow-hidden text-sm">
        <div class="TuffHeader-NavLinks ml-auto flex items-center gap-1 sm:gap-2">
          <template v-for="link in links" :key="link.to">
            <a
              v-if="link.external"
              :href="link.to"
              class="rounded-full px-2.5 py-1 text-black/65 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
            >
              {{ link.label }}
            </a>
            <NuxtLink
              v-else
              :to="link.to"
              class="rounded-full px-2.5 py-1 text-black/65 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
              :data-active="isActiveLink(link) || undefined"
              :class="isActiveLink(link) ? 'is-active bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
            >
              {{ link.label }}
            </NuxtLink>
          </template>
        </div>

        <HeaderControls
          class="TuffHeader-BarControls"
          :show-search-button="isDocs || isHome"
          :show-language-toggle="true"
          :show-dark-toggle="!isHome"
          :github-url="isHome ? 'https://github.com/talex-touch/tuff' : ''"
        />

        <div v-if="isHome" class="header-auth-divider" />

        <div class="TuffHeader-Auth flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            :href="consoleHref"
            class="shrink-0 whitespace-nowrap border border-primary/20 rounded-full bg-transparent px-3 py-1 text-sm text-black font-medium leading-none no-underline transition dark:border-light/15 hover:border-primary/40 hover:bg-dark/5 dark:text-light dark:hover:bg-light/10"
          >
            {{ consoleLabel }}
          </a>
        </div>

        <button
          type="button"
          class="TuffHeader-MenuButton"
          :aria-label="t('nav.menu')"
          :aria-expanded="mobileMenuOpen"
          aria-haspopup="dialog"
          @click="openMobileMenu"
        >
          <span class="i-carbon-menu" aria-hidden="true" />
        </button>
      </nav>
    </div>

    <ClientOnly>
      <LazyUiDrawer
        v-if="mobileMenuMounted"
        v-model:visible="mobileMenuOpen"
        :title="t('nav.menu')"
        direction="right"
        width="min(320px, 82vw)"
        :mobile-adapt="false"
        :z-index="10050"
      >
        <div class="flex flex-col gap-1">
          <template v-for="link in links" :key="link.to">
            <a
              v-if="link.external"
              :href="link.to"
              class="block rounded-xl px-3.5 py-3 text-black/70 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
              @click="mobileMenuOpen = false"
            >
              {{ link.label }}
            </a>
            <NuxtLink
              v-else
              :to="link.to"
              class="block rounded-xl px-3.5 py-3 text-black/70 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
              :class="isActiveLink(link) ? 'bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
              @click="mobileMenuOpen = false"
            >
              {{ link.label }}
            </NuxtLink>
          </template>
        </div>

        <div class="mt-5 flex items-center justify-center gap-2 border-t border-black/10 pt-5 dark:border-white/10">
          <HeaderControls
            :show-search-button="false"
            :show-language-toggle="true"
            :show-dark-toggle="true"
            github-url="https://github.com/talex-touch/tuff"
          />
        </div>

        <div class="mt-5">
          <a
            :href="consoleHref"
            class="block w-full whitespace-nowrap border border-primary/20 rounded-full bg-transparent px-4 py-2.5 text-center text-sm text-black font-medium leading-none no-underline transition dark:border-light/15 hover:border-primary/40 hover:bg-dark/5 dark:text-light dark:hover:bg-light/10"
            @click="mobileMenuOpen = false"
          >
            {{ consoleLabel }}
          </a>
        </div>
      </LazyUiDrawer>
    </ClientOnly>
  </header>
</template>

<style scoped>
.TuffHeader {
  z-index: 10000;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 88px;
  pointer-events: none;
}

.TuffHeader-Main,
.TuffHeader-Main * {
  pointer-events: auto;
}

.TuffHeader-Main {
  --header-backdrop-filter: blur(18px) saturate(180%);
  position: absolute;
  top: 1rem;
  left: 0;
  right: 0;
  margin-inline: auto;
  width: min(var(--nexus-frame-max, 66rem), calc(100vw - var(--nexus-frame-gutter, 1rem) * 2));
  max-width: calc(100vw - var(--nexus-frame-gutter, 1rem) * 2);
  border-radius: 24px;
  transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);
  isolation: isolate;
  animation: tuff-header-quick-reveal 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

.TuffHeader-Main::before {
  content: '';
  position: absolute;
  inset: -1px;
  z-index: -1;
  border-radius: inherit;
  background-color: rgba(255, 255, 255, 0.58);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.1),
    0 18px 50px rgba(15, 23, 42, 0.08);
  -webkit-backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%));
  backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%));
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.TuffHeader-Main--scrolled {
  width: min(var(--nexus-frame-compact, 840px), calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
}

.TuffHeader-Main--scrolled::before {
  opacity: 1;
}

.dark .TuffHeader-Main::before {
  background-color: rgba(8, 10, 12, 0.58);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 18px 50px rgba(0, 0, 0, 0.24);
}

.TuffHeader-Brand,
.TuffHeader-Nav,
.TuffHeader-NavLinks,
.TuffHeader-Auth {
  min-width: 0;
}

.header-auth-divider {
  width: 1px;
  height: 28px;
  background: rgba(0, 0, 0, 0.12);
}

.dark .header-auth-divider {
  background: rgba(255, 255, 255, 0.12);
}

.TuffHeader-MenuButton {
  display: none;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(20, 22, 24, 0.72);
  cursor: pointer;
  font-size: 1.35rem;
  line-height: 1;
}

.TuffHeader-MenuButton:hover,
.TuffHeader-MenuButton:focus-visible {
  background: rgba(20, 22, 24, 0.06);
  color: rgba(20, 22, 24, 0.92);
  outline: none;
}

.dark .TuffHeader-MenuButton {
  color: rgba(248, 250, 247, 0.72);
}

.dark .TuffHeader-MenuButton:hover,
.dark .TuffHeader-MenuButton:focus-visible {
  background: rgba(248, 250, 247, 0.09);
  color: rgba(248, 250, 247, 0.92);
}

@keyframes tuff-header-quick-reveal {
  from {
    opacity: 0;
    transform: translate3d(0, -6px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .TuffHeader-Main,
  .TuffHeader-Main::before {
    animation: none;
    transition: none;
  }
}

@media (max-width: 960px) {
  .TuffHeader-Main {
    left: var(--nexus-frame-gutter, 1rem);
    right: var(--nexus-frame-gutter, 1rem);
    width: auto;
    max-width: none;
    margin-inline: 0;
  }

  .TuffHeader-Main--scrolled {
    width: auto;
    max-width: none;
  }

  nav {
    justify-content: flex-end;
  }

  .TuffHeader-NavLinks,
  .TuffHeader-BarControls,
  .header-auth-divider,
  .TuffHeader-Auth {
    display: none;
  }

  .TuffHeader-MenuButton {
    display: inline-flex;
  }
}
</style>
