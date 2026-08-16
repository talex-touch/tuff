<script setup lang="ts">
import Logo from '~/components/icon/Logo.vue'
import { useSignIn } from '~/composables/useSignIn'
import SignInBindEmailStep from './components/SignInBindEmailStep.vue'
import SignInEmailStep from './components/SignInEmailStep.vue'
import SignInOauthStep from './components/SignInOauthStep.vue'
import SignInPasskeyStep from './components/SignInPasskeyStep.vue'
import SignInSuccessStep from './components/SignInSuccessStep.vue'
import SignInStepCarousel from './components/SignInStepCarousel.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const {
  t,
  step,
  email,
  bindEmail,
  passkeyLoading,
  emailCheckLoading,
  bindLoading,
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
  handleEmailNext,
  resetToEmailStep,
  handleBindEmail,
  handleSkipBind,
  handleGithubSignIn,
  handleLinuxdoSignIn,
  handlePasskeySignIn,
  handleOauthRetry,
  handleOauthBack,
  handleHeaderBack,
} = useSignIn()

const pageTitle = computed(() => t('auth.signInTitle', 'Sign in'))
useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: computed(() => t('auth.signInDescription', 'Sign in to Tuff Nexus to manage devices, plugins, and updates.')),
})

const isCallbackBlocking = computed(() => step.value === 'oauth' && authLoading.value)

</script>

<template>
  <AuthVisualShell
    :loading="authLoading"
    :block-text="isCallbackBlocking ? t('auth.sessionBlocking', '正在处理登录，请稍候...') : ''"
  >
    <template #header>
      <AuthTopbar
        :back-label="t('auth.backToPrevious', '返回上一页')"
        @back="handleHeaderBack"
      />
    </template>

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
              <p v-if="stepSubtitle" class="auth-subtitle">
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

:deep(.auth-row__email) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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



.auth-carousel {
  width: 100%;
}

</style>
