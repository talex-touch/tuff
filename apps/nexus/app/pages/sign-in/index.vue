<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import { TxSpinner } from '@talex-touch/tuffex'
import Logo from '~/components/icon/Logo.vue'
import Button from '~/components/ui/Button.vue'
import { useSignIn } from '~/composables/useSignIn'
import SignInBindEmailStep from './components/SignInBindEmailStep.vue'
import SignInEmailStep from './components/SignInEmailStep.vue'
import SignInLoginStep from './components/SignInLoginStep.vue'
import SignInOauthStep from './components/SignInOauthStep.vue'
import SignInPasskeyStep from './components/SignInPasskeyStep.vue'
import SignInSuccessStep from './components/SignInSuccessStep.vue'
import SignInStepCarousel from './components/SignInStepCarousel.vue'
import SignInSignupStep from './components/SignInSignupStep.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const {
  t,
  step,
  email,
  password,
  confirmPassword,
  bindEmail,
  loading,
  signupLoading,
  passkeyLoading,
  magicLoading,
  emailCheckLoading,
  bindLoading,
  magicSent,
  supportsPasskey,
  passkeyPhase,
  passkeyError,
  oauthFlow,
  oauthPhase,
  oauthProvider,
  oauthError,
  authLoading,
  lastLoginMethod,
  emailPreview,
  stepTitle,
  stepSubtitle,
  showTurnstile,
  turnstileState,
  forgotUrl,
  retryTurnstile,
  handleEmailNext,
  resetToEmailStep,
  handlePasswordSignIn,
  handleMagicLink,
  handleRegister,
  handleBindEmail,
  handleSkipBind,
  handleGithubSignIn,
  handleLinuxdoSignIn,
  handlePasskeySignIn,
  handleOauthRetry,
  handleOauthBack,
  handleHeaderBack,
} = useSignIn()

const hasClientTakenOver = ref(false)
const isPageBlocking = computed(() => !hasClientTakenOver.value)

onMounted(() => {
  hasClientTakenOver.value = true
})

function goTo(path: string) {
  return navigateTo(path)
}
</script>

<template>
  <ClientOnly>
    <Toaster position="bottom-right" :duration="4000" />
  </ClientOnly>

  <AuthVisualShell
    :loading="authLoading || isPageBlocking"
    :block-text="isPageBlocking ? t('auth.sessionBlocking', '正在处理登录，请稍候...') : ''"
  >
    <template #header>
      <AuthTopbar
        :back-label="t('auth.backToPrevious', '返回上一页')"
        @back="handleHeaderBack"
      />
    </template>

    <div class="auth-shell" :class="{ 'is-loading': authLoading || isPageBlocking }">
      <div class="auth-header">
        <div class="auth-logo">
          <Logo class="text-28" />
        </div>
        <div class="auth-heading">
          <SignInStepCarousel
            class="auth-carousel auth-carousel--header"
            :active-key="step"
            :duration="200"
            :distance="20"
            :height="false"
            :mask="false"
          >
            <div class="auth-heading__content">
              <h1 class="auth-title m-0">
                {{ stepTitle }}
              </h1>
              <p class="auth-subtitle">
                {{ stepSubtitle }}
              </p>
            </div>
          </SignInStepCarousel>
        </div>
      </div>

      <SignInStepCarousel
        class="auth-carousel"
        :active-key="step"
        :duration="260"
        :distance="36"
      >
        <div class="auth-step-shell">
          <div class="auth-form">
            <SignInEmailStep
              v-if="step === 'email'"
              key="email"
              v-model:email="email"
              :t="t"
              :last-login-method="lastLoginMethod"
              :passkey-loading="passkeyLoading"
              :email-check-loading="emailCheckLoading"
              :supports-passkey="supportsPasskey"
              @passkey="handlePasskeySignIn"
              @email-next="handleEmailNext"
              @github="handleGithubSignIn"
              @linuxdo="handleLinuxdoSignIn"
            />
            <SignInLoginStep
              v-else-if="step === 'login'"
              key="login"
              v-model:password="password"
              :t="t"
              :email-preview="emailPreview"
              :loading="loading"
              :magic-loading="magicLoading"
              :magic-sent="magicSent"
              @reset-email="resetToEmailStep"
              @forgot="goTo(forgotUrl)"
              @sign-in="handlePasswordSignIn"
              @magic-link="handleMagicLink"
            />
            <SignInPasskeyStep
              v-else-if="step === 'passkey'"
              key="passkey"
              :t="t"
              :phase="passkeyPhase"
              :error-message="passkeyError"
              @retry="handlePasskeySignIn"
              @back="resetToEmailStep"
            />
            <SignInOauthStep
              v-else-if="step === 'oauth'"
              key="oauth"
              :t="t"
              :provider="oauthProvider"
              :flow="oauthFlow"
              :phase="oauthPhase"
              :error-message="oauthError"
              @retry="handleOauthRetry"
              @back="handleOauthBack"
            />
            <SignInSuccessStep
              v-else-if="step === 'success'"
              key="success"
              :t="t"
            />
            <SignInSignupStep
              v-else-if="step === 'signup'"
              key="signup"
              v-model:password="password"
              v-model:confirm-password="confirmPassword"
              :t="t"
              :email-preview="emailPreview"
              :signup-loading="signupLoading"
              @reset-email="resetToEmailStep"
              @sign-up="handleRegister"
            />
            <SignInBindEmailStep
              v-else
              key="bind-email"
              v-model:bind-email="bindEmail"
              :t="t"
              :bind-loading="bindLoading"
              @bind="handleBindEmail"
              @skip="handleSkipBind"
            />
          </div>

          <div class="auth-footer">
            <div
              v-if="showTurnstile"
              class="auth-turnstile"
              :class="{ 'auth-turnstile--loading': turnstileState === 'loading' }"
            >
              <div id="turnstile-container" data-provider="cloudflare-turnstile" class="auth-turnstile-slot" />
              <div v-if="turnstileState !== 'ready'" class="auth-turnstile-overlay" :class="{ 'is-loading': turnstileState === 'loading' }">
                <TxSpinner :size="20" />
                <span class="auth-turnstile-label">
                  {{ turnstileState === 'loading' ? t('auth.turnstileLoading', '正在准备安全验证…') : t('auth.turnstilePending', '点击重试继续安全验证') }}
                </span>
                <Button v-if="turnstileState === 'error'" variant="ghost" size="sm" class="auth-turnstile-retry" @click="retryTurnstile">
                  {{ t('auth.retry', '重试') }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SignInStepCarousel>
    </div>

    <template #footer>
      <AuthLegalFooter :show-agreement="true" />
    </template>
  </AuthVisualShell>
</template>

<style scoped>
.auth-shell {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  text-align: center;
  margin-bottom: 4rem;
}

.auth-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.auth-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: auto;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.auth-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.auth-heading__content {
  display: flex;
  flex-direction: column;
}

.auth-title {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.auth-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.auth-form {
  margin-top: 4px;
  text-align: left;
  overflow: hidden;
}

.auth-step-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  position: relative;
}

:deep(.auth-step) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

:deep(.auth-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

:deep(.auth-divider) {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  color: rgba(255, 255, 255, 0.3);
}

:deep(.auth-divider__line) {
  height: 1px;
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
}

.auth-footer {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}

.auth-turnstile {
  position: relative;
  border-radius: 16px;
  border: 1px solid rgba(167, 204, 255, 0.22);
  background: linear-gradient(145deg, rgba(45, 63, 103, 0.34), rgba(16, 22, 36, 0.48));
  padding: 12px 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

.auth-turnstile--loading {
  border-color: rgba(168, 208, 255, 0.38);
  box-shadow: 0 0 0 1px rgba(131, 178, 255, 0.18) inset;
}

.auth-turnstile-slot {
  min-height: 70px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(8, 11, 20, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.auth-turnstile-slot iframe) {
  max-width: 100%;
}

.auth-turnstile-overlay {
  position: absolute;
  inset: 10px 12px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(10, 12, 22, 0.82);
  color: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(3px);
}

.auth-turnstile-overlay.is-loading::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.02) 25%, rgba(153, 212, 255, 0.24) 50%, rgba(255, 255, 255, 0.02) 75%);
  background-size: 220% 100%;
  animation: turnstile-shimmer 1.4s linear infinite;
}

.auth-turnstile-overlay > * {
  position: relative;
  z-index: 1;
}

.auth-turnstile-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.auth-turnstile-retry {
  height: auto;
  min-width: 0;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: rgba(167, 214, 255, 0.95);
  --tx-button-bg-color-hover: transparent;
}

:deep(.auth-turnstile-retry:hover) {
  text-decoration: underline;
}

@keyframes turnstile-shimmer {
  0% {
    background-position: 220% 0;
  }

  100% {
    background-position: -20% 0;
  }
}


.auth-carousel {
  width: 100%;
}

</style>
