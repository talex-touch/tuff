<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t, locale, setLocale } = useI18n()
const route = useRoute()

const redirectTarget = computed(() => {
  const redirect = route.query.redirect_url
  if (typeof redirect === 'string' && redirect.length > 0) {
    return redirect
  }
  return '/dashboard'
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

const redirectUrl = computed(() => {
  const params = new URLSearchParams({
    lang: langTag.value,
    redirect_url: redirectTarget.value,
  })
  return `/sign-in?${params.toString()}`
})

onMounted(() => {
  navigateTo(redirectUrl.value)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <p class="text-sm text-black/60 dark:text-light/70">
      {{ t('auth.redirectingToSignIn', '正在跳转到登录页…') }}
    </p>
  </div>
</template>
