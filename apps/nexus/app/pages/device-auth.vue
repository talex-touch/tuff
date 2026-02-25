<script setup lang="ts">
import { TxButton, TxSpinner } from '@talex-touch/tuffex'
import { hasNavigator } from '@talex-touch/utils/env'
import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()
const { status } = useAuth()

const state = ref<'loading' | 'ready' | 'approved' | 'expired' | 'cancelled' | 'error'>('loading')
const errorMessage = ref('')
const deviceName = ref('')
const devicePlatform = ref('')
const expiresAt = ref('')
const grantType = ref<'short' | 'long'>('short')
const longTermAvailable = ref(false)
const longTermAllowed = ref(true)
const longTermReason = ref<string | null>(null)
const autoCloseRequested = ref(false)
const longTermOptionEnabled = computed(() => longTermAvailable.value && longTermAllowed.value)
const reauthRequired = computed(() => grantType.value === 'long' && longTermOptionEnabled.value)
const reauthReady = computed(() => route.query.reauth === '1')
const authParam = computed(() => route.query.auth === 'long')
let presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null

const code = computed(() => {
  const query = route.query
  const direct = typeof query.code === 'string' ? query.code.trim() : ''
  if (direct)
    return direct
  const deviceCode = typeof query.device_code === 'string' ? query.device_code.trim() : ''
  if (deviceCode)
    return deviceCode
  const userCode = typeof query.user_code === 'string' ? query.user_code.trim() : ''
  return userCode
})

function buildRedirectUrl(target: 'long'): string {
  const params = new URLSearchParams()
  params.set('code', code.value)
  params.set('auth', target)
  params.set('reauth', '1')
  return `/device-auth?${params.toString()}`
}

async function requestReauth(): Promise<void> {
  await navigateTo({
    path: '/sign-in',
    query: {
      reason: 'reauth',
      force_reauth: '1',
      redirect_url: buildRedirectUrl('long'),
    },
  })
}

function requestCloseTab(): void {
  if (autoCloseRequested.value)
    return
  autoCloseRequested.value = true
  stopPresenceHeartbeat()
  void reportPresence('closed', true)
  setTimeout(() => {
    try {
      window.open('', '_self')
      window.close()
    }
    catch {
      window.close()
    }
  }, 400)
}

function stopPresenceHeartbeat(): void {
  if (!presenceHeartbeatTimer)
    return
  clearInterval(presenceHeartbeatTimer)
  presenceHeartbeatTimer = null
}

async function reportPresence(state: 'opened' | 'heartbeat' | 'closed', keepalive = false): Promise<void> {
  if (import.meta.server || !code.value)
    return
  const payload = JSON.stringify({
    code: code.value,
    state,
  })
  try {
    if (keepalive && hasNavigator() && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon('/api/app-auth/device/presence', new Blob([payload], { type: 'application/json' }))
      if (sent)
        return
    }
    await fetch('/api/app-auth/device/presence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: payload,
      keepalive,
    })
  }
  catch {
    // Ignore presence errors
  }
}

async function startPresenceHeartbeat(): Promise<void> {
  await reportPresence('opened')
  stopPresenceHeartbeat()
  presenceHeartbeatTimer = setInterval(() => {
    void reportPresence('heartbeat')
  }, 5000)
}

function handleBeforeUnload(): void {
  void reportPresence('closed', true)
}

async function ensureSession(): Promise<boolean> {
  if (status.value === 'authenticated')
    return true
  if (status.value === 'loading')
    return false
  await navigateTo({
    path: '/sign-in',
    query: {
      redirect_url: route.fullPath,
    },
  })
  return false
}

async function loadProfile() {
  const profile = await fetchCurrentUserProfile()
  const passkeyCount = profile?.passkeyCount ?? 0
  const hasPassword = profile?.hasPassword ?? false
  const linkedProviders = profile?.linkedProviders ?? []
  longTermAvailable.value = passkeyCount > 0 || hasPassword || linkedProviders.length > 0
  if (!longTermAvailable.value) {
    grantType.value = 'short'
  }
}

async function loadInfo() {
  if (!code.value) {
    state.value = 'error'
    errorMessage.value = t('auth.loginFailed', 'Invalid authorization code.')
    return
  }
  state.value = 'loading'
  try {
    const info = await $fetch<{
      status?: string
      grantType?: string
      deviceName?: string
      devicePlatform?: string
      expiresAt?: string
      longTermAllowed?: boolean
      longTermReason?: string | null
      ipMismatch?: boolean
      rejectReason?: string | null
      rejectMessage?: string | null
      requestIp?: string | null
      currentIp?: string | null
    }>('/api/app-auth/device/info', {
      query: { code: code.value },
    })
    if (info?.status === 'expired') {
      state.value = 'expired'
      requestCloseTab()
      return
    }
    if (info?.status === 'cancelled') {
      state.value = 'cancelled'
      requestCloseTab()
      return
    }
    if (info?.status === 'approved') {
      state.value = 'approved'
      requestCloseTab()
      return
    }
    if (info?.status === 'rejected') {
      state.value = 'error'
      if (info?.rejectReason === 'ip_mismatch') {
        errorMessage.value = t('auth.deviceAuthIpMismatch', '授权来源 IP 与设备 IP 不一致，已拒绝。')
      }
      else {
        errorMessage.value = info?.rejectMessage || t('auth.authFailed', '授权失败')
      }
      return
    }
    if (info?.ipMismatch) {
      state.value = 'error'
      errorMessage.value = t('auth.deviceAuthIpMismatch', '授权来源 IP 与设备 IP 不一致，已拒绝。')
      return
    }
    deviceName.value = info?.deviceName ?? ''
    devicePlatform.value = info?.devicePlatform ?? ''
    expiresAt.value = info?.expiresAt ?? ''
    if (info?.grantType === 'long')
      grantType.value = 'long'
    longTermAllowed.value = info?.longTermAllowed ?? true
    longTermReason.value = info?.longTermReason ?? null
    if (!longTermAllowed.value) {
      grantType.value = 'short'
    }
    state.value = 'ready'
  }
  catch (error: any) {
    state.value = 'error'
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Failed to load authorization request.'
  }
}

async function approve() {
  if (state.value !== 'ready')
    return
  if (reauthRequired.value && !reauthReady.value) {
    await requestReauth()
    return
  }
  state.value = 'loading'
  try {
    await $fetch('/api/app-auth/device/approve', {
      method: 'POST',
      body: { code: code.value, grantType: grantType.value },
    })
    state.value = 'approved'
    requestCloseTab()
  }
  catch (error: any) {
    state.value = 'error'
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Failed to approve device.'
  }
}

async function cancel() {
  if (state.value !== 'ready')
    return
  state.value = 'loading'
  try {
    await $fetch('/api/app-auth/device/cancel', {
      method: 'POST',
      body: { code: code.value },
    })
    state.value = 'cancelled'
    requestCloseTab()
  }
  catch (error: any) {
    state.value = 'error'
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Failed to cancel authorization.'
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  const ok = await ensureSession()
  if (ok) {
    await startPresenceHeartbeat()
    if (authParam.value)
      grantType.value = 'long'
    await Promise.all([loadInfo(), loadProfile()])
  }
})

watch(
  () => status.value,
  async (value) => {
    if (value === 'authenticated') {
      await startPresenceHeartbeat()
      await Promise.all([loadInfo(), loadProfile()])
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  stopPresenceHeartbeat()
  void reportPresence('closed', true)
})
</script>

<template>
  <AuthVisualShell :loading="state === 'loading'">
    <template #header>
      <AuthTopbar :back-label="t('auth.backToPrevious', '返回上一页')" @back="navigateTo('/')" />
    </template>

    <div class="mb-16 w-full max-w-md text-center">
      <div v-if="state === 'loading'" class="flex flex-col items-center gap-4">
        <TxSpinner :size="30" />
        <p class="text-base text-white/90">
          {{ t('auth.oauthVerifying', '正在处理授权请求...') }}
        </p>
      </div>

      <div v-else-if="state === 'expired'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-warning-filled text-4xl text-yellow-400" />
        <p class="text-base text-white/90">
          {{ t('auth.oauthCancelled', '授权已过期，请返回 CLI 重新发起。') }}
        </p>
      </div>

      <div v-else-if="state === 'approved'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-checkmark-filled text-4xl text-emerald-400" />
        <p class="text-base text-white/90">
          {{ t('auth.redirectSuccess', '授权成功，请返回 CLI。') }}
        </p>
      </div>

      <div v-else-if="state === 'cancelled'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-close-filled text-4xl text-yellow-400" />
        <p class="text-base text-white/90">
          {{ t('auth.oauthCancelled', '授权已取消，请返回 CLI 重新发起。') }}
        </p>
      </div>

      <div v-else-if="state === 'ready'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-login text-4xl text-cyan-300" />
        <p class="text-base text-white/90">
          {{ t('auth.oauthTitle', '正在连接第三方账号') }}
        </p>
        <p class="text-sm text-white/65">
          {{ deviceName || t('auth.deviceUnknown', '未知设备') }}
          <span v-if="devicePlatform"> · {{ devicePlatform }}</span>
        </p>
        <div class="flex w-full flex-col gap-2">
          <TxButton
            size="lg"
            :variant="grantType === 'short' ? 'primary' : 'secondary'"
            block
            @click="grantType = 'short'"
          >
            {{ t('auth.deviceAuthShort', '短期授权') }}
          </TxButton>
          <TxButton
            v-if="longTermOptionEnabled"
            size="lg"
            :variant="grantType === 'long' ? 'primary' : 'secondary'"
            block
            @click="grantType = 'long'"
          >
            {{ t('auth.deviceAuthLong', '长期授权') }}
          </TxButton>
        </div>
        <p v-if="longTermOptionEnabled" class="text-xs text-white/60">
          {{ t('auth.deviceAuthLongHint', '长期授权需要二次验证（密码 / Passkey / OAuth）') }}
        </p>
        <p v-else-if="longTermAvailable" class="text-xs text-yellow-200/90">
          {{ longTermReason || t('auth.deviceAuthLongBlocked', '当前设备或登录地不在常用范围，暂不允许长期授权。') }}
        </p>
        <div class="flex w-full gap-3">
          <TxButton variant="primary" size="lg" block @click="approve">
            {{ reauthRequired && !reauthReady ? t('auth.deviceAuthVerify', '继续验证') : t('common.confirm', '确认') }}
          </TxButton>
          <TxButton variant="ghost" size="lg" block @click="cancel">
            {{ t('common.cancel', '取消') }}
          </TxButton>
        </div>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <span class="i-carbon-warning-filled text-4xl text-red-400" />
        <p class="text-base text-white/90">
          {{ t('auth.authFailed', '授权失败') }}
        </p>
        <p class="text-sm text-red-300/90">
          {{ errorMessage }}
        </p>
      </div>
    </div>

    <template #footer>
      <AuthLegalFooter />
    </template>
  </AuthVisualShell>
</template>
