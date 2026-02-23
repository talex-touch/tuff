<script setup lang="ts">
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

definePageMeta({
  layout: false,
})

type EmergencyScope = 'risk.mode.override' | 'risk.actor.unblock' | 'risk.case.review'

const runtimeConfig = useRuntimeConfig()
const riskControlEnabled = computed(() => runtimeConfig.public.experimentalFeatures?.riskControlEnabled === true)
watch(riskControlEnabled, (enabled) => {
  if (!enabled)
    navigateTo('/')
}, { immediate: true })

const adminHint = ref('')
const recoveryCode = ref('')
const sessionId = ref('')
const challenge = ref('')
const verifyNonce = ref('')
const emergencyToken = ref('')
const unblockActor = ref('')
const status = ref<'idle' | 'working' | 'success' | 'error'>('idle')
const message = ref('')
const verified = ref(false)
const selectedScopes = ref<EmergencyScope[]>([
  'risk.mode.override',
  'risk.actor.unblock',
  'risk.case.review',
])

const scopeOptions: Array<{ value: EmergencyScope, label: string }> = [
  { value: 'risk.mode.override', label: 'risk.mode.override' },
  { value: 'risk.actor.unblock', label: 'risk.actor.unblock' },
  { value: 'risk.case.review', label: 'risk.case.review' },
]

function setWorking(text: string) {
  status.value = 'working'
  message.value = text
}

function setError(error: any, fallback: string) {
  status.value = 'error'
  message.value = error?.data?.statusMessage || error?.message || fallback
}

function setSuccess(text: string) {
  status.value = 'success'
  message.value = text
}

function getDeviceFingerprint(): string {
  const key = 'nexus-admin-emergency-device-fingerprint'
  const cached = localStorage.getItem(key)
  if (cached)
    return cached
  const next = crypto.randomUUID()
  localStorage.setItem(key, next)
  return next
}

async function initEmergency() {
  try {
    setWorking('Creating emergency session...')
    const result = await $fetch<{
      session_id: string
      webauthn_challenge: string
      expires_at: string
    }>('/api/admin/emergency/init', {
      method: 'POST',
      body: {
        admin_hint: adminHint.value.trim() || null,
        device_fingerprint: getDeviceFingerprint(),
        client_nonce: crypto.randomUUID(),
      },
    })
    sessionId.value = result.session_id
    challenge.value = result.webauthn_challenge
    verified.value = false
    verifyNonce.value = ''
    emergencyToken.value = ''
    setSuccess(`Emergency session ready. Expires at ${result.expires_at}`)
  }
  catch (error) {
    setError(error, 'Failed to init emergency session.')
  }
}

async function verifyEmergency() {
  if (!sessionId.value || !challenge.value) {
    status.value = 'error'
    message.value = 'Please init an emergency session first.'
    return
  }
  if (!recoveryCode.value.trim()) {
    status.value = 'error'
    message.value = 'Recovery code is required.'
    return
  }

  try {
    setWorking('Requesting passkey assertion...')
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBuffer(challenge.value),
        timeout: 60_000,
        userVerification: 'required',
      },
    }) as PublicKeyCredential | null

    if (!credential) {
      status.value = 'error'
      message.value = 'Passkey cancelled.'
      return
    }

    setWorking('Verifying emergency factors...')
    const result = await $fetch<{
      verified: boolean
      admin_id: string
      verify_nonce: string
    }>('/api/admin/emergency/verify', {
      method: 'POST',
      body: {
        session_id: sessionId.value,
        passkey_assertion: serializeCredential(credential),
        recovery_code: recoveryCode.value.trim(),
      },
    })

    verified.value = result.verified
    verifyNonce.value = result.verify_nonce
    setSuccess(`Emergency factors verified for admin ${result.admin_id}.`)
  }
  catch (error) {
    setError(error, 'Failed to verify emergency factors.')
  }
}

async function issueEmergencyToken() {
  if (!verified.value || !verifyNonce.value || !sessionId.value) {
    status.value = 'error'
    message.value = 'Please complete emergency verify first.'
    return
  }
  if (selectedScopes.value.length === 0) {
    status.value = 'error'
    message.value = 'Select at least one scope.'
    return
  }

  try {
    setWorking('Issuing emergency token...')
    const result = await $fetch<{
      admin_emergency_token: string
      expires_at: string
      scope: EmergencyScope[]
    }>('/api/admin/emergency/issue', {
      method: 'POST',
      body: {
        session_id: sessionId.value,
        verify_nonce: verifyNonce.value,
        scope_request: selectedScopes.value,
      },
    })

    emergencyToken.value = result.admin_emergency_token
    setSuccess(`Emergency token issued. Expires at ${result.expires_at}`)
  }
  catch (error) {
    setError(error, 'Failed to issue emergency token.')
  }
}

async function unblockByToken() {
  if (!emergencyToken.value.trim()) {
    status.value = 'error'
    message.value = 'Emergency token is required.'
    return
  }
  if (!unblockActor.value.trim()) {
    status.value = 'error'
    message.value = 'Actor/IP is required.'
    return
  }

  try {
    setWorking('Submitting unblock action...')
    await $fetch('/api/admin/risk/actor.unblock', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emergencyToken.value.trim()}`,
        'X-Device-Fingerprint': getDeviceFingerprint(),
      },
      body: {
        actor: unblockActor.value.trim(),
        reason: 'manual emergency unblock',
      },
    })
    setSuccess(`Unblock submitted for ${unblockActor.value.trim()}.`)
  }
  catch (error) {
    setError(error, 'Failed to submit unblock.')
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f1318] text-white">
    <div class="mx-auto max-w-3xl p-6 md:p-10">
      <h1 class="mb-2 text-2xl font-semibold">
        Admin Emergency Console
      </h1>
      <p class="mb-8 text-sm text-white/70">
        Break-glass access for risk control plane (Passkey + Recovery Code).
      </p>

      <div class="space-y-6">
        <div class="rounded-lg border border-white/10 bg-white/5 p-4">
          <label class="mb-2 block text-xs text-white/70">Admin Hint (email or adminId, optional)</label>
          <input
            v-model="adminHint"
            type="text"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="admin@example.com"
          >
          <button class="mt-3 rounded-md bg-white px-4 py-2 text-sm text-black" @click="initEmergency">
            1) Init Emergency Session
          </button>
        </div>

        <div class="rounded-lg border border-white/10 bg-white/5 p-4">
          <label class="mb-2 block text-xs text-white/70">Recovery Code</label>
          <input
            v-model="recoveryCode"
            type="password"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="Recovery code"
          >
          <button class="mt-3 rounded-md bg-white px-4 py-2 text-sm text-black" @click="verifyEmergency">
            2) Verify (Passkey + Recovery Code)
          </button>
        </div>

        <div class="rounded-lg border border-white/10 bg-white/5 p-4">
          <p class="mb-2 text-xs text-white/70">
            Token Scopes
          </p>
          <div class="mb-3 grid gap-2 md:grid-cols-3">
            <label v-for="option in scopeOptions" :key="option.value" class="rounded border border-white/20 px-3 py-2 text-xs">
              <input
                v-model="selectedScopes"
                type="checkbox"
                class="mr-2"
                :value="option.value"
              >
              {{ option.label }}
            </label>
          </div>
          <button class="rounded-md bg-white px-4 py-2 text-sm text-black" @click="issueEmergencyToken">
            3) Issue Emergency Token
          </button>
          <textarea
            v-model="emergencyToken"
            rows="4"
            class="mt-3 w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-xs outline-none focus:border-white/50"
            placeholder="Emergency token will appear here"
          />
        </div>

        <div class="rounded-lg border border-white/10 bg-white/5 p-4">
          <label class="mb-2 block text-xs text-white/70">Actor/IP to unblock</label>
          <input
            v-model="unblockActor"
            type="text"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="1.2.3.4"
          >
          <button class="mt-3 rounded-md bg-emerald-400 px-4 py-2 text-sm text-black" @click="unblockByToken">
            4) Execute unblock with emergency token
          </button>
        </div>
      </div>

      <div class="mt-6 rounded-lg border px-4 py-3 text-sm" :class="status === 'error' ? 'border-red-400/60 bg-red-500/10 text-red-200' : status === 'success' ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200' : 'border-white/15 bg-white/5 text-white/80'">
        <strong class="mr-2 uppercase">{{ status }}</strong>
        <span>{{ message || 'Ready.' }}</span>
      </div>
    </div>
  </div>
</template>
