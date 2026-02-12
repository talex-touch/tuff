<script lang="ts" setup>
import { TModal, TuffInput, TxButton } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

type PromptAction =
  | { action: 'manual'; token: string }
  | { action: 'retry' | 'cancel'; token?: string }

const emit = defineEmits<{
  (e: 'action', payload: PromptAction): void
}>()

const visible = ref(true)
const tokenInput = ref('')
const trimmedToken = computed(() => tokenInput.value.trim())

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
  <TModal v-model="visible" title="登录确认" width="560px" @close="handleClose">
    <div class="AuthLoginResumePrompt">
      <p class="AuthLoginResumePrompt-Description">
        检测到你已返回应用，但还未拿到登录凭据。你可以等待自动回传，或手动粘贴 token。
      </p>
      <TuffInput
        v-model="tokenInput"
        type="textarea"
        :rows="3"
        placeholder="粘贴登录 token（可选）"
      />
    </div>

    <template #footer>
      <TxButton variant="ghost" @click="closeWithAction({ action: 'cancel' })">取消登录</TxButton>
      <TxButton variant="flat" @click="closeWithAction({ action: 'retry' })">重新获取</TxButton>
      <TxButton variant="primary" :disabled="!trimmedToken" @click="handleManualSubmit">
        手动填入 token
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
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
</style>
