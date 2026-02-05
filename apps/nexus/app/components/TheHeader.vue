<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'
import Logo from './icon/Logo.vue'

withDefaults(defineProps<{
  title?: string
}>(), {
  title: 'Tuff',
})

const route = useRoute()
const { data: session, status, signOut } = useAuth()

const scrolled = ref(false)
const { t, locale } = useI18n()

function handleScroll() {
  scrolled.value = window.scrollY > 0
}

const links = computed(() => [
  { to: '/market', label: t('nav.market') },
  { to: '/docs/guide/start', label: t('nav.tutorial') },
  { to: '/docs', label: t('nav.doc') },
  // { to: '/#developer', label: t('nav.developer') },
  { to: '/updates', label: t('nav.download') },
  // { to: '/#blog', label: t('nav.blog') },
  // { to: '/pricing', label: t('nav.pricing') },
])

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const fullPath = computed(() => route.fullPath || '/')
const authRedirectTarget = computed(() => {
  const target = fullPath.value
  if (target.startsWith('/sign-in') || target.startsWith('/sign-up'))
    return '/dashboard'
  return target
})

const signInRoute = computed(() => ({
  path: '/sign-in',
  query: {
    lang: langTag.value,
    redirect_url: authRedirectTarget.value,
  },
}))

const afterSignOutUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: authRedirectTarget.value,
  })
  return `/sign-in?${params.toString()}`
})

const isAuthenticated = computed(() => status.value === 'authenticated')
const userLabel = computed(() => {
  const name = session.value?.user?.name || session.value?.user?.email || ''
  if (!name)
    return ''
  return name.trim()
})
const userInitial = computed(() => {
  const label = userLabel.value
  return label ? label.slice(0, 1).toUpperCase() : 'U'
})

async function handleSignOut() {
  try {
    await signOut({ callbackUrl: afterSignOutUrl.value })
  }
  catch (error) {
    console.error('[Header] Failed to sign out:', error)
  }
}

const currentPath = computed(() => route.path || '/')
const normalizedPath = computed(() => {
  const path = currentPath.value
  const code = locale.value
  if (!code)
    return path
  const prefix = `/${code}`
  if (path === prefix || path === `${prefix}/`)
    return '/'
  if (path.startsWith(`${prefix}/`))
    return path.slice(prefix.length) || '/'
  return path
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
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const { headerVisible, sequenceStarted, setHeaderVisibility } = useLandingRevealState()

if (!isHome.value) {
  setHeaderVisibility(true)
}
else if (!sequenceStarted.value) {
  setHeaderVisibility(false)
}

watchEffect(() => {
  if (!isHome.value) {
    setHeaderVisibility(true)
  }
})

const landingHeaderClass = computed(() => ({
  'landing-header': true,
  'landing-header--visible': headerVisible.value,
}))

const headerRevealStyle = computed(() => {
  if (!isHome.value)
    return { '--header-delay': '0s' }
  return undefined
})
</script>

<template>
  <header
    class="TuffHeader"
    data-role="main-header"
    :class="landingHeaderClass"
    :style="headerRevealStyle"
  >
    <div
      class="TuffHeader-Main mx-auto flex flex-wrap items-center justify-between gap-4 border-1 border-transparent border-solid px-4 py-2 sm:flex-nowrap"
      :class="{
        'border-primary/10 bg-white/50 shadow-sm dark:border-light/10 dark:bg-dark/50': scrolled,
      }"
    >
      <NuxtLink
        to="/"
        class="flex items-center gap-1 text-black font-semibold tracking-tight no-underline dark:text-light"
      >
        <Logo />
        <span class="text-lg sm:text-xl">{{ title }}</span>
        <BetaIcon />
      </NuxtLink>

      <nav class="flex flex-1 items-center justify-between gap-2 overflow-hidden text-sm">
        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-full px-3 py-1 text-black/65 font-medium no-underline transition-colors duration-200 hover:bg-dark/5 dark:text-light/70 hover:text-black dark:hover:bg-light/10 dark:hover:text-light"
            :class="isActiveLink(link) ? 'bg-dark/5 text-black dark:bg-light/15 dark:text-light' : ''"
          >
            {{ link.label }}
          </NuxtLink>
        </div>

        <HeaderControls
          :show-search-button="isDocs"
          :show-dark-toggle="!isHome"
        />

        <div class="flex items-center gap-2 sm:gap-3">
          <template v-if="!isAuthenticated">
            <NuxtLink
              :to="signInRoute"
              class="border border-primary/20 rounded-full bg-transparent px-3 py-1 text-sm text-black font-medium transition dark:border-light/15 hover:border-primary/40 hover:bg-dark/5 dark:text-light dark:hover:bg-light/10"
            >
              {{ t('nav.login') }}
            </NuxtLink>
          </template>
          <template v-else>
            <NuxtLink
              to="/dashboard"
              class="border border-primary/20 rounded-full bg-dark px-3 py-1 text-sm text-white font-semibold no-underline shadow-primary/30 shadow-sm transition dark:border-transparent dark:bg-light hover:bg-dark/90 dark:text-black dark:shadow-light/40 dark:hover:bg-light/90"
            >
              {{ t('nav.dashboard') }}
            </NuxtLink>
            <NuxtLink
              to="/dashboard/account"
              class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              aria-label="Account"
            >
              {{ userInitial }}
            </NuxtLink>
            <button
              type="button"
              class="border border-primary/20 rounded-full bg-transparent px-3 py-1 text-sm text-black font-medium transition dark:border-light/15 hover:border-primary/40 hover:bg-dark/5 dark:text-light dark:hover:bg-light/10"
              @click="handleSignOut"
            >
              {{ t('nav.logout', '退出') }}
            </button>
          </template>
        </div>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.TuffHeader {
  position: fixed;

  top: 0;
  left: 0;

  width: 100%;
  height: 64px;
}

.TuffHeader-Main {
  position: absolute;

  top: 1rem;
  left: 50%;

  width: 100%;
  max-width: 1320px;

  border-radius: 24px;
  transform: translateX(-50%);

  isolation: isolate;
  overflow: hidden;
  backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%)) !important;
  -webkit-backdrop-filter: var(--header-backdrop-filter, blur(18px) saturate(180%)) !important;
}

.landing-header {
  opacity: 0;
  filter: blur(18px);
  transform: translate3d(0, -48px, 0);
  pointer-events: none;
  transition:
    opacity 1.15s cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 1.25s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 1.15s cubic-bezier(0.22, 0.61, 0.36, 1);
  transition-delay: var(--header-delay, 0.2s);
}

.landing-header--visible {
  opacity: 1;
  filter: none;
  transform: translate3d(0, 0, 0);
  pointer-events: auto;
}
</style>
