<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'
import Logo from '~/components/icon/Logo.vue'

definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()

const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
const emailHint = computed(() => {
  if (!email.value)
    return t('auth.verifyWaitingSubtitle', 'We sent a verification link to your inbox.')
  return t('auth.verifyWaitingEmail', 'We sent a verification link to {email}.', { email: email.value })
})
</script>

<template>
  <div class="dark relative min-h-screen overflow-hidden bg-[#08080d] text-white">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(120,90,255,0.18),_transparent_55%)]" />
      <div class="absolute -left-40 top-[18%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,120,155,0.18),_transparent_70%)] blur-3xl" />
      <div class="absolute -right-48 bottom-[8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(88,190,255,0.2),_transparent_70%)] blur-3xl" />
    </div>

    <header class="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 pt-6 text-sm text-white/70">
      <Button variant="ghost" size="sm" class="auth-text-button auth-header-link" @click="navigateTo('/')">
        <span class="i-carbon-arrow-left" />
        <span>{{ t('auth.backToHome', '返回首页') }}</span>
      </Button>
      <LanguageToggle />
    </header>

    <main class="relative z-10 flex min-h-screen items-center justify-center px-6 py-20">
      <div class="w-full max-w-md text-center">
        <div class="flex flex-col items-center gap-5">
          <div class="flex size-14 items-center justify-center rounded-2xl bg-white/10 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur">
            <Logo class="text-[28px]" />
          </div>
          <div class="space-y-2">
            <h1 class="text-3xl font-semibold tracking-tight">
              {{ t('auth.verifyWaitingTitle', 'Check your inbox') }}
            </h1>
            <p class="text-sm text-white/60">
              {{ emailHint }}
            </p>
          </div>
        </div>

        <div class="mt-6 text-xs text-white/45">
          {{ t('auth.verifyWaitingTip', 'Didn’t see the email? Please check your spam folder.') }}
        </div>

        <div class="mt-8 flex flex-col gap-3">
          <Button class="auth-button auth-button--primary" size="lg" round block @click="navigateTo('/sign-in')">
            {{ t('auth.backToSignIn', '返回登录') }}
          </Button>
          <Button class="auth-button auth-button--ghost" size="lg" round block @click="navigateTo('/sign-in')">
            {{ t('auth.changeEmail', '更换邮箱') }}
          </Button>
        </div>
      </div>
    </main>

    <footer class="absolute bottom-6 left-0 right-0">
      <div class="mx-auto w-full max-w-6xl px-6 text-xs text-white/40">
        <div class="flex items-center justify-between">
          <span>{{ t('auth.copyright', '© 2026 Tuff. All rights reserved.') }}</span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" class="auth-footer-link" @click="navigateTo('/privacy')">
              {{ t('auth.privacyPolicy', 'Privacy Policy') }}
            </Button>
            <span class="text-white/20">·</span>
            <Button variant="ghost" size="sm" class="auth-footer-link" @click="navigateTo('/protocol')">
              {{ t('auth.termsOfService', 'Terms of Service') }}
            </Button>
          </div>
        </div>
        <div class="mt-2 text-center text-xs text-white/35">
          {{ t('auth.designedBy', 'Designed by TDesignS') }}
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.auth-button {
  height: 46px;
  font-size: 15px;
}

.auth-button--primary {
  background: #ffffff;
  color: #0b0b10;
  border-color: transparent;
  --tx-button-bg-color-hover: rgba(255, 255, 255, 0.9);
}

.auth-button--ghost {
  color: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  --tx-button-bg-color-hover: rgba(255, 255, 255, 0.08);
}

.auth-text-button {
  height: auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  --tx-button-bg-color-hover: transparent;
}

.auth-text-button:hover {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: underline;
}

.auth-header-link {
  color: rgba(255, 255, 255, 0.7);
  --tx-button-gap: 0.4rem;
}

.auth-footer-link {
  height: auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  --tx-button-bg-color-hover: transparent;
}

.auth-footer-link:hover {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: underline;
}
</style>
