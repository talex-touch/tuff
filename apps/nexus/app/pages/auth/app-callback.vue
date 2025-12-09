<script setup lang="ts">
import { useAuth } from '@clerk/nuxt'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const { getToken, isSignedIn } = useAuth()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

const APP_SCHEMA = 'tuff'

async function handleCallback() {
  try {
    if (!isSignedIn.value) {
      errorMessage.value = t('auth.notSignedIn', 'You are not signed in.')
      status.value = 'error'
      return
    }

    const token = await getToken()
    if (!token) {
      errorMessage.value = t('auth.tokenFailed', 'Failed to get authentication token.')
      status.value = 'error'
      return
    }

    status.value = 'success'

    // Redirect to app with token
    const callbackUrl = `${APP_SCHEMA}://auth/callback?token=${encodeURIComponent(token)}`
    window.location.href = callbackUrl
  }
  catch (error) {
    console.error('[AppCallback] Error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unknown error'
    status.value = 'error'
  }
}

onMounted(() => {
  handleCallback()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md text-center">
      <!-- Loading -->
      <div v-if="status === 'loading'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-circle-dash animate-spin text-4xl text-primary" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.redirectingToApp', 'Redirecting to Tuff...') }}
        </p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-checkmark-filled text-4xl text-green-500" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.redirectSuccess', 'Authentication successful! Opening Tuff...') }}
        </p>
        <p class="text-sm text-gray-400">
          {{ t('auth.manualOpen', 'If the app does not open automatically, please open Tuff manually.') }}
        </p>
      </div>

      <!-- Error -->
      <div v-else class="flex flex-col items-center gap-4">
        <span class="i-carbon-warning-filled text-4xl text-red-500" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.authFailed', 'Authentication failed') }}
        </p>
        <p class="text-sm text-red-400">
          {{ errorMessage }}
        </p>
        <NuxtLink
          to="/sign-in"
          class="mt-4 rounded-lg bg-primary px-6 py-2 text-white transition hover:bg-primary/80"
        >
          {{ t('auth.tryAgain', 'Try Again') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
