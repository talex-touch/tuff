<script setup lang="ts">
import { hasNavigator } from '@talex-touch/utils/env'
import { requestJson } from '~/utils/request'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

definePageMeta({
  layout: false,
})

type EmergencyScope = 'risk.mode.override' | 'risk.actor.unblock' | 'risk.case.review'

const adminHint = ref('')
const recoveryCode = ref('')
const sessionId = ref('')
const challenge = ref('')
const sessionExpiresAt = ref('')
const verifyNonce = ref('')
const emergencyToken = ref('')
const tokenExpiresAt = ref('')
const tokenScopes = ref<EmergencyScope[]>([])
const unblockActor = ref('')
const status = ref<'idle' | 'working' | 'success' | 'error'>('idle')
const message = ref('')
const verified = ref(false)
const pendingStep = ref<1 | 2 | 3 | 4 | null>(null)
const executeArmed = ref(false)

/**
 * Break-glass tokens authorise risk mutations, so the console asks for the
 * narrowest scope that still does the job and makes the operator widen it
 * deliberately.
 */
const selectedScopes = ref<EmergencyScope[]>(['risk.actor.unblock'])

const scopeOptions: Array<{ value: EmergencyScope, label: string, hint: string }> = [
  { value: 'risk.actor.unblock', label: 'risk.actor.unblock', hint: 'Clear risk blocks — the action this console can execute.' },
  { value: 'risk.mode.override', label: 'risk.mode.override', hint: 'Change the global defense mode.' },
  { value: 'risk.case.review', label: 'risk.case.review', hint: 'Raise or decide ban cases.' },
]

const nowMs = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (clockTimer)
    clearInterval(clockTimer)
})

function secondsLeft(isoValue: string): number | null {
  if (!isoValue)
    return null
  const expiry = Date.parse(isoValue)
  if (Number.isNaN(expiry))
    return null
  return Math.max(0, Math.floor((expiry - nowMs.value) / 1000))
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

const sessionSecondsLeft = computed(() => secondsLeft(sessionExpiresAt.value))
const tokenSecondsLeft = computed(() => secondsLeft(tokenExpiresAt.value))
const sessionExpired = computed(() => sessionSecondsLeft.value === 0)
const tokenExpired = computed(() => tokenSecondsLeft.value === 0)
const busy = computed(() => pendingStep.value !== null)

const verifyBlockedReason = computed(() => {
  if (!sessionId.value)
    return 'Start an emergency session first.'
  if (sessionExpired.value)
    return 'The emergency session expired. Start a new one.'
  if (!recoveryCode.value.trim())
    return 'Enter your recovery code.'
  return ''
})

const issueBlockedReason = computed(() => {
  if (!verified.value || !verifyNonce.value)
    return 'Complete passkey and recovery-code verification first.'
  if (sessionExpired.value)
    return 'The emergency session expired. Start a new one.'
  if (selectedScopes.value.length === 0)
    return 'Select at least one scope.'
  return ''
})

const executeBlockedReason = computed(() => {
  if (!emergencyToken.value.trim())
    return 'Issue an emergency token first.'
  if (tokenExpiresAt.value && tokenExpired.value)
    return 'The emergency token expired. Issue a new one.'
  if (tokenScopes.value.length > 0 && !tokenScopes.value.includes('risk.actor.unblock'))
    return 'The issued token does not carry the risk.actor.unblock scope.'
  if (!unblockActor.value.trim())
    return 'Enter the actor or IP to unblock.'
  return ''
})

/**
 * Failure text is written here rather than taken from the response. The runtime
 * credential policy reports missing configuration by naming the environment
 * variable in `statusMessage`, and Nitro attaches stack traces outside
 * production, so the server's own wording is not safe to display.
 */
const SERVER_MESSAGE_GUIDANCE: Record<string, string> = {
  'Admin break-glass is disabled.': 'Break-glass access is switched off in this environment.',
  'Invalid emergency init payload.': 'The console sent an incomplete session request. Reload the page and retry.',
  'Invalid emergency verify payload.': 'The console sent an incomplete verification. Reload the page and retry.',
  'Invalid emergency issue payload.': 'The console sent an incomplete token request. Reload the page and retry.',
  'Emergency session not available.': 'That emergency session no longer exists or has already been used. Start a new one.',
  'Emergency session expired.': 'The emergency session passed its ten-minute window. Start a new one.',
  'Emergency verification failed.': 'The passkey and recovery code were not accepted together. Both must belong to the same active administrator.',
  'Emergency session not verified.': 'This session has not completed verification yet.',
  'Emergency session verification mismatch.': 'This session was verified by a different attempt. Start again from step one.',
  'Emergency token device fingerprint missing.': 'The console could not present its device fingerprint. Reload the page and repeat the flow.',
  'Emergency token device mismatch.': 'This token was issued to a different browser profile. Tokens are bound to the device that requested them.',
  'Emergency token already used.': 'That emergency token has already been spent. Issue a new one.',
  'Insufficient admin scope.': 'The token does not carry the scope this action requires.',
  'Control plane restricted in EXTREME mode.': 'Defense mode is EXTREME and the control plane is refusing this path.',
  'Rate limited': 'Too many attempts in the current window. Wait for it to reset before retrying.',
  'actor or actors is required.': 'Enter an actor or IP address to unblock.',
  'No actor to unblock.': 'That value did not parse as a usable actor or IP address.',
  Unauthorized: 'The control plane rejected this request as unauthenticated.',
}

const STATUS_GUIDANCE: Record<number, string> = {
  400: 'The control plane rejected the request as invalid.',
  401: 'The control plane rejected these credentials.',
  403: 'The control plane refused this request.',
  404: 'That control-plane endpoint is not available in this environment.',
  429: 'Rate limited. Wait for the window to reset before retrying.',
  503: 'The control plane is restricted right now.',
}

function readStatusCode(error: unknown): number {
  const candidate = error as {
    statusCode?: unknown
    status?: unknown
    response?: { status?: unknown }
    data?: { statusCode?: unknown }
  } | null
  const values = [
    candidate?.statusCode,
    candidate?.status,
    candidate?.response?.status,
    candidate?.data?.statusCode,
  ]
  const found = values.find(value => typeof value === 'number' && value > 0)
  return typeof found === 'number' ? found : 0
}

function describeWebAuthnError(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name
  if (name === 'NotAllowedError')
    return 'The passkey prompt was dismissed or timed out. Retry and complete it on your authenticator.'
  if (name === 'SecurityError')
    return 'The browser refused the passkey request for this origin. Break-glass must be served over HTTPS on the registered domain.'
  if (name === 'NotSupportedError' || name === 'InvalidStateError')
    return 'This browser or authenticator cannot satisfy the passkey request.'
  return ''
}

function setError(error: unknown, fallback: string) {
  status.value = 'error'

  const webAuthnMessage = describeWebAuthnError(error)
  if (webAuthnMessage) {
    message.value = webAuthnMessage
    return
  }

  const httpStatus = readStatusCode(error)
  if (httpStatus === 0) {
    message.value = `${fallback} The request did not reach the control plane — check your connection.`
    return
  }

  const serverMessage = (error as { data?: { statusMessage?: unknown } } | null)?.data?.statusMessage
  const guidance = typeof serverMessage === 'string' ? SERVER_MESSAGE_GUIDANCE[serverMessage.trim()] : undefined
  if (guidance) {
    message.value = `${guidance} (HTTP ${httpStatus})`
    return
  }

  if (httpStatus >= 500) {
    message.value = `The control plane failed to handle this request (HTTP ${httpStatus}). The response is withheld here because these failures can name internal configuration; read the server logs for the cause.`
    return
  }

  message.value = `${STATUS_GUIDANCE[httpStatus] ?? fallback} (HTTP ${httpStatus})`
}

function setWorking(step: 1 | 2 | 3 | 4, text: string) {
  pendingStep.value = step
  status.value = 'working'
  message.value = text
}

function setSuccess(text: string) {
  status.value = 'success'
  message.value = text
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  // randomUUID needs a secure context; break-glass may be reached over plain
  // HTTP on an internal host, where a session-scoped value still keeps the
  // device binding stable for the length of the flow.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    crypto.getRandomValues(bytes)
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256) })
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

let memoryFingerprint = ''

function getDeviceFingerprint(): string {
  const key = 'nexus-admin-emergency-device-fingerprint'
  try {
    const cached = localStorage.getItem(key)
    if (cached)
      return cached
    const next = randomId()
    localStorage.setItem(key, next)
    return next
  }
  catch {
    // Private browsing and locked-down profiles can make localStorage throw.
    // The token is bound to whatever fingerprint init sent, so the fallback has
    // to stay stable for the rest of the page session.
    if (!memoryFingerprint)
      memoryFingerprint = randomId()
    return memoryFingerprint
  }
}

async function initEmergency() {
  if (busy.value)
    return
  try {
    setWorking(1, 'Creating emergency session...')
    const result = await requestJson<{
      session_id: string
      webauthn_challenge: string
      expires_at: string
    }>('/api/admin/emergency/init', {
      method: 'POST',
      body: {
        admin_hint: adminHint.value.trim() || null,
        device_fingerprint: getDeviceFingerprint(),
        client_nonce: randomId(),
      },
    })
    sessionId.value = result.session_id
    challenge.value = result.webauthn_challenge
    sessionExpiresAt.value = result.expires_at
    verified.value = false
    verifyNonce.value = ''
    emergencyToken.value = ''
    tokenExpiresAt.value = ''
    tokenScopes.value = []
    executeArmed.value = false
    setSuccess('Emergency session ready. Verify your passkey and recovery code within the countdown shown below.')
  }
  catch (error) {
    setError(error, 'Could not start an emergency session.')
  }
  finally {
    pendingStep.value = null
  }
}

async function verifyEmergency() {
  if (busy.value || verifyBlockedReason.value)
    return

  try {
    if (!hasNavigator() || !navigator.credentials?.get) {
      status.value = 'error'
      message.value = 'This browser does not expose the WebAuthn API. Break-glass verification needs a passkey-capable browser on a secure origin.'
      return
    }

    setWorking(2, 'Waiting for your passkey...')
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToBuffer(challenge.value),
        timeout: 60_000,
        userVerification: 'required',
      },
    }) as PublicKeyCredential | null

    if (!credential) {
      status.value = 'error'
      message.value = 'No passkey was returned. Retry and complete the prompt on your authenticator.'
      return
    }

    setWorking(2, 'Verifying emergency factors...')
    const result = await requestJson<{
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
    // The recovery code is single-use and has now been consumed.
    recoveryCode.value = ''
    setSuccess(`Verified as administrator ${result.admin_id}. That recovery code has been consumed and cannot be reused.`)
  }
  catch (error) {
    setError(error, 'Emergency verification did not complete.')
  }
  finally {
    pendingStep.value = null
  }
}

async function issueEmergencyToken() {
  if (busy.value || issueBlockedReason.value)
    return

  try {
    setWorking(3, 'Issuing emergency token...')
    const result = await requestJson<{
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
    tokenExpiresAt.value = result.expires_at
    tokenScopes.value = Array.isArray(result.scope) ? result.scope : []
    executeArmed.value = false
    setSuccess(`Emergency token issued for ${tokenScopes.value.join(', ') || 'no scope'}. It is valid once, until the countdown below runs out.`)
  }
  catch (error) {
    setError(error, 'Could not issue an emergency token.')
  }
  finally {
    pendingStep.value = null
  }
}

function armExecute() {
  if (executeBlockedReason.value || busy.value)
    return
  executeArmed.value = true
}

async function unblockByToken() {
  if (busy.value || executeBlockedReason.value)
    return

  const actor = unblockActor.value.trim()
  executeArmed.value = false
  try {
    setWorking(4, 'Submitting unblock action...')
    const result = await requestJson<{
      pending?: boolean
      pending_operation_id?: string
      total?: number
      successCount?: number
    }>('/api/admin/risk/actor.unblock', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${emergencyToken.value.trim()}`,
        'X-Device-Fingerprint': getDeviceFingerprint(),
      },
      body: {
        actor,
        reason: 'manual emergency unblock',
      },
    })

    // The token's jti is consumed by the guard whatever the outcome below.
    emergencyToken.value = ''
    tokenExpiresAt.value = ''
    tokenScopes.value = []

    if (result?.pending === true) {
      setSuccess(`Queued for a second approver — ${actor} is still blocked. Pending operation ${result.pending_operation_id ?? 'id unavailable'} must be confirmed by another administrator.`)
      return
    }

    const total = typeof result?.total === 'number' ? result.total : 1
    const succeeded = typeof result?.successCount === 'number' ? result.successCount : total
    if (succeeded < total) {
      status.value = 'error'
      message.value = `Only ${succeeded} of ${total} entries for ${actor} were cleared. The emergency token has been spent — issue a new one to retry.`
      return
    }
    setSuccess(`${actor} unblocked. The emergency token has been spent and cannot be reused.`)
  }
  catch (error) {
    setError(error, 'The unblock action did not complete.')
  }
  finally {
    pendingStep.value = null
  }
}

const statusLabel = computed(() => {
  if (status.value === 'working')
    return 'Working'
  if (status.value === 'success')
    return 'OK'
  if (status.value === 'error')
    return 'Failed'
  return 'Ready'
})
</script>

<template>
  <div class="min-h-screen bg-[#0f1318] text-white">
    <div class="mx-auto max-w-3xl p-6 md:p-10">
      <h1 class="mb-2 text-2xl font-semibold">
        Admin Emergency Console
      </h1>
      <p class="mb-2 text-sm text-white/70">
        Break-glass access to the risk control plane, using a passkey plus a recovery code.
      </p>
      <p class="mb-8 text-sm text-amber-200/80">
        Nothing on this page is saved. Reloading or closing the tab discards the session and any issued token, and you start again from step one.
      </p>

      <div class="space-y-6">
        <section class="rounded-lg border border-white/10 bg-white/5 p-4">
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <label for="emergency-admin-hint" class="text-xs text-white/70">Step 1 — Admin hint (email or admin id, optional)</label>
            <span v-if="sessionSecondsLeft !== null" class="text-xs" :class="sessionExpired ? 'text-red-300' : 'text-white/60'">
              {{ sessionExpired ? 'Session expired' : `Session expires in ${formatCountdown(sessionSecondsLeft)}` }}
            </span>
          </div>
          <input
            id="emergency-admin-hint"
            v-model="adminHint"
            type="text"
            autocomplete="off"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="admin@example.com"
          >
          <button
            type="button"
            class="mt-3 rounded-md bg-white px-4 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45"
            :disabled="busy"
            @click="initEmergency"
          >
            {{ pendingStep === 1 ? 'Starting session...' : 'Start emergency session' }}
          </button>
        </section>

        <section class="rounded-lg border border-white/10 bg-white/5 p-4">
          <label for="emergency-recovery-code" class="mb-2 block text-xs text-white/70">Step 2 — Recovery code</label>
          <input
            id="emergency-recovery-code"
            v-model="recoveryCode"
            type="password"
            autocomplete="one-time-code"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="Recovery code"
          >
          <button
            type="button"
            class="mt-3 rounded-md bg-white px-4 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45"
            :disabled="busy || verifyBlockedReason !== ''"
            @click="verifyEmergency"
          >
            {{ pendingStep === 2 ? 'Verifying...' : 'Verify passkey and recovery code' }}
          </button>
          <p v-if="verifyBlockedReason" class="mt-2 text-xs text-white/50">
            {{ verifyBlockedReason }}
          </p>
          <p v-else-if="verified" class="mt-2 text-xs text-emerald-300">
            Verified. Continue to step 3.
          </p>
        </section>

        <section class="rounded-lg border border-white/10 bg-white/5 p-4">
          <p class="mb-2 text-xs text-white/70">
            Step 3 — Token scopes
          </p>
          <div class="mb-3 grid gap-2 md:grid-cols-3">
            <label
              v-for="option in scopeOptions"
              :key="option.value"
              class="rounded border border-white/20 px-3 py-2 text-xs"
              :title="option.hint"
            >
              <input
                v-model="selectedScopes"
                type="checkbox"
                class="mr-2"
                :value="option.value"
              >
              {{ option.label }}
            </label>
          </div>
          <button
            type="button"
            class="rounded-md bg-white px-4 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45"
            :disabled="busy || issueBlockedReason !== ''"
            @click="issueEmergencyToken"
          >
            {{ pendingStep === 3 ? 'Issuing...' : 'Issue emergency token' }}
          </button>
          <p v-if="issueBlockedReason" class="mt-2 text-xs text-white/50">
            {{ issueBlockedReason }}
          </p>
          <div v-if="emergencyToken" class="mt-3">
            <div class="mb-1 flex items-baseline justify-between gap-3">
              <span class="text-xs text-white/70">Issued token</span>
              <span v-if="tokenSecondsLeft !== null" class="text-xs" :class="tokenExpired ? 'text-red-300' : 'text-white/60'">
                {{ tokenExpired ? 'Token expired' : `Token expires in ${formatCountdown(tokenSecondsLeft)}` }}
              </span>
            </div>
            <textarea
              v-model="emergencyToken"
              rows="4"
              readonly
              class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-xs outline-none focus:border-white/50"
            />
          </div>
        </section>

        <section class="rounded-lg border border-white/10 bg-white/5 p-4">
          <label for="emergency-unblock-actor" class="mb-2 block text-xs text-white/70">Step 4 — Actor or IP to unblock</label>
          <input
            id="emergency-unblock-actor"
            v-model="unblockActor"
            type="text"
            autocomplete="off"
            class="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/50"
            placeholder="1.2.3.4"
          >
          <template v-if="!executeArmed">
            <button
              type="button"
              class="mt-3 rounded-md bg-emerald-400 px-4 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45"
              :disabled="busy || executeBlockedReason !== ''"
              @click="armExecute"
            >
              {{ pendingStep === 4 ? 'Executing...' : 'Execute unblock with emergency token' }}
            </button>
            <p v-if="executeBlockedReason" class="mt-2 text-xs text-white/50">
              {{ executeBlockedReason }}
            </p>
          </template>
          <div v-else class="mt-3 rounded-md border border-amber-400/50 bg-amber-400/10 p-3">
            <p class="text-xs text-amber-100">
              This spends the emergency token and clears risk blocks for
              <strong>{{ unblockActor.trim() }}</strong>. The token cannot be reused afterwards.
            </p>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="rounded-md bg-emerald-400 px-4 py-2 text-sm text-black disabled:opacity-50"
                :disabled="busy"
                @click="unblockByToken"
              >
                Confirm unblock
              </button>
              <button
                type="button"
                class="rounded-md border border-white/25 bg-transparent px-4 py-2 text-sm text-white"
                @click="executeArmed = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      </div>

      <div
        class="mt-6 rounded-lg border px-4 py-3 text-sm"
        role="status"
        aria-live="polite"
        :class="status === 'error'
          ? 'border-red-400/60 bg-red-500/10 text-red-200'
          : status === 'success'
            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
            : 'border-white/15 bg-white/5 text-white/80'"
      >
        <strong class="mr-2">{{ statusLabel }}</strong>
        <span>{{ message || 'Waiting for step 1.' }}</span>
      </div>
    </div>
  </div>
</template>
