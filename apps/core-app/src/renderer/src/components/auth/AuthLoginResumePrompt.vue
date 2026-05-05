<script lang="ts" setup>
import { TModal, TuffInput, TxButton } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type PromptAction =
  | { action: 'manual'; token: string }
  | { action: 'retry' | 'cancel'; token?: string }

const emit = defineEmits<{
  (e: 'action', payload: PromptAction): void
}>()

const visible = ref(true)
const tokenInput = ref('')
const trimmedToken = computed(() => tokenInput.value.trim())
const { t } = useI18n()

function closeWithAction(payload: PromptAction) {
  visible.value = false
  emit('action', payload)
}

function handleManualSubmit() {
  if (!trimmedToken.value) return
  closeWithAction({ action: 'manual', token: trimmedToken.value })
}

function handleClose() {
  closeWithAction({ action: 'cancel' })
}
</script>

<template>
  <TModal
    v-model="visible"
    :title="t('auth.loginResumePrompt.title')"
    width="560px"
    @close="handleClose"
  >
    <div class="AuthLoginResumePrompt">
      <p class="AuthLoginResumePrompt-Description">
        {{ t('auth.loginResumePrompt.description') }}
      </p>
      <TuffInput
        v-model="tokenInput"
        type="textarea"
        :rows="3"
        :placeholder="t('auth.loginResumePrompt.placeholder')"
      />
    </div>

    <template #footer>
      <TxButton variant="ghost" @click="closeWithAction({ action: 'cancel' })">
        {{ t('auth.loginResumePrompt.cancel') }}
      </TxButton>
      <TxButton variant="flat" @click="closeWithAction({ action: 'retry' })">
        {{ t('auth.loginResumePrompt.retry') }}
      </TxButton>
      <TxButton variant="primary" :disabled="!trimmedToken" @click="handleManualSubmit">
        {{ t('auth.loginResumePrompt.manualSubmit') }}
      </TxButton>
    </template>
  </TModal>
</template>

<style scoped lang="scss">
.AuthLoginResumePrompt {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.AuthLoginResumePrompt-Description {
  margin: 0;
  color: var(--tx-text-color-regular);
  line-height: 1.6;
}
</style>
