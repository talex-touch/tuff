<script setup lang="ts">
import { computed, ref } from 'vue'
import TxButton from '../../button/src/button.vue'

defineOptions({
  name: 'TxChatComposer',
})

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    submitting?: boolean
    minRows?: number
    maxRows?: number
    sendOnEnter?: boolean
    sendOnMetaEnter?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: 'Message…',
    disabled: false,
    submitting: false,
    maxRows: 6,
    minRows: 3,
    sendOnEnter: true,
    sendOnMetaEnter: true,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send', payload: { text: string }): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}>()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v),
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function trySend(): void {
  if (props.disabled || props.submitting)
    return
  const text = (value.value ?? '').trim()
  if (!text)
    return
  emit('send', { text })
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.sendOnEnter)
    return
  if (e.key !== 'Enter')
    return

  const metaLike = e.metaKey || e.ctrlKey

  if (props.sendOnMetaEnter) {
    if (!metaLike)
      return
    e.preventDefault()
    trySend()
    return
  }

  if (metaLike)
    return
  if (e.shiftKey)
    return

  e.preventDefault()
  trySend()
}
</script>

<template>
  <div class="tx-chat-composer" :class="{ 'is-disabled': disabled, 'is-submitting': submitting }">
    <div class="tx-chat-composer__input">
      <textarea
        ref="textareaRef"
        v-model="value"
        class="tx-chat-composer__textarea"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="minRows"
        @keydown="onKeydown"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      />
    </div>

    <div class="tx-chat-composer__actions">
      <slot name="actions" :send="trySend" :disabled="disabled || submitting" />
      <TxButton
        type="primary"
        :disabled="disabled || submitting"
        @click="trySend"
      >
        Send
      </TxButton>
    </div>

    <slot name="footer" />
  </div>
</template>

<style scoped lang="scss">
.tx-chat-composer {
  width: 100%;
  border-radius: 16px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 12px;
  display: grid;
  gap: 10px;
}

.tx-chat-composer__input {
  width: 100%;
}

.tx-chat-composer__textarea {
  width: 100%;
  resize: vertical;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #111827);
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tx-chat-composer__textarea::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-chat-composer__textarea:focus {
  border-color: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
}

.tx-chat-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.tx-chat-composer.is-disabled {
  opacity: 0.75;
}
</style>
