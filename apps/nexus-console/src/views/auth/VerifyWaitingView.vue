<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import { resolveSafeRedirectUrl } from '@/utils/redirect'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
const resending = ref(false)
const resent = ref(false)
const errorMessage = ref<string | null>(null)

async function resend() {
  if (!email.value)
    return
  resending.value = true
  resent.value = false
  errorMessage.value = null
  try {
    await consoleApi.requestEmailSignIn({
      email: email.value,
      callbackUrl: resolveSafeRedirectUrl(route.query.redirect_url, '/dashboard'),
    })
    resent.value = true
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    resending.value = false
  }
}
</script>

<template>
  <div class="VerifyWaiting">
    <h1 class="VerifyWaiting-Title">
{{ t('auth.verifyWaitingTitle') }}
</h1>
    <p class="VerifyWaiting-Desc">
{{ t('auth.verifyWaitingDesc') }}
</p>
    <p v-if="email" class="console-mono VerifyWaiting-Email">
{{ email }}
</p>

    <TxAlert v-if="resent" type="success" :message="t('auth.sendMagicLink')" />
    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <div class="VerifyWaiting-Actions">
      <TxButton v-if="email" variant="primary" block :loading="resending" @click="resend">
        {{ t('auth.resendLink') }}
      </TxButton>
      <TxButton variant="secondary" block @click="router.push('/sign-in')">
        {{ t('auth.backToSignIn') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.VerifyWaiting {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.VerifyWaiting-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.VerifyWaiting-Desc {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
  text-wrap: pretty;
}

.VerifyWaiting-Email {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
}

.VerifyWaiting-Actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
