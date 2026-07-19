<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import NexusPwaManifest from '~/components/NexusPwaManifest.vue'
import { sanitizeRedirect } from '~/composables/useOauthContext'
import { appName, toastHostRequestedEvent } from '~/constants'
import { resolveDocsLocaleFromRoute } from '#shared/utils/docs-path'

const LazyToastContainer = defineAsyncComponent(() => import('~/components/ToastContainer.vue'))

useHead({
  title: appName,
  titleTemplate: title => (!title || title === appName) ? appName : (title.includes(appName) || title.includes('Tuff') ? title : `${title} · Tuff Nexus`),
})

const route = useRoute()
const router = useRouter()
const isProtectedRoute = computed(() => route.meta.requiresAuth === true)
const isAuthShellRoute = computed(() => {
  const path = route.path || '/'
  return path.startsWith('/sign-in')
    || path.startsWith('/sign-up')
    || path.startsWith('/auth/')
    || path.startsWith('/verify')
    || path.startsWith('/forgot-password')
    || path.startsWith('/reset-password')
    || path.startsWith('/device-auth')
})
const { open: globalSearchOpen, closeSearch, summonSearch } = useGlobalSearchState()
const { initLocale, reconcileClientLocale, setLocaleSerial, syncFromProfileOnAuth } = useLocaleOrchestrator()
const { status, getSession } = useNexusAuth()

useHead(() => {
  if (!isProtectedRoute.value)
    return {}
  if (status.value === 'authenticated')
    return {}
  return {
    title: status.value === 'loading' ? 'Checking session · Tuff Nexus' : 'Sign in required · Tuff Nexus',
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }
})
interface AppAuthUserState {
  id?: string
  locale?: string | null
  adminBootstrap?: {
    required?: boolean
  }
}

const authUserState = useState<AppAuthUserState | null>('auth-user', () => null)
const authUserPending = useState<boolean>('auth-user-pending', () => false)
const authUserError = useState<string | null>('auth-user-error', () => null)
const user = computed(() => authUserState.value)
let authUserFetchPromise: Promise<void> | null = null
const mounted = ref(false)
const toastHostMounted = ref(false)
const sessionErrorCookie = useCookie<string | null>('nexus_auth_error')
const isAuthLoading = computed(() => status.value === 'loading')
const isAuthenticated = computed(() => status.value === 'authenticated')
const shouldSyncProfileLocale = computed(() => isProtectedRoute.value)
const protectedSessionRecheckDone = ref(false)
const protectedSessionRecheckRunning = ref(false)
const searchTriggerSelector = '[data-role="global-search-trigger"]'
const docsRouteLocale = computed(() => {
  const path = route.path || ''
  return /^\/(en|zh)\/docs(?=\/|$)/.test(path)
    ? resolveDocsLocaleFromRoute(path)
    : null
})

async function fetchProtectedAuthUser() {
  if (import.meta.server || status.value !== 'authenticated' || !isProtectedRoute.value)
    return
  if (authUserFetchPromise)
    return authUserFetchPromise

  authUserPending.value = true
  authUserError.value = null

  authUserFetchPromise = (async () => {
    try {
      const { fetchCurrentUserProfile } = await import('~/composables/useCurrentUserApi')
      const data = await fetchCurrentUserProfile()
      if (status.value === 'authenticated' && isProtectedRoute.value)
        authUserState.value = data ?? null
    }
    catch (error: any) {
      authUserError.value = error?.data?.statusMessage || error?.message || 'Failed to load user.'
      if (!authUserState.value)
        authUserState.value = null
    }
    finally {
      authUserPending.value = false
      authUserFetchPromise = null
    }
  })()

  return authUserFetchPromise
}

watch(
  () => [status.value, isProtectedRoute.value] as const,
  ([currentStatus, protectedRoute]) => {
    if (import.meta.server)
      return

    if (currentStatus === 'authenticated' && protectedRoute) {
      void fetchProtectedAuthUser()
      return
    }

    if (currentStatus !== 'authenticated') {
      authUserState.value = null
      authUserError.value = null
    }
    authUserPending.value = false
  },
  { immediate: true },
)

await initLocale({
  isAuthenticated: status.value === 'authenticated',
  profileLocale: status.value === 'authenticated' ? user.value?.locale ?? null : null,
})
if (docsRouteLocale.value)
  await setLocaleSerial(docsRouteLocale.value, 'browser')

watch(
  () => [status.value, user.value?.id ?? null, user.value?.locale ?? null, shouldSyncProfileLocale.value] as const,
  ([currentStatus, userId, profileLocale, canSyncProfileLocale]) => {
    if (!mounted.value)
      return
    if (!canSyncProfileLocale)
      return

    void syncFromProfileOnAuth({
      status: currentStatus,
      userId,
      profileLocale,
    })
  },
)

const redirectTarget = computed(() => sanitizeRedirect(route.fullPath, '/dashboard'))

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false
  if (target.isContentEditable)
    return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function resolveGlobalSearchTrigger() {
  if (!import.meta.client)
    return null
  return document.querySelector<HTMLElement>(searchTriggerSelector)
}

function handleGlobalSearchShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || isAuthShellRoute.value)
    return

  if (globalSearchOpen.value && event.key === 'Escape') {
    event.preventDefault()
    closeSearch()
    return
  }

  if (isEditableTarget(event.target))
    return

  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === 'k') {
    event.preventDefault()
    void summonSearch(resolveGlobalSearchTrigger())
    return
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/') {
    event.preventDefault()
    void summonSearch(resolveGlobalSearchTrigger())
  }
}

function mountToastHost() {
  toastHostMounted.value = true
}

onMounted(() => {
  mounted.value = true
  closeSearch()
  window.addEventListener('keydown', handleGlobalSearchShortcut)
  window.addEventListener(toastHostRequestedEvent, mountToastHost)
  void (async () => {
    if (docsRouteLocale.value) {
      await setLocaleSerial(docsRouteLocale.value, 'browser')
    }
    else {
      await reconcileClientLocale({
        isAuthenticated: status.value === 'authenticated',
        profileLocale: user.value?.locale ?? null,
      })
    }
    if (shouldSyncProfileLocale.value) {
      await syncFromProfileOnAuth({
        status: status.value,
        userId: user.value?.id ?? null,
        profileLocale: status.value === 'authenticated' ? user.value?.locale ?? null : null,
      })
    }
  })()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalSearchShortcut)
  window.removeEventListener(toastHostRequestedEvent, mountToastHost)
})

watch(
  () => route.fullPath,
  () => closeSearch(),
)

watch(
  docsRouteLocale,
  (targetLocale) => {
    if (!targetLocale)
      return
    void setLocaleSerial(targetLocale, 'browser')
  },
)

function pickFirstQueryValue(value: unknown) {
  if (!value)
    return null
  if (Array.isArray(value))
    return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' ? value : null
}

const authFallbackCallbackUrl = computed(() => {
  return pickFirstQueryValue(route.query.callbackUrl) ?? pickFirstQueryValue(route.query.callback_url)
})

function parseUrlLike(value: string) {
  try {
    const base = import.meta.client ? window.location.origin : 'http://localhost'
    return value.startsWith('/') ? new URL(value, base) : new URL(value)
  }
  catch {
    return null
  }
}

function isAuthIntermediatePath(pathname: string) {
  return pathname.startsWith('/sign-in') || pathname.startsWith('/api/auth/signin')
}

function isAdminBootstrapPath(pathname: string) {
  return pathname.startsWith('/auth/admin-bootstrap')
}

function safeDecodeUriComponent(value: string) {
  try {
    const decoded = decodeURIComponent(value)
    return decoded === value ? null : decoded
  }
  catch {
    return null
  }
}

function resolveAuthFallbackTarget(value: string, depth = 0): URL | null {
  if (depth > 4)
    return null

  const parsed = parseUrlLike(value)
  if (!parsed)
    return null

  if (isAuthIntermediatePath(parsed.pathname))
    return parsed

  const nestedRaw = parsed.searchParams.get('callbackUrl') ?? parsed.searchParams.get('callback_url')
  if (!nestedRaw)
    return parsed

  const nested = resolveAuthFallbackTarget(nestedRaw, depth + 1)
  if (nested)
    return nested

  const decoded = safeDecodeUriComponent(nestedRaw)
  if (!decoded)
    return parsed

  return resolveAuthFallbackTarget(decoded, depth + 1) ?? parsed
}

function isOauthProvider(value: string | null): value is 'github' | 'linuxdo' {
  return value === 'github' || value === 'linuxdo'
}

function isAuthFlow(value: string | null): value is 'login' | 'bind' {
  return value === 'login' || value === 'bind'
}

const AUTH_REDIRECT_NOISE_KEYS = [
  'callbackUrl',
  'callback_url',
  'oauth',
  'oauth_relay',
  'flow',
  'provider',
  'error',
  'error_description',
]

function sanitizeRecoveredRedirect(raw: string | null | undefined, fallback: string) {
  const normalized = sanitizeRedirect(raw, fallback)
  if (normalized !== '/')
    return normalized
  if (!raw)
    return normalized

  const parsed = parseUrlLike(raw)
  if (!parsed)
    return normalized

  const hasAuthNoise = AUTH_REDIRECT_NOISE_KEYS.some(key => parsed.searchParams.has(key))
  if (!hasAuthNoise)
    return normalized

  return fallback
}

const authFallbackRecoveryQuery = computed(() => {
  if (route.path !== '/')
    return null

  const callbackUrl = authFallbackCallbackUrl.value
  if (!callbackUrl)
    return null

  const parsed = resolveAuthFallbackTarget(callbackUrl)
  const routeError = pickFirstQueryValue(route.query.error)
  const routeErrorDescription = pickFirstQueryValue(route.query.error_description)

  if (!parsed) {
    if (!routeError && !routeErrorDescription)
      return null
    const fallbackQuery: Record<string, string> = {}
    if (routeError)
      fallbackQuery.error = routeError
    if (routeErrorDescription)
      fallbackQuery.error_description = routeErrorDescription
    return fallbackQuery
  }

  const hasOauthHints = isAuthIntermediatePath(parsed.pathname)
    || parsed.searchParams.has('oauth')
    || parsed.searchParams.has('provider')
    || parsed.searchParams.has('flow')

  if (!hasOauthHints && !routeError && !routeErrorDescription)
    return null

  const query: Record<string, string> = {}

  const provider = parsed.searchParams.get('provider')
  const flow = parsed.searchParams.get('flow')
  const oauth = parsed.searchParams.get('oauth')
  const redirectRaw = parsed.searchParams.get('redirect_url')

  if (oauth === '1')
    query.oauth = '1'
  if (isOauthProvider(provider))
    query.provider = provider
  if (isAuthFlow(flow))
    query.flow = flow

  const redirectFallback = flow === 'bind' ? '/dashboard/account' : '/dashboard'
  if (redirectRaw)
    query.redirect_url = sanitizeRecoveredRedirect(redirectRaw, redirectFallback)

  const parsedError = parsed.searchParams.get('error')
  const parsedErrorDescription = parsed.searchParams.get('error_description')
  if (routeError || parsedError)
    query.error = routeError || (parsedError as string)
  if (routeErrorDescription || parsedErrorDescription)
    query.error_description = routeErrorDescription || (parsedErrorDescription as string)

  return query
})

watchEffect(() => {
  if (import.meta.server)
    return
  if (!route.path)
    return
  if (sessionErrorCookie.value !== 'jwt_session_error')
    return
  sessionErrorCookie.value = null
  router.replace({
    path: '/sign-in',
    query: {
      redirect_url: redirectTarget.value,
      reason: 'reauth',
    },
  })
})

watchEffect(() => {
  if (import.meta.server)
    return
  if (!authFallbackRecoveryQuery.value)
    return

  router.replace({
    path: '/sign-in',
    query: authFallbackRecoveryQuery.value,
  })
})

watchEffect(() => {
  if (import.meta.server)
    return

  if (!isProtectedRoute.value)
    return

  if (status.value === 'authenticated') {
    protectedSessionRecheckDone.value = false
    protectedSessionRecheckRunning.value = false
    return
  }

  if (status.value !== 'unauthenticated')
    return

  if (!protectedSessionRecheckDone.value && !protectedSessionRecheckRunning.value) {
    protectedSessionRecheckRunning.value = true
    void getSession()
      .catch(() => {})
      .finally(() => {
        protectedSessionRecheckRunning.value = false
        protectedSessionRecheckDone.value = true
      })
    return
  }

  if (protectedSessionRecheckRunning.value)
    return

  router.replace({
    path: '/sign-in',
    query: {
      redirect_url: redirectTarget.value,
    },
  })
})

watchEffect(() => {
  if (import.meta.server)
    return
  if (status.value !== 'authenticated')
    return
  if (authUserPending.value)
    return
  if (isAdminBootstrapPath(route.path))
    return

  const bootstrap = user.value?.adminBootstrap
  if (!bootstrap?.required)
    return

  router.replace({
    path: '/auth/admin-bootstrap',
    query: {
      redirect_url: sanitizeRedirect(route.fullPath, '/dashboard'),
    },
  })
})
</script>

<template>
  <NexusPwaManifest />
  <NuxtLoadingIndicator color="#ffffff" />
  <LazyToastContainer v-if="toastHostMounted" />
  <ClientOnly>
    <LazySearchGlobalSearch v-if="!isAuthShellRoute && globalSearchOpen" />
  </ClientOnly>
  <template v-if="isProtectedRoute">
    <div
      v-if="isAuthLoading"
      class="grid h-screen w-screen place-content-center text-sm text-gray-500"
    >
      Checking your session…
    </div>
    <div
      v-else-if="!isAuthenticated"
      class="grid h-screen w-screen place-content-center text-sm text-gray-500"
    >
      Redirecting to sign in…
    </div>
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </template>
  <template v-else>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </template>
</template>

<style>
html,
body,
#__nuxt {
  min-height: 100vh;
  margin: 0;
  padding: 0;
}

body {
  font-family:
    'PingFang SC', '-apple-system', 'Helvetica Neue', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', 'DM Sans',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.plan-display-font {
  font-family: 'Poppins', 'Avenir Next', 'DM Sans', 'PingFang SC', 'Segoe UI', sans-serif;
  font-weight: 600;
  letter-spacing: -0.018em;
}

html.dark {
  color-scheme: dark;
}

.cubic-transition,
.transition-cubic {
  transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

* {
  box-sizing: border-box;
}

.cl-drawerRoot {
  z-index: 1000;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

/* 进入dark模式和退出dark模式时，两个图像的位置顺序正好相反 */
.dark::view-transition-old(root) {
  z-index: 9999999;
}

.dark::view-transition-new(root) {
  z-index: 10000000;
}

::view-transition-old(root) {
  z-index: 1000;
}

::view-transition-new(root) {
  z-index: 99999;
}

[id] {
  scroll-margin-top: 120px;
}
</style>
