<script setup lang="ts">
import { ClerkLoaded, ClerkLoading } from '@clerk/nuxt/components'
import { computed, onMounted, watchEffect } from 'vue'
import { appName } from '~/constants'

useHead({
  title: appName,
})

const route = useRoute()
const router = useRouter()
const isProtectedRoute = computed(() => route.meta.requiresAuth === true)

const { locale, setLocale } = useI18n()

// Initialize user locale from Clerk metadata
const { initializeLocale, syncLocaleChanges, getSavedLocale } = useUserLocale()

/**
 * Detect browser language as fallback
 */
function detectBrowserLocale(): 'zh' | 'en' {
  if (import.meta.server) return 'en'
  
  const browserLang = navigator.language || navigator.languages?.[0] || 'en'
  return browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

onMounted(() => {
  // Priority: Clerk metadata > Browser language > Default
  const savedLocale = getSavedLocale()
  
  if (savedLocale) {
    // User has saved preference in Clerk
    initializeLocale()
  } else {
    // First-time visitor: detect browser language
    const browserLocale = detectBrowserLocale()
    if (browserLocale !== locale.value) {
      setLocale(browserLocale)
    }
  }
  
  // Enable auto-sync of locale changes to Clerk
  syncLocaleChanges()
})

const langParam = computed(() => {
  const raw = route.query.lang
  if (!raw)
    return null
  return Array.isArray(raw) ? raw[0] : raw
})

const localeFromQuery = computed(() => {
  const param = langParam.value
  if (!param)
    return null
  const normalized = param.toLowerCase()
  if (normalized.startsWith('zh'))
    return 'zh'
  if (normalized.startsWith('en'))
    return 'en'
  return null
})

watchEffect(() => {
  const next = localeFromQuery.value
  if (next && next !== locale.value)
    setLocale(next)
})

watchEffect(() => {
  // 避免在初始化时立即重定向，等待路由完全加载
  if (!route.path)
    return

  const trimmed = route.path.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'

  // 只在路径实际不同时才重定向，并且确保不会导致无限循环
  if (trimmed !== route.path && route.path !== '/') {
    router.replace({
      path: trimmed,
      query: route.query,
      hash: route.hash,
    })
  }
})
</script>

<template>
  <VitePwaManifest />
  <ToastContainer />
  <template v-if="isProtectedRoute">
    <ClerkLoading>
      <div class="grid h-screen w-screen place-content-center text-sm text-gray-500">
        Checking your session…
      </div>
    </ClerkLoading>
    <ClerkLoaded>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </ClerkLoaded>
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
  height: 100vh;
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

html.dark {
  color-scheme: dark;
}

.cubic-transition,
.transition-cubic {
  transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

button {
  outline: none !important;
  border: none !important;
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
