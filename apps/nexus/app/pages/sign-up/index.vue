<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { sanitizeRedirect } from '~/composables/useOauthContext'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()

const redirectTarget = computed(() => {
  const redirect = route.query.redirect_url
  if (typeof redirect === 'string' && redirect.length > 0) {
    return sanitizeRedirect(redirect, '/dashboard')
  }
  return '/dashboard'
})

const redirectUrl = computed(() => {
  const params = new URLSearchParams({
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
