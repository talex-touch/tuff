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
const redirectTarget = computed(() => {
  const redirect = route.query.redirect_url
  return typeof redirect === 'string' && redirect.length > 0 ? redirect : '/dashboard'
})

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
const signUpUrl = computed(() => `/sign-up?lang=${langTag.value}`)
const currentPath = computed(() => route.path)
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="max-w-md w-full">
      <AuthenticateWithRedirectCallback
        v-if="isSsoCallback"
        :redirect-url="redirectTarget"
        :after-sign-in-url="redirectTarget"
        :after-sign-up-url="redirectTarget"
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
        <div class="border-box max-w-[400px] border border-primary/15 rounded-2xl bg-dark/5 px-4 py-3 text-sm text-black/80 dark:border-light/20 dark:bg-light/10 dark:text-light/80">
          {{ t('auth.linuxdoWaitlistNotice') }}
        </div>
        <SignIn
          :appearance="{ elements: { rootBox: 'shadow-lg rounded-2xl bg-white dark:bg-gray-800' } }"
          :path="currentPath"
          routing="path"
          :sign-up-url="signUpUrl"
          :redirect-url="redirectTarget"
          :after-sign-in-url="redirectTarget"
          :after-sign-up-url="redirectTarget"
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
