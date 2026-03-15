<script setup lang="ts">
import type { ChatComposerAttachment, ChatComposerEmits, ChatComposerProps } from './types'
import { computed, ref, useSlots } from 'vue'
import TxButton from '../../button/src/button.vue'

defineOptions({
  name: 'TxChatComposer',
})

const props = withDefaults(defineProps<ChatComposerProps>(), {
  modelValue: '',
  placeholder: 'Message…',
  disabled: false,
  submitting: false,
  maxRows: 6,
  minRows: 3,
  sendOnEnter: true,
  sendOnMetaEnter: true,
  allowEmptySend: false,
  sendButtonText: 'Send',
  showAttachmentButton: false,
  attachmentButtonText: 'Attach',
  attachments: () => [],
})

const emit = defineEmits<ChatComposerEmits>()
const slots = useSlots()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v),
})

const attachmentItems = computed<ChatComposerAttachment[]>(() => {
  return Array.isArray(props.attachments) ? props.attachments : []
})
const hasCustomToolbar = computed(() => Boolean(slots.toolbar))
const canSend = computed(() => {
  if (props.disabled || props.submitting) {
    return false
  }
  const text = (value.value ?? '').trim()
  if (text) {
    return true
  }
  return Boolean(props.allowEmptySend && attachmentItems.value.length > 0)
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
void textareaRef.value

function trySend(): void {
  if (!canSend.value)
    return
  const text = (value.value ?? '').trim()
  emit('send', { text })
}

function onAttachmentClick(): void {
  if (props.disabled || props.submitting)
    return
  emit('attachmentClick')
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
    <div v-if="attachmentItems.length > 0 || $slots.attachments" class="tx-chat-composer__attachments">
      <slot name="attachments" :attachments="attachmentItems">
        <span
          v-for="item in attachmentItems"
          :key="item.id"
          class="tx-chat-composer__attachment"
          :class="{ 'is-pending': item.pending }"
        >
          <span class="tx-chat-composer__attachment-label">{{ item.label }}</span>
          <span v-if="item.kind" class="tx-chat-composer__attachment-kind">{{ item.kind }}</span>
        </span>
      </slot>
    </div>

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

    <div v-if="hasCustomToolbar" class="tx-chat-composer__toolbar">
      <slot
        name="toolbar"
        :send="trySend"
        :disabled="disabled || submitting"
        :attachment-click="onAttachmentClick"
      />
    </div>

    <div v-else class="tx-chat-composer__actions">
      <div class="tx-chat-composer__actions-left">
        <TxButton
          v-if="showAttachmentButton"
          variant="ghost"
          size="small"
          :disabled="disabled || submitting"
          @click="onAttachmentClick"
        >
          <span class="tx-chat-composer__plus" aria-hidden="true">+</span>
          {{ attachmentButtonText }}
        </TxButton>
        <slot name="toolbar-left" :disabled="disabled || submitting" />
      </div>

      <div class="tx-chat-composer__actions-right">
        <slot name="actions" :send="trySend" :disabled="!canSend" />
        <TxButton
          type="primary"
          :disabled="!canSend"
          @click="trySend"
        >
          {{ sendButtonText }}
        </TxButton>
      </div>
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

.tx-chat-composer__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-chat-composer__attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  color: var(--tx-text-color-primary, #111827);
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1;
}

.tx-chat-composer__attachment.is-pending {
  border-color: color-mix(in srgb, #f59e0b 32%, transparent);
  background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.tx-chat-composer__attachment-label {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-chat-composer__attachment-kind {
  color: var(--tx-text-color-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.02em;
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
  justify-content: space-between;
  gap: 10px;
}

.tx-chat-composer__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tx-chat-composer__actions-left,
.tx-chat-composer__actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-chat-composer__plus {
  display: inline-block;
  font-size: 16px;
  line-height: 1;
  margin-right: 2px;
}

.tx-chat-composer.is-disabled {
  opacity: 0.75;
}
</style>
