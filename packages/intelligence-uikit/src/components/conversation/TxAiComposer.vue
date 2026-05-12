<script setup lang="ts">
import type { TxAiComposerProps } from '../../types'
import { TxChatComposer } from '@talex-touch/tuffex'

defineOptions({
  name: 'TxAiComposer',
})

withDefaults(defineProps<TxAiComposerProps>(), {
  modelValue: '',
  placeholder: '输入消息...',
  disabled: false,
  submitting: false,
  attachments: () => [],
  allowAttachmentWhileSubmitting: true,
  minRows: 1,
  maxRows: 6,
  sendOnEnter: true,
  sendOnMetaEnter: false,
  allowEmptySend: true,
  sendButtonText: '发送',
  showAttachmentButton: false,
  attachmentButtonText: '附件',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send', payload: { text: string }): void
  (e: 'attachmentClick'): void
}>()
</script>

<template>
  <TxChatComposer
    class="tx-ai-composer"
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :submitting="submitting"
    :attachments="attachments"
    :allow-attachment-while-submitting="allowAttachmentWhileSubmitting"
    :min-rows="minRows"
    :max-rows="maxRows"
    :send-on-enter="sendOnEnter"
    :send-on-meta-enter="sendOnMetaEnter"
    :allow-empty-send="allowEmptySend"
    :send-button-text="sendButtonText"
    :show-attachment-button="showAttachmentButton"
    :attachment-button-text="attachmentButtonText"
    @update:model-value="emit('update:modelValue', $event)"
    @send="emit('send', $event)"
    @attachment-click="emit('attachmentClick')"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps" />
    </template>
  </TxChatComposer>
</template>
