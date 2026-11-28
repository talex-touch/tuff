<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API_ROUTES, consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { DeviceAuthInfoResponse } from '@/api/types'
import ConsoleFormField from '@/components/ConsoleFormField.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const code = ref(typeof route.query.code === 'string' ? route.query.code.trim() : '')
const info = ref<DeviceAuthInfoResponse | null>(null)
const grantType = ref<'short' | 'long'>('short')
const loading = ref(false)
const acting = ref(false)
const errorMessage = ref<string | null>(null)
const outcome = ref<'approved' | 'cancelled' | null>(null)

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let activeCode = ''

const grantOptions = computed(() => [
  { value: 'short', label: t('auth.grantShort') },
  {
    value: 'long',
    label: t('auth.grantLong'),
    disabled: !info.value?.longTermAllowed,
  },
])

function stopHeartbeat(sendClosed: boolean) {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (sendClosed && activeCode) {
    const payload = JSON.stringify({ code: activeCode, state: 'closed' })
    const beacon = hasNavigator() ? navigator.sendBeacon : undefined
    if (typeof beacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      beacon.call(navigator, API_ROUTES.deviceAuth.presence, blob)
    }
    else {
      void consoleApi.sendDeviceAuthPresence({ code: activeCode, state: 'closed' }).catch(() => {})
    }
    activeCode = ''
  }
}

function handlePageHide() {
  stopHeartbeat(true)
}

function startHeartbeat(targetCode: string) {
  stopHeartbeat(false)
  activeCode = targetCode
  void consoleApi.sendDeviceAuthPresence({ code: targetCode, state: 'opened' }).catch(() => {})
  heartbeatTimer = setInterval(() => {
    if (activeCode && !outcome.value)
      void consoleApi.sendDeviceAuthPresence({ code: activeCode, state: 'heartbeat' }).catch(() => {})
  }, 15000)
}

async function fetchDeviceInfo() {
  const trimmed = code.value.trim()
  if (!trimmed)
    return
  loading.value = true
  errorMessage.value = null
  outcome.value = null
  try {
    const res = await consoleApi.getDeviceAuthInfo(trimmed)
    info.value = res
    grantType.value = res.grantType === 'long' && res.longTermAllowed ? 'long' : 'short'
    if (res.status === 'pending')
      startHeartbeat(trimmed)
  }
  catch (cause) {
    info.value = null
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    loading.value = false
  }
}

async function approve() {
  const trimmed = code.value.trim()
  if (!trimmed)
    return
  acting.value = true
  errorMessage.value = null
  try {
    await consoleApi.approveDeviceAuth({ code: trimmed, grantType: grantType.value })
    outcome.value = 'approved'
    stopHeartbeat(false)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    acting.value = false
  }
}

async function cancelRequest() {
  const trimmed = code.value.trim()
  if (!trimmed)
    return
  acting.value = true
  errorMessage.value = null
  try {
    await consoleApi.cancelDeviceAuth({ code: trimmed })
    outcome.value = 'cancelled'
    stopHeartbeat(false)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    acting.value = false
  }
}

onMounted(() => {
  if (hasWindow())
    window.addEventListener('pagehide', handlePageHide)
  if (code.value)
    void fetchDeviceInfo()
})

onBeforeUnmount(() => {
  if (hasWindow())
    window.removeEventListener('pagehide', handlePageHide)
  stopHeartbeat(true)
})
</script>

<template>
  <div class="DeviceAuth">
    <div class="DeviceAuth-Header">
      <h1 class="DeviceAuth-Title">
{{ t('auth.deviceAuthTitle') }}
</h1>
      <p class="DeviceAuth-Subtitle">
{{ t('auth.deviceAuthSubtitle') }}
</p>
    </div>

    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />
    <TxAlert v-if="outcome === 'approved'" type="success" :message="t('auth.deviceApproved')" />
    <TxAlert v-else-if="outcome === 'cancelled'" type="info" :message="t('auth.deviceCancelled')" />

    <form v-if="!info && !loading" class="console-form-stack" @submit.prevent="fetchDeviceInfo">
      <ConsoleFormField :label="t('auth.deviceCodeLabel')" for-id="device-auth-code">
        <TuffInput
          id="device-auth-code"
          v-model="code"
          :placeholder="t('auth.deviceCodePlaceholder')"
          autocomplete="off"
        />
      </ConsoleFormField>
      <TxButton variant="primary" native-type="submit" block :disabled="!code.trim()">
        {{ t('auth.lookupDevice') }}
      </TxButton>
    </form>

    <div v-else-if="loading" class="console-form-stack" aria-busy="true">
      <TxSkeleton width="70%" :height="20" :radius="6" />
      <TxSkeleton width="100%" :height="48" :radius="10" />
      <TxSkeleton width="100%" :height="38" :radius="10" />
    </div>

    <div v-else-if="info && !outcome" class="console-form-stack">
      <TxAlert v-if="info.status === 'expired'" type="warning" :message="t('auth.deviceExpired')" />

      <div class="DeviceAuth-Details">
        <div class="DeviceAuth-Row">
          <span class="DeviceAuth-Key">{{ t('auth.deviceCodeLabel') }}</span>
          <span class="console-mono">{{ code }}</span>
        </div>
        <div class="DeviceAuth-Row">
          <span class="DeviceAuth-Key">{{ t('auth.deviceName') }}</span>
          <span>{{ info.deviceName || '—' }}</span>
        </div>
        <div class="DeviceAuth-Row">
          <span class="DeviceAuth-Key">{{ t('auth.devicePlatform') }}</span>
          <span>{{ info.devicePlatform || '—' }}</span>
        </div>
        <div class="DeviceAuth-Row">
          <span class="DeviceAuth-Key">{{ t('common.status') }}</span>
          <TxStatusBadge
            :text="info.status"
            :status="info.status === 'pending' ? 'warning' : info.status === 'approved' ? 'success' : 'muted'"
            size="sm"
          />
        </div>
      </div>

      <TxAlert
        v-if="info.ipMismatch"
        type="error"
        :message="t('auth.ipMismatchBlocked', { requestIp: info.requestIp || '?', currentIp: info.currentIp || '?' })"
      />
      <TxAlert
        v-else-if="info.ipMismatchWarning"
        type="warning"
        :message="t('auth.ipMismatchWarn', { requestIp: info.requestIp || '?', currentIp: info.currentIp || '?' })"
      />

      <ConsoleFormField
        v-if="info.status === 'pending'"
        :label="t('auth.grantDuration')"
        :hint="!info.longTermAllowed && info.longTermReason ? t('auth.longTermUnavailable', { reason: info.longTermReason }) : undefined"
      >
        <TxSelect v-model="grantType" :options="grantOptions" />
      </ConsoleFormField>

      <div v-if="info.status === 'pending'" class="DeviceAuth-Actions">
        <TxButton
          variant="primary"
          block
          :loading="acting"
          :disabled="Boolean(info.ipMismatch)"
          @click="approve"
        >
          {{ t('auth.approveDevice') }}
        </TxButton>
        <TxButton variant="secondary" block :disabled="acting" @click="cancelRequest">
          {{ t('auth.cancelDevice') }}
        </TxButton>
      </div>
    </div>

    <TxButton v-if="outcome" variant="secondary" block @click="router.push('/dashboard')">
      {{ t('app.backToDashboard') }}
    </TxButton>
  </div>
</template>

<style scoped>
.DeviceAuth {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.DeviceAuth-Header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.DeviceAuth-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.DeviceAuth-Subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
}

.DeviceAuth-Details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
}

.DeviceAuth-Row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.DeviceAuth-Key {
  color: var(--tx-text-color-regular);
}

.DeviceAuth-Actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
