<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { SignUp } from '@clerk/nuxt/components'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t, locale, setLocale } = useI18n()
const route = useRoute()

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
const signInUrl = computed(() => `/sign-in?lang=${langTag.value}`)
const currentPath = computed(() => route.path)
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="max-w-md w-full">
      <SignUp
        :appearance="{ elements: { rootBox: 'shadow-lg rounded-2xl bg-white dark:bg-gray-800' } }"
        :path="currentPath"
        routing="path"
        :sign-in-url="signInUrl"
      />
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
