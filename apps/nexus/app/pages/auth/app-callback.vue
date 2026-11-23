<script setup lang="ts">
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const { status: sessionStatus, getSession } = useNexusAuth()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const callbackInFlight = ref(false)
const sessionToken = ref('')
const showDevMode = ref(false)
const copied = ref(false)
const protocolAttempted = ref(false)
const autoCloseScheduled = ref(false)
let callbackGuardTimer: ReturnType<typeof setTimeout> | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

const APP_SCHEMA = 'tuff'
const SESSION_FETCH_TIMEOUT_MS = 4500
const CALLBACK_BOOTSTRAP_GUARD_MS = 2500
const CALLBACK_FALLBACK_DELAY_MS = 4000
const CALLBACK_AUTO_CLOSE_DELAY_MS = 12000

function hasActiveSession(session: unknown) {
  const user = (session as { user?: unknown } | null | undefined)?.user
  return Boolean(user)
}

async function getSessionWithTimeout() {
  return await Promise.race([
    getSession().catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), SESSION_FETCH_TIMEOUT_MS)),
  ])
}

async function ensureAuthenticatedSession() {
  const firstSession = await getSessionWithTimeout()
  if (hasActiveSession(firstSession))
    return true

  if (!hasSessionHint())
    return false

  await new Promise(resolve => setTimeout(resolve, 200))

  const secondSession = await getSessionWithTimeout()
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

    const headers: Record<string, string> = {
      'x-device-client': 'app',
    }
    if (deviceId)
      headers['x-device-id'] = deviceId
    if (deviceName)
      headers['x-device-name'] = deviceName
    if (devicePlatform)
      headers['x-device-platform'] = devicePlatform

    const data = await requestJson<{
      appToken?: string | null
      refreshToken?: string | null
      ttlSeconds?: number | null
    }>('/api/app-auth/sign-in-token', {
      method: 'POST',
      headers,
      credentials: 'include',
    })

    if (!data?.appToken || !data.refreshToken) {
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      errorMessage.value = t('auth.tokenFailed', 'Failed to get authentication token.')
      status.value = 'error'
      return
    }

    const appToken = data.appToken
    const refreshToken = data.refreshToken
    await ensureCallbackProcessingFeedback(callbackStartedAt)
    sessionToken.value = appToken
    status.value = 'success'

    // Redirect to app with the access token and its refresh credential.
    const params = new URLSearchParams()
    params.set('app_token', appToken)
    params.set('refresh_token', refreshToken)
    if (typeof data.ttlSeconds === 'number' && Number.isFinite(data.ttlSeconds) && data.ttlSeconds > 0)
      params.set('ttl_seconds', String(Math.floor(data.ttlSeconds)))
    const callbackUrl = `${APP_SCHEMA}://auth/callback?${params.toString()}`
    protocolAttempted.value = true
    window.location.href = callbackUrl

    fallbackTimer = setTimeout(() => {
      showDevMode.value = true
    }, CALLBACK_FALLBACK_DELAY_MS)
    scheduleAutoClose()
  }
  catch (error: any) {
    await ensureCallbackProcessingFeedback(callbackStartedAt)

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

function cancelFallbackPrompt() {
  showDevMode.value = false
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

function scheduleAutoClose() {
  if (autoCloseScheduled.value)
    return
  autoCloseScheduled.value = true
  autoCloseTimer = setTimeout(() => {
    window.close()
  }, CALLBACK_AUTO_CLOSE_DELAY_MS)
}

function cancelAutoClose() {
  autoCloseScheduled.value = false
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

function requestCloseTab() {
  cancelFallbackPrompt()
  cancelAutoClose()
  window.close()
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
  void handleCallback()
  callbackGuardTimer = setTimeout(() => {
    if (status.value !== 'loading')
      return
    void handleCallback()
  }, CALLBACK_BOOTSTRAP_GUARD_MS)
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

onUnmounted(() => {
  if (callbackGuardTimer) {
    clearTimeout(callbackGuardTimer)
    callbackGuardTimer = null
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
})
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
      <div v-if="status === 'loading'" class="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <span class="app-callback-spinner" aria-hidden="true" />
        <p class="text-base text-white/90">
          {{ t('auth.callbackProcessing', '正在处理登录回调，请稍候…') }}
        </p>
      </div>

      <div v-else-if="status === 'success'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-checkmark-filled text-4xl text-emerald-400" />
        <p class="text-base text-white/90 m-0">
          {{ t('auth.redirectSuccess', 'Authentication successful! Opening Tuff...') }}
        </p>
        <p class="text-sm text-white/65 m-0">
          {{ t('auth.manualOpen', 'If the app does not open automatically, please open Tuff manually.') }}
        </p>

        <div v-if="showDevMode" class="w-full space-y-2 text-center">
          <p class="text-sm text-amber-200/95">
            {{ t('auth.appCallbackFallbackTitle', '如果 Tuff 没有自动完成登录，请保持本页打开并重试，或复制 token 手动完成。') }}
          </p>
          <code class="block max-h-24 overflow-auto break-all text-xs text-white/85">{{ sessionToken }}</code>
          <div class="flex justify-center gap-2">
            <button type="button" class="app-callback-btn app-callback-btn--primary app-callback-btn--sm" @click="copyToken">
              {{ copied ? '✓ Copied!' : 'Copy Token' }}
            </button>
            <button type="button" class="app-callback-btn app-callback-btn--ghost app-callback-btn--sm" @click="requestCloseTab">
              {{ t('common.close', '关闭') }}
            </button>
          </div>
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
        <button type="button" class="app-callback-btn app-callback-btn--primary app-callback-btn--lg" @click="goTo('/sign-in')">
          {{ t('auth.tryAgain', 'Try Again') }}
        </button>
      </div>
    </div>

    <template #footer>
      <AuthLegalFooter />
    </template>
  </AuthVisualShell>
</template>

<style scoped>
.app-callback-spinner {
  width: 30px;
  height: 30px;
  border: 2.5px solid rgba(255, 255, 255, 0.22);
  border-top-color: #fff;
  border-radius: 999px;
  animation: app-callback-spin 0.8s linear infinite;
}

@keyframes app-callback-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-callback-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}

.app-callback-btn:focus-visible {
  outline: 2px solid rgba(167, 139, 250, 0.8);
  outline-offset: 2px;
}

.app-callback-btn--sm {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
}

.app-callback-btn--lg {
  height: 44px;
  padding: 0 22px;
  font-size: 14px;
}

.app-callback-btn--primary {
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: #fff;
  color: #09090b;
  font-weight: 600;
}

.app-callback-btn--primary:hover {
  background: rgba(255, 255, 255, 0.9);
}

.app-callback-btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.app-callback-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
