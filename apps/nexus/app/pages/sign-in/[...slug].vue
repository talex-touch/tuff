<script setup lang="ts">
import { AuthenticateWithRedirectCallback, SignIn } from '@clerk/nuxt/components'
import { computed, watchEffect } from 'vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t, locale, setLocale } = useI18n()
const route = useRoute()

const slugSegments = computed(() => {
  const raw = route.params.slug
  if (!raw)
    return []
  return Array.isArray(raw) ? raw : [raw]
})

const isSsoCallback = computed(() => slugSegments.value[0] === 'sso-callback')

// Store and restore redirect_url across SSO callback
const REDIRECT_STORAGE_KEY = 'tuff_sign_in_redirect'

const redirectTarget = computed(() => {
  // First check query param
  const redirect = route.query.redirect_url
  if (typeof redirect === 'string' && redirect.length > 0) {
    // Store for SSO callback restoration
    if (import.meta.client) {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirect)
    }
    return redirect
  }

  // For SSO callback, restore from sessionStorage
  if (isSsoCallback.value && import.meta.client) {
    const stored = sessionStorage.getItem(REDIRECT_STORAGE_KEY)
    if (stored) {
      return stored
    }
  }

  return '/dashboard'
})

// Clean up storage after successful redirect
if (import.meta.client) {
  onUnmounted(() => {
    // Only clean up if not in callback
    if (!isSsoCallback.value) {
      sessionStorage.removeItem(REDIRECT_STORAGE_KEY)
    }
  })
}

const langParam = computed(() => {
  const raw = route.query.lang
  if (!raw)
    return null
  const value = Array.isArray(raw) ? raw[0] : raw
  return value || null
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

const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const signUpUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: redirectTarget.value,
  })
  return `/sign-up?${params.toString()}`
})
const currentPath = computed(() => route.path)
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md">
      <AuthenticateWithRedirectCallback
        v-if="isSsoCallback"
        :force-redirect-url="redirectTarget"
        :sign-in-force-redirect-url="redirectTarget"
        :sign-up-force-redirect-url="redirectTarget"
      >
        <template #fallback>
          <div class="flex flex-col items-center gap-4 text-center text-sm text-gray-600 dark:text-gray-300">
            <span class="i-carbon-circle-dash text-3xl text-black/80" />
            <span>{{ t('auth.callbackProcessing') }}</span>
          </div>
        </template>
      </AuthenticateWithRedirectCallback>

      <div
        v-else
        class="space-y-6"
      >
        <SignIn
          :appearance="{ elements: { rootBox: 'shadow-lg rounded-2xl bg-white dark:bg-gray-800' } }"
          path="/sign-in"
          routing="path"
          :sign-up-url="signUpUrl"
          :force-redirect-url="redirectTarget"
          :fallback-redirect-url="redirectTarget"
        />
      </div>
    </div>
    <div class="fixed bottom-6 left-6">
      <NuxtLink
        to="/"
        class="text-sm font-medium text-black/70 underline-offset-4 transition hover:text-black hover:underline dark:text-light/70 dark:hover:text-light"
      >
        {{ t('auth.backToHome') }}
      </NuxtLink>
    </div>
    <div class="fixed bottom-6 right-6">
      <LanguageToggle />
    </div>
  </div>
</template>
