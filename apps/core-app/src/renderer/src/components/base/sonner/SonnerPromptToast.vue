<script setup lang="ts">
import { TuffInput, TxButton } from '@talex-touch/tuffex'
import { ref, watch } from 'vue'

defineOptions({
  name: 'SonnerPromptToast'
})

const props = defineProps<{
  title?: string
  message?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  defaultValue?: string
  validator?: (value: string) => true | string
  onConfirm: (value: string) => void
  onCancel: () => void
}>()

const inputValue = ref(props.defaultValue ?? '')
const errorText = ref('')

watch(
  () => props.defaultValue,
  (value) => {
    if (value !== undefined) {
      inputValue.value = value
    }
  }
)

function handleConfirm() {
  const trimmedValue = String(inputValue.value ?? '').trim()
  if (props.validator) {
    const result = props.validator(trimmedValue)
    if (result !== true) {
      errorText.value = typeof result === 'string' ? result : ''
      return
    }
  }
  errorText.value = ''
  props.onConfirm(trimmedValue)
}

function handleCancel() {
  props.onCancel()
}
</script>

<template>
  <div class="sonner-dialog">
    <div v-if="title" class="sonner-dialog__title">
      {{ title }}
    </div>
    <div v-if="message" class="sonner-dialog__message">
      {{ message }}
    </div>
    <TuffInput v-model="inputValue" :placeholder="placeholder" />
    <div v-if="errorText" class="sonner-dialog__error">
      {{ errorText }}
    </div>
    <div class="sonner-dialog__actions">
      <TxButton size="sm" variant="ghost" @click="handleCancel">
        {{ cancelText || 'Cancel' }}
      </TxButton>
      <TxButton size="sm" type="primary" @click="handleConfirm">
        {{ confirmText || 'Confirm' }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.sonner-dialog {
  display: grid;
  gap: 8px;
  min-width: 260px;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.sonner-dialog__title {
  font-weight: 600;
  font-size: 14px;
}

.sonner-dialog__message {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--el-text-color-regular);
}

.sonner-dialog__error {
  font-size: 12px;
  color: var(--tx-color-danger, #f56c6c);
}

.sonner-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
