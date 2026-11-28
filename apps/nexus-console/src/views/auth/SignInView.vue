<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { API_ROUTES, consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import { useSession } from '@/composables/useSession'
import { resolveSafeRedirectUrl } from '@/utils/redirect'
import {
  base64UrlToUint8Array,
  isWebAuthnSupported,
  serializeAssertionCredential,
} from '@/utils/webauthn'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSession()

const activeTab = ref<'email' | 'password' | 'passkey'>('email')
const email = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref<string | null>(
  typeof route.query.error_description === 'string'
    ? route.query.error_description
    : typeof route.query.error === 'string'
      ? route.query.error
      : null,
)

const redirectTarget = computed(() =>
  resolveSafeRedirectUrl(route.query.redirect_url ?? route.query.callbackUrl, '/dashboard'),
)

const webAuthnReady = computed(() => isWebAuthnSupported())

function startOAuth(provider: 'github' | 'linuxdo') {
  if (!hasWindow())
    return
  const endpoint = provider === 'github' ? API_ROUTES.auth.oauthGitHub : API_ROUTES.auth.oauthLinuxDo
  const url = `${endpoint}?callbackUrl=${encodeURIComponent(redirectTarget.value)}`
  window.location.assign(url)
}

async function handleEmailSignIn() {
  const trimmed = email.value.trim().toLowerCase()
  if (!trimmed)
    return
  submitting.value = true
  errorMessage.value = null
  try {
    await consoleApi.requestEmailSignIn({
      email: trimmed,
      callbackUrl: redirectTarget.value,
    })
    await router.push({
      path: '/verify-waiting',
      query: { email: trimmed, redirect_url: redirectTarget.value },
    })
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    submitting.value = false
  }
}

async function handlePasswordSignIn() {
  const trimmed = email.value.trim().toLowerCase()
  if (!trimmed || !password.value)
    return
  submitting.value = true
  errorMessage.value = null
  try {
    await consoleApi.signInWithPassword({
      email: trimmed,
      password: password.value,
      callbackUrl: redirectTarget.value,
    })
    await session.refresh()
    await router.replace(redirectTarget.value)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    submitting.value = false
  }
}

async function handlePasskeySignIn() {
  if (!webAuthnReady.value || !hasNavigator()) {
    errorMessage.value = t('auth.passkeyUnsupported')
    return
  }
  submitting.value = true
  errorMessage.value = null
  try {
    const rawOptions = await consoleApi.getPasskeyOptions(email.value.trim() || undefined)
    const allowList = Array.isArray(rawOptions.allowCredentials)
      ? rawOptions.allowCredentials.map((item: Record<string, unknown>) => ({
          id: base64UrlToUint8Array(String(item.id)),
          type: 'public-key' as const,
          transports: Array.isArray(item.transports) ? item.transports as AuthenticatorTransport[] : undefined,
        }))
      : undefined

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToUint8Array(String(rawOptions.challenge ?? '')),
        rpId: typeof rawOptions.rpId === 'string' ? rawOptions.rpId : undefined,
        timeout: typeof rawOptions.timeout === 'number' ? rawOptions.timeout : 60000,
        userVerification: (rawOptions.userVerification as UserVerificationRequirement) || 'preferred',
        ...(allowList ? { allowCredentials: allowList } : {}),
      },
    }) as PublicKeyCredential | null

    if (!credential)
      throw new Error(t('common.unknownError'))

    const verified = await consoleApi.verifyPasskey(serializeAssertionCredential(credential))
    await consoleApi.signInWithLoginToken({
      loginToken: verified.token,
      callbackUrl: redirectTarget.value,
    })
    await session.refresh()
    await router.replace(redirectTarget.value)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="SignInView">
    <div class="SignInView-Header">
      <h1 class="SignInView-Title">
{{ t('auth.signInTitle') }}
</h1>
      <p class="SignInView-Subtitle">
{{ t('auth.signInSubtitle') }}
</p>
    </div>

    <TxAlert
      v-if="errorMessage"
      type="error"
      :message="errorMessage"
      closable
      @close="errorMessage = null"
    />

    <div class="SignInView-OAuth">
      <TxButton
        variant="secondary"
        block
        icon="i-carbon-logo-github"
        :disabled="submitting"
        @click="startOAuth('github')"
      >
        {{ t('auth.continueWithGitHub') }}
      </TxButton>
      <TxButton
        variant="secondary"
        block
        icon="i-carbon-user-identification"
        :disabled="submitting"
        @click="startOAuth('linuxdo')"
      >
        {{ t('auth.continueWithLinuxDo') }}
      </TxButton>
    </div>

    <div class="SignInView-Divider">
      <span>{{ t('auth.orDivider') }}</span>
    </div>

    <TxTabs v-model="activeTab">
      <TxTabItem name="email">
        <template #name>
{{ t('auth.tabEmail') }}
</template>
        <form class="console-form-stack SignInView-Form" @submit.prevent="handleEmailSignIn">
          <ConsoleFormField :label="t('auth.emailLabel')" for-id="signin-email-link">
            <TuffInput
              id="signin-email-link"
              v-model="email"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.emailPlaceholder')"
              :disabled="submitting"
            />
          </ConsoleFormField>
          <TxButton
            variant="primary"
            native-type="submit"
            block
            :loading="submitting"
            :disabled="!email.trim()"
          >
            {{ t('auth.sendMagicLink') }}
          </TxButton>
        </form>
      </TxTabItem>

      <TxTabItem name="password">
        <template #name>
{{ t('auth.tabPassword') }}
</template>
        <form class="console-form-stack SignInView-Form" @submit.prevent="handlePasswordSignIn">
          <ConsoleFormField :label="t('auth.emailLabel')" for-id="signin-email-pw">
            <TuffInput
              id="signin-email-pw"
              v-model="email"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.emailPlaceholder')"
              :disabled="submitting"
            />
          </ConsoleFormField>
          <ConsoleFormField :label="t('auth.passwordLabel')" for-id="signin-password">
            <TuffInput
              id="signin-password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              :placeholder="t('auth.passwordPlaceholder')"
              :disabled="submitting"
            />
          </ConsoleFormField>
          <TxButton
            variant="primary"
            native-type="submit"
            block
            :loading="submitting"
            :disabled="!email.trim() || !password"
          >
            {{ t('auth.signInButton') }}
          </TxButton>
        </form>
      </TxTabItem>

      <TxTabItem name="passkey">
        <template #name>
{{ t('auth.tabPasskey') }}
</template>
        <form class="console-form-stack SignInView-Form" @submit.prevent="handlePasskeySignIn">
          <ConsoleFormField
            :label="t('auth.emailLabel')"
            :hint="t('auth.passkeyHint')"
            for-id="signin-passkey-email"
          >
            <TuffInput
              id="signin-passkey-email"
              v-model="email"
              type="email"
              autocomplete="username webauthn"
              :placeholder="t('auth.emailPlaceholder')"
              :disabled="submitting || !webAuthnReady"
            />
          </ConsoleFormField>
          <TxButton
            variant="primary"
            native-type="submit"
            block
            icon="i-carbon-password"
            :loading="submitting"
            :disabled="!webAuthnReady"
          >
            {{ t('auth.passkeyButton') }}
          </TxButton>
        </form>
      </TxTabItem>
    </TxTabs>
  </div>
</template>

<style scoped>
.SignInView {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.SignInView-Header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.SignInView-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.SignInView-Subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
  text-wrap: pretty;
}

.SignInView-OAuth {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.SignInView-Divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--tx-text-color-regular);
  font-size: 12px;
}

.SignInView-Divider::before,
.SignInView-Divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--tx-border-color-lighter);
}

.SignInView-Form {
  padding-top: 12px;
}
</style>
