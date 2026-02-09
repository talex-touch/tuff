<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuffex'
import Button from '~/components/ui/Button.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const { status: sessionStatus, getSession } = useAuth()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const callbackInFlight = ref(false)
const sessionToken = ref('')
const showDevMode = ref(false)
const copied = ref(false)

const APP_SCHEMA = 'tuff'
const isDev = import.meta.dev

function hasActiveSession(session: unknown) {
  const user = (session as { user?: unknown } | null | undefined)?.user
  return Boolean(user)
}

async function ensureAuthenticatedSession() {
  const firstSession = await getSession().catch(() => null)
  if (hasActiveSession(firstSession))
    return true

  await new Promise(resolve => setTimeout(resolve, 200))

  const secondSession = await getSession().catch(() => null)
  return hasActiveSession(secondSession)
}

function goTo(path: string) {
  return navigateTo(path)
}

function goBack() {
  return goTo('/sign-in')
}

const CALLBACK_FEEDBACK_MIN_MS = 800

async function ensureCallbackProcessingFeedback(startedAt: number) {
  const elapsed = Date.now() - startedAt
  if (elapsed >= CALLBACK_FEEDBACK_MIN_MS)
    return

  await new Promise(resolve => setTimeout(resolve, CALLBACK_FEEDBACK_MIN_MS - elapsed))
}

async function handleCallback() {
  if (import.meta.server)
    return
  if (callbackInFlight.value || status.value !== 'loading')
    return

  callbackInFlight.value = true
  const callbackStartedAt = Date.now()

  try {
    const authenticated = await ensureAuthenticatedSession()

    if (!authenticated) {
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      await navigateTo({
        path: '/sign-in',
        query: {
          redirect_url: route.fullPath,
        },
      }, { replace: true })
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

    const data = await $fetch<{ appToken?: string | null }>('/api/app-auth/sign-in-token', {
      method: 'POST',
      headers,
      credentials: 'include',
    })

    if (!data?.appToken) {
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      errorMessage.value = t('auth.tokenFailed', 'Failed to get authentication token.')
      status.value = 'error'
      return
    }

    const appToken = data.appToken
    await ensureCallbackProcessingFeedback(callbackStartedAt)
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
  catch (error: any) {
    await ensureCallbackProcessingFeedback(callbackStartedAt)
    console.error('[AppCallback] Error:', error)

    if (error?.status === 401 || error?.statusCode === 401) {
      await navigateTo({
        path: '/sign-in',
        query: {
          redirect_url: route.fullPath,
          reason: 'reauth',
        },
      }, { replace: true })
      return
    }

    errorMessage.value = error?.data?.statusMessage
      || error?.statusMessage
      || error?.message
      || 'Unknown error'
    status.value = 'error'
  }
  finally {
    callbackInFlight.value = false
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

onMounted(() => {
  if (sessionStatus.value !== 'loading')
    void handleCallback()
})

watch(
  () => sessionStatus.value,
  (current) => {
    if (import.meta.server)
      return
    if (current !== 'loading')
      void handleCallback()
  },
)
</script>

<template>
  <AuthVisualShell :loading="status === 'loading'">
    <template #header>
      <AuthTopbar
        :back-label="t('auth.backToPrevious', '返回上一页')"
        @back="goBack"
      />
    </template>

    <div class="mb-16 w-full max-w-md text-center">
      <div v-if="status === 'loading'" class="flex flex-col items-center gap-4">
        <TxSpinner :size="30" />
        <p class="text-base text-white/90">
          {{ t('auth.callbackProcessing', '正在处理登录回调，请稍候…') }}
        </p>
      </div>

      <div v-else-if="status === 'success'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-checkmark-filled text-4xl text-emerald-400" />
        <p class="text-base text-white/90">
          {{ t('auth.redirectSuccess', 'Authentication successful! Opening Tuff...') }}
        </p>
        <p class="text-sm text-white/65">
          {{ t('auth.manualOpen', 'If the app does not open automatically, please open Tuff manually.') }}
        </p>

        <div v-if="showDevMode" class="w-full space-y-2 text-left">
          <p class="text-sm text-amber-200/95">
            🔧 Dev Mode: Protocol handler may not work
          </p>
          <p class="text-xs text-white/65">
            Copy the token and paste it in the app's dev console:
          </p>
          <code class="block max-h-24 overflow-auto text-xs text-white/85">{{ sessionToken }}</code>
          <Button variant="primary" size="small" @click="copyToken">
            {{ copied ? '✓ Copied!' : 'Copy Token' }}
          </Button>
          <p class="text-xs text-white/58">
            Then run in Electron DevTools console: <code>__devAuthToken("PASTE_TOKEN_HERE")</code>
          </p>
        </div>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <span class="i-carbon-warning-filled text-4xl text-red-400" />
        <p class="text-base text-white/90">
          {{ t('auth.authFailed', 'Authentication failed') }}
        </p>
        <p class="text-sm text-red-300/90">
          {{ errorMessage }}
        </p>
        <Button variant="primary" size="lg" @click="goTo('/sign-in')">
          {{ t('auth.tryAgain', 'Try Again') }}
        </Button>
      </div>
    </div>

    <template #footer>
      <AuthLegalFooter />
    </template>
  </AuthVisualShell>
</template>
