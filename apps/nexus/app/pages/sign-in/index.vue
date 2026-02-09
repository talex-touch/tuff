<script setup lang="ts">
import { TxSpinner } from '@talex-touch/tuffex'
import { Toaster } from 'vue-sonner'
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
import TouchAurora from '~/components/tuff/background/TouchAurora.vue'

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
} = useSignIn()

function goTo(path: string) {
  return navigateTo(path)
}
</script>

<template>
  <div class="dark relative min-h-screen overflow-hidden bg-[#08080d] text-white" :class="{ 'is-loading': authLoading }">
    <div class="pointer-events-none absolute inset-0">
      <div class="auth-glow auth-glow--top absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(120,90,255,0.18),_transparent_55%)]" />
      <div class="auth-glow auth-glow--left absolute -left-40 top-[18%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,120,155,0.18),_transparent_70%)] blur-3xl" />
      <div class="auth-glow auth-glow--right absolute -right-48 bottom-[8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(88,190,255,0.2),_transparent_70%)] blur-3xl" />
      <TouchAurora
        :color-stops="['#574BDD', '#8727CE', '#057CCF']"
        :amplitude="1.0"
        :blend="0.5"
        :speed="1.0"
        :intensity="1.0"
        class="op-10 -scale-100"
      />
    </div>

    <ClientOnly>
      <Toaster position="bottom-right" :duration="4000" />
    </ClientOnly>

    <header class="auth-topbar">
      <Button variant="ghost" size="sm" class="auth-text-button auth-header-link" @click="goTo('/')">
        <span class="i-carbon-arrow-left" />
        <span>{{ t('auth.backToHome', '返回首页') }}</span>
      </Button>
      <LanguageToggle />
    </header>

    <main class="auth-main">
      <div class="auth-shell" :class="{ 'is-loading': authLoading }">
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
                @back="resetToEmailStep"
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
    </main>

    <footer class="absolute bottom-6 left-0 right-0">
      <div class="w-full px-6 text-xs text-white/40">
        <div class="auth-footer-row">
          <span>{{ t('auth.copyright', '© 2026 Tuff. All rights reserved.') }}</span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" class="auth-footer-link" @click="goTo('/privacy')">
              {{ t('auth.privacyPolicy', 'Privacy Policy') }}
            </Button>
            <span class="text-white/20">·</span>
            <Button variant="ghost" size="sm" class="auth-footer-link" @click="goTo('/protocol')">
              {{ t('auth.termsOfService', 'Terms of Service') }}
            </Button>
          </div>
        </div>
        <div class="auth-footer-meta">
          <div class="text-xs text-white/35">
          {{ t('auth.designedBy', 'Designed by TDesignS') }}
          </div>
          <div class="auth-legal">
            <span>{{ t('auth.loginAgreementPrefix', 'By logging in, you agree to') }}</span>
            <Button variant="ghost" size="sm" class="auth-link-button" @click="goTo('/protocol')">
              {{ t('auth.termsOfService', 'Terms of Service') }}
            </Button>
            <span>{{ t('auth.loginAgreementAnd', 'and') }}</span>
            <Button variant="ghost" size="sm" class="auth-link-button" @click="goTo('/privacy')">
              {{ t('auth.privacyPolicy', 'Privacy Policy') }}
            </Button>
            <span>.</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.auth-topbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 40;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.auth-glow {
  animation: auth-float 18s ease-in-out infinite;
  animation-play-state: paused;
}

.auth-glow--left {
  animation-duration: 22s;
}

.auth-glow--right {
  animation-duration: 26s;
}

.auth-glow--top {
  animation-duration: 20s;
}

.is-loading .auth-glow {
  animation-play-state: running;
}

.auth-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 16px;
  line-height: 1.2;
}

.auth-footer-meta {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.auth-legal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.55);
}

.auth-main {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
}

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

:deep(.auth-input.tx-input) {
  height: 46px;
  padding: 0 16px;
  border-radius: 12px;
}

:deep(.auth-input) :deep(.tx-input__inner) {
  font-size: 15px;
}

:deep(.auth-button) {
  height: 46px;
  font-size: 15px;
}

:deep(.auth-button--primary) {
  color: rgba(245, 250, 255, 0.96);
  border-color: rgba(148, 188, 255, 0.5);
  background: linear-gradient(135deg, #65b8ff 0%, #4a84ff 55%, #5f72ff 100%);
  box-shadow: 0 10px 24px rgba(51, 114, 255, 0.28);
  --tx-button-bg-color-hover: rgba(110, 168, 255, 0.92);
}

:deep(.auth-button--primary:hover:not(.disabled):not(.loading)) {
  color: rgba(245, 250, 255, 0.98);
  background: linear-gradient(135deg, #73c1ff 0%, #5a8eff 55%, #6b7eff 100%);
}

:deep(.auth-button--primary.loading),
:deep(.auth-button--primary.disabled),
:deep(.auth-button--primary[disabled]) {
  color: rgba(235, 245, 255, 0.95);
  border-color: rgba(137, 177, 236, 0.42);
  background: rgba(89, 122, 176, 0.74);
  box-shadow: none;
}

:deep(.auth-button--passkey) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.18);
  --tx-button-bg-color-hover: rgba(255, 255, 255, 0.18);
  --tx-button-gap: 0.6rem;
}

:deep(.auth-button--ghost) {
  color: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  --tx-button-bg-color-hover: rgba(255, 255, 255, 0.08);
}

:deep(.auth-text-button) {
  height: auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  --tx-button-bg-color-hover: transparent;
}

:deep(.auth-text-button:hover) {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: underline;
}

.auth-header-link {
  color: rgba(255, 255, 255, 0.7);
  --tx-button-gap: 0.4rem;
}

:deep(.auth-link-button) {
  height: auto;
  min-width: 0;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  --tx-button-bg-color-hover: transparent;
}

:deep(.auth-link-button:hover) {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: underline;
}

:deep(.auth-footer-link) {
  height: auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  --tx-button-bg-color-hover: transparent;
}

:deep(.auth-footer-link:hover) {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: underline;
}

@keyframes auth-float {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(12px, -18px, 0) scale(1.04);
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
}
</style>
