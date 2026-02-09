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

function goTo(path: string) {
  return navigateTo(path)
}

function goBack() {
  return goTo('/')
}
</script>

<template>
  <AuthVisualShell>
    <template #header>
      <AuthTopbar
        :back-label="t('auth.backToPrevious', '返回上一页')"
        @back="goBack"
      />
    </template>

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
        <Button size="lg" round block @click="goTo('/sign-in')">
          {{ t('auth.backToSignIn', '返回登录') }}
        </Button>
        <Button variant="ghost" size="lg" round block @click="goTo('/sign-in')">
          {{ t('auth.changeEmail', '更换邮箱') }}
        </Button>
      </div>
    </div>

    <template #footer>
      <AuthLegalFooter />
    </template>
  </AuthVisualShell>
</template>

