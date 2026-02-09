<script setup lang="ts">
import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const { status: sessionStatus } = useAuth()

const status = ref<'idle' | 'verifying' | 'success' | 'error'>('idle')
const errorMessage = ref('')
const stepUpToken = ref('')
const showDevMode = ref(false)
const copied = ref(false)

const APP_SCHEMA = 'tuff'
const isDev = import.meta.dev

async function startStepUp() {
  if (status.value === 'verifying')
    return

  try {
    if (sessionStatus.value !== 'authenticated') {
      errorMessage.value = t('auth.notSignedIn', 'You are not signed in.')
      status.value = 'error'
      return
    }

    status.value = 'verifying'
    errorMessage.value = ''

    const me = await fetchCurrentUserProfile()
    const email = typeof me?.email === 'string' ? me.email : ''

    const options = await $fetch<any>(
      '/api/passkeys/options',
      email ? { query: { email } } : undefined,
    )

    const allowCredentials = Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: base64UrlToBuffer(cred.id),
        }))
      : undefined

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: base64UrlToBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      ...(allowCredentials ? { allowCredentials } : {}),
    }

    const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
    if (!credential) {
      errorMessage.value = t('auth.passkeyCancelled', 'Passkey cancelled.')
      status.value = 'error'
      return
    }

    const payload = serializeCredential(credential)
    const { token } = await $fetch<{ token: string }>('/api/passkeys/verify', {
      method: 'POST',
      body: { credential: payload },
    })

    stepUpToken.value = token
    status.value = 'success'

    const params = new URLSearchParams()
    params.set('login_token', token)
    const callbackUrl = `${APP_SCHEMA}://auth/stepup?${params.toString()}`
    window.location.href = callbackUrl

    if (isDev) {
      setTimeout(() => {
        showDevMode.value = true
      }, 2000)
    }
  }
  catch (error) {
    console.error('[StepUpCallback] Error:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unknown error'
    status.value = 'error'
  }
}

async function copyToken() {
  if (stepUpToken.value) {
    await navigator.clipboard.writeText(stepUpToken.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-white px-4 py-16 dark:bg-gray-900">
    <div class="w-full max-w-md text-center">
      <!-- Idle -->
      <div v-if="status === 'idle'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-two-factor-authentication text-4xl text-primary" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.stepUpTitle', 'Verify with Passkey to continue') }}
        </p>
        <Button class="mt-2" @click="startStepUp">
          {{ t('auth.stepUpStart', 'Verify Now') }}
        </Button>
      </div>

      <!-- Loading -->
      <div v-else-if="status === 'verifying'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-circle-dash animate-spin text-4xl text-primary" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.stepUpVerifying', 'Verifying...') }}
        </p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'" class="flex flex-col items-center gap-4">
        <span class="i-carbon-checkmark-filled text-4xl text-green-500" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.stepUpSuccess', 'Verification successful! Returning to Tuff...') }}
        </p>
        <p class="text-sm text-gray-400">
          {{ t('auth.manualOpen', 'If the app does not open automatically, please open Tuff manually.') }}
        </p>

        <div v-if="showDevMode" class="mt-6 w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p class="mb-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            🔧 Dev Mode: Protocol handler may not work
          </p>
          <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Copy the token and paste it in the app when prompted:
          </p>
          <code class="mb-3 block max-h-20 overflow-auto break-all rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
            {{ stepUpToken }}
          </code>
          <Button size="small" variant="warning" @click="copyToken">
            {{ copied ? '✓ Copied!' : 'Copy Token' }}
          </Button>
        </div>
      </div>

      <!-- Error -->
      <div v-else class="flex flex-col items-center gap-4">
        <span class="i-carbon-warning-filled text-4xl text-red-500" />
        <p class="text-gray-600 dark:text-gray-300">
          {{ t('auth.stepUpFailed', 'Verification failed') }}
        </p>
        <p class="text-sm text-red-400">
          {{ errorMessage }}
        </p>
        <Button class="mt-4" @click="status = 'idle'">
          {{ t('auth.tryAgain', 'Try Again') }}
        </Button>
      </div>
    </div>
  </div>
</template>
