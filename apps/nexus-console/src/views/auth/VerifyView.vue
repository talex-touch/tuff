<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import { useSession } from '@/composables/useSession'
import { resolveSafeRedirectUrl } from '@/utils/redirect'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSession()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const token = ref(typeof route.query.token === 'string' ? route.query.token : '')
const submitting = ref(false)
const verified = ref(false)
const errorMessage = ref<string | null>(null)

async function submitVerification() {
  if (!email.value.trim() || !token.value.trim())
    return
  submitting.value = true
  errorMessage.value = null
  try {
    await consoleApi.verifyEmail({
      email: email.value.trim().toLowerCase(),
      token: token.value.trim(),
    })
    verified.value = true
    await session.refresh()
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    submitting.value = false
  }
}

function proceed() {
  const target = resolveSafeRedirectUrl(route.query.redirect_url, '/dashboard')
  void router.replace(target)
}

onMounted(() => {
  if (email.value && token.value)
    void submitVerification()
})
</script>

<template>
  <div class="VerifyView">
    <div class="VerifyView-Header">
      <h1 class="VerifyView-Title">
{{ t('auth.verifyTitle') }}
</h1>
      <p class="VerifyView-Subtitle">
{{ t('auth.verifySubtitle') }}
</p>
    </div>

    <TxAlert v-if="verified" type="success" :message="t('auth.verifySuccess')" />
    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <form v-if="!verified" class="console-form-stack" @submit.prevent="submitVerification">
      <ConsoleFormField :label="t('auth.emailLabel')" for-id="verify-email">
        <TuffInput
          id="verify-email"
          v-model="email"
          type="email"
          :placeholder="t('auth.emailPlaceholder')"
          :disabled="submitting"
        />
      </ConsoleFormField>
      <ConsoleFormField :label="t('auth.tokenLabel')" for-id="verify-token">
        <TuffInput
          id="verify-token"
          v-model="token"
          :placeholder="t('auth.tokenPlaceholder')"
          :disabled="submitting"
        />
      </ConsoleFormField>
      <TxButton
        variant="primary"
        native-type="submit"
        block
        :loading="submitting"
        :disabled="!email.trim() || !token.trim()"
      >
        {{ t('auth.verifyButton') }}
      </TxButton>
    </form>

    <TxButton v-else variant="primary" block @click="proceed">
      {{ t('app.backToDashboard') }}
    </TxButton>
  </div>
</template>

<style scoped>
.VerifyView {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.VerifyView-Header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.VerifyView-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.VerifyView-Subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
}
</style>
