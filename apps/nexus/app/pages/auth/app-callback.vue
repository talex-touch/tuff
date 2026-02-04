<script setup lang="ts">
definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const { status: sessionStatus } = useSession()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const sessionToken = ref('')
const showDevMode = ref(false)
const copied = ref(false)

const APP_SCHEMA = 'tuff'
const isDev = import.meta.dev

async function handleCallback() {
  try {
    if (sessionStatus.value !== 'authenticated') {
      errorMessage.value = t('auth.notSignedIn', 'You are not signed in.')
      status.value = 'error'
      return
    }

    // Get app token for desktop client
    const deviceId = typeof route.query.device_id === 'string' ? route.query.device_id : ''
    const deviceName = typeof route.query.device_name === 'string' ? route.query.device_name : ''
    const devicePlatform = typeof route.query.device_platform === 'string' ? route.query.device_platform : ''

    const headers: Record<string, string> = {}
    if (deviceId)
      headers['x-device-id'] = deviceId
    if (deviceName)
      headers['x-device-name'] = deviceName
    if (devicePlatform)
      headers['x-device-platform'] = devicePlatform

    const { data, error } = await useFetch('/api/auth/sign-in-token', {
      method: 'POST',
      headers,
    })

    if (error.value || !data.value?.appToken) {
      errorMessage.value = t('auth.tokenFailed', 'Failed to get authentication token.')
      status.value = 'error'
      return
    }

    const appToken = data.value.appToken
    sessionToken.value = appToken
    status.value = 'success'

    // Redirect to app with token
    const params = new URLSearchParams()
    params.set('app_token', appToken)
    const callbackUrl = `${APP_SCHEMA}://auth/callback?${params.toString()}`
    window.location.href = callbackUrl

    // In dev mode, show fallback after a delay (protocol might not work)
    if (isDev) {
      setTimeout(() => {
        showDevMode.value = true
      }, 2000)
    }
  }
  catch (error) {
    console.error('[AppCallback] Error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unknown error'
    status.value = 'error'
  }
}

async function copyToken() {
  if (sessionToken.value) {
    await navigator.clipboard.writeText(sessionToken.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

watch(
  () => sessionStatus.value,
  (current) => {
    if (current !== 'loading') {
      handleCallback()
    }
  },
  { immediate: true },
)
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

        <!-- Dev mode fallback -->
        <div v-if="showDevMode" class="mt-6 w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p class="mb-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            🔧 Dev Mode: Protocol handler may not work
          </p>
          <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Copy the token and paste it in the app's dev console:
          </p>
          <code class="mb-3 block max-h-20 overflow-auto break-all rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
            {{ sessionToken }}
          </code>
          <button
            class="rounded-lg bg-yellow-500 px-4 py-2 text-sm text-white transition hover:bg-yellow-600"
            @click="copyToken"
          >
            {{ copied ? '✓ Copied!' : 'Copy Token' }}
          </button>
          <p class="mt-2 text-xs text-gray-400">
            Then run in Electron DevTools console: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">__devAuthToken("PASTE_TOKEN_HERE")</code>
          </p>
        </div>
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
