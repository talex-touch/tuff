<script lang="ts" name="HomePreviewToolCalls" setup>
import type { PreviewToolCall } from '~/modules/conversation/preview-index'
import { useI18n } from 'vue-i18n'

/**
 * Every tool the conversation called, in the order it called them.
 *
 * A failed call is the one row people come here for, so it carries its own ink
 * and its message — a status that only differs by colour is a status half the
 * readers cannot see.
 */
defineProps<{ items: PreviewToolCall[] }>()

defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()

const STATUS_ICON: Record<PreviewToolCall['status'], string> = {
  pending: 'i-ri-time-line',
  running: 'i-ri-loader-4-line',
  done: 'i-ri-check-line',
  error: 'i-ri-error-warning-line'
}
</script>

<template>
  <div class="HomePreviewToolCalls">
    <p v-if="!items.length" class="HomePreview-Empty">{{ t('home.preview.toolCallsEmpty') }}</p>

    <button
      v-for="item in items"
      :key="item.id"
      class="HomePreviewToolCalls-Row"
      :class="`is-${item.status}`"
      type="button"
      :title="t('home.preview.locate')"
      @click="$emit('locate', item.messageIndex)"
    >
      <span class="HomePreviewToolCalls-Icon" :class="STATUS_ICON[item.status]" />
      <span class="HomePreviewToolCalls-Text">
        <span class="HomePreview-Name">{{ item.name }}</span>
        <span v-if="item.error" class="HomePreviewToolCalls-Error">{{ item.error }}</span>
        <span v-else-if="item.summary" class="HomePreview-Detail">{{ item.summary }}</span>
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewToolCalls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.HomePreviewToolCalls-Row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-error .HomePreviewToolCalls-Icon {
    color: var(--shell-danger);
  }

  &.is-done .HomePreviewToolCalls-Icon {
    color: var(--shell-primary);
  }
}

.HomePreviewToolCalls-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-muted);
  font-size: 14px;
}

.HomePreviewToolCalls-Text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomePreviewToolCalls-Error {
  color: var(--shell-danger);
  font-size: var(--shell-fs-caption);
  line-height: 1.4;
  word-break: break-word;
}
</style>
