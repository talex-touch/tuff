<script setup lang="ts">
import type { AttachmentChipProps } from './types'
import { computed } from 'vue'
import TxIconChip from '../../icon-chip/src/TxIconChip.vue'
import { resolveAttachmentFileBadge } from './file-badge'
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

const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.attachment.progress ?? 0)) * 100))

const progressText = computed(() =>
  props.attachment.progress === undefined ? '' : `${percent.value}%`,
)

const fileBadge = computed(() => resolveAttachmentFileBadge(props.attachment.name, props.attachment.mime))

// One button for both, so focus on it survives an upload finishing in removable mode.
function onAction(): void {
  if (props.attachment.uploading)
    emit('cancel', props.attachment.id)
  else
    emit('remove', props.attachment.id)
}
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
        <TxIconChip
          v-if="fileBadge"
          :size="30"
          :radius="7"
          :font-size="10"
          :tone="fileBadge.tone"
          :label="fileBadge.label"
        />
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      </span>
      <span class="tx-attachment-chip__info">
        <span class="tx-attachment-chip__name">{{ attachment.name }}</span>
        <span v-if="attachment.uploading" class="tx-attachment-chip__meta">{{ progressText }}</span>
        <span v-else-if="sizeText" class="tx-attachment-chip__meta">{{ sizeText }}</span>
      </span>
      <span
        v-if="attachment.uploading"
        class="tx-attachment-chip__progress"
        aria-hidden="true"
        :style="{ backgroundSize: `${percent}% 100%` }"
      />
    </button>

    <button
      v-if="attachment.uploading || removable"
      type="button"
      class="tx-attachment-chip__action"
      :aria-label="attachment.uploading ? cancelLabel : removeLabel"
      @click="onAction"
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
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
  border-radius: var(--tx-button-radius, 12px);
  background: var(--tx-fill-color-light, #f5f7fa);
  font-size: 12.5px;
  line-height: 1.25;

  &:hover {
    border-color: var(--tx-border-color, #dcdfe6);
  }

  &.is-uploading {
    border-style: dashed;
  }
}

.tx-attachment-chip__body {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 5px 8px 5px 5px;
  border: none;
  border-radius: var(--tx-button-radius, 12px);
  background: transparent;
  color: var(--tx-text-color-primary, #111827);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.tx-attachment-chip__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-attachment-chip__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tx-attachment-chip__name {
  max-width: 180px;
  overflow: hidden;
  font-weight: var(--tx-font-weight-medium, 500);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-attachment-chip__meta {
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}

// Concentric with the chip corner (12px radius - 5px inset = 7px).
.tx-attachment-chip__action {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: 5px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color, #f0f2f5);
    color: var(--tx-color-danger, #f56c6c);
  }
}

:is(.tx-attachment-chip__body, .tx-attachment-chip__action):focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
}

// A hairline under the card content, inset from the rounded corners. The fill is a gradient
// layer whose width the template sets.
.tx-attachment-chip__progress {
  position: absolute;
  inset: auto 8px 2px 8px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(var(--tx-color-primary, #409eff) 0 0) no-repeat
    color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
}
</style>
