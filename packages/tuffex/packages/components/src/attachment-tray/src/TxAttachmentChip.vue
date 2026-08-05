<script setup lang="ts">
import type { AttachmentChipProps } from './types'
import { computed } from 'vue'
import { formatSize } from './format-size'

defineOptions({ name: 'TxAttachmentChip' })

const props = withDefaults(defineProps<AttachmentChipProps>(), {
  removable: false,
  removeLabel: 'Remove attachment',
  cancelLabel: 'Cancel upload',
})

const emit = defineEmits<{
  remove: [id: string]
  cancel: [id: string]
  open: [attachment: AttachmentChipProps['attachment']]
}>()

const sizeText = computed(() => {
  if (props.attachment.size === undefined)
    return ''
  return (props.sizeFormatter ?? formatSize)(props.attachment.size)
})

const progressText = computed(() => {
  const progress = props.attachment.progress
  if (progress === undefined)
    return ''
  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`
})
</script>

<template>
  <span
    class="tx-attachment-chip"
    :class="{ 'is-uploading': attachment.uploading }"
    :data-id="attachment.id"
  >
    <button
      type="button"
      class="tx-attachment-chip__body"
      :title="attachment.name"
      @click="emit('open', attachment)"
    >
      <span class="tx-attachment-chip__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      </span>
      <span class="tx-attachment-chip__name">{{ attachment.name }}</span>
      <span v-if="attachment.uploading" class="tx-attachment-chip__meta">{{ progressText }}</span>
      <span v-else-if="sizeText" class="tx-attachment-chip__meta">{{ sizeText }}</span>
    </button>

    <button
      v-if="attachment.uploading"
      type="button"
      class="tx-attachment-chip__action"
      :aria-label="cancelLabel"
      @click="emit('cancel', attachment.id)"
    >
      ×
    </button>
    <button
      v-else-if="removable"
      type="button"
      class="tx-attachment-chip__action"
      :aria-label="removeLabel"
      @click="emit('remove', attachment.id)"
    >
      ×
    </button>
  </span>
</template>

<style lang="scss">
.tx-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 999px;
  background: var(--tx-fill-color-blank, #fff);
  font-size: 12px;
  line-height: 1;

  &.is-uploading {
    border-style: dashed;
  }

  .tx-attachment-chip__body {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 6px 4px 6px 10px;
    border: none;
    background: transparent;
    color: var(--tx-text-color-primary, #111827);
    font: inherit;
    cursor: pointer;
  }

  .tx-attachment-chip__icon {
    display: inline-flex;
    color: var(--tx-text-color-secondary, #6b7280);
  }

  .tx-attachment-chip__name {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-attachment-chip__meta {
    color: var(--tx-text-color-secondary, #6b7280);
    font-variant-numeric: tabular-nums;
  }

  .tx-attachment-chip__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-right: 4px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;

    &:hover {
      background: var(--tx-fill-color, #f0f2f5);
      color: var(--tx-color-danger, #f56c6c);
    }
  }
}
</style>
