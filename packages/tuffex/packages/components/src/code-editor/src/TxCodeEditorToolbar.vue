<script setup lang="ts">
import type { CodeEditorToolbarAction, CodeEditorToolbarActionKey } from './types'
import { computed } from 'vue'
import type { PropType } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({
  name: 'TxCodeEditorToolbar',
})

const defaultLabels: Record<CodeEditorToolbarActionKey, string> = {
  format: 'Format',
  search: 'Search',
  foldAll: 'Fold',
  unfoldAll: 'Unfold',
  copy: 'Copy',
}

const defaultActions: CodeEditorToolbarAction[] = [
  { key: 'format' },
  { key: 'search' },
  { key: 'foldAll' },
  { key: 'unfoldAll' },
  { key: 'copy' },
]

const props = defineProps({
  actions: {
    type: Array as PropType<CodeEditorToolbarAction[]>,
    default: () => [],
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['action'])

const resolvedActions = computed(() => {
  return props.actions?.length ? props.actions : defaultActions
})

function resolveLabel(action: CodeEditorToolbarAction) {
  return action.label ?? defaultLabels[action.key] ?? action.key
}

function handleAction(action: CodeEditorToolbarAction) {
  if (action.disabled)
    return
  emit('action', action.key)
}
</script>

<template>
  <div class="tx-code-editor-toolbar" :class="{ 'is-compact': compact }">
    <slot name="leading" />
    <div class="tx-code-editor-toolbar__actions">
      <button
        v-for="action in resolvedActions"
        :key="action.key"
        type="button"
        class="tx-code-editor-toolbar__action"
        :class="{ 'is-active': action.active }"
        :disabled="action.disabled"
        @click="handleAction(action)"
      >
        <TxIcon v-if="action.icon && typeof action.icon !== 'string'" :icon="action.icon" :size="16" />
        <TxIcon v-else-if="action.icon" :name="action.icon" :size="16" />
        <span class="tx-code-editor-toolbar__label">{{ resolveLabel(action) }}</span>
        <span v-if="action.shortcut" class="tx-code-editor-toolbar__shortcut">{{ action.shortcut }}</span>
      </button>
    </div>
    <slot name="trailing" />
  </div>
</template>

<style lang="scss" scoped>
.tx-code-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: inherit;

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    background: transparent;
    color: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s, color 0.2s;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.is-active {
      border-color: color-mix(in srgb, currentColor 30%, transparent);
      background: color-mix(in srgb, currentColor 18%, transparent);
    }
  }

  &__label {
    white-space: nowrap;
  }

  &__shortcut {
    font-size: 11px;
    opacity: 0.6;
  }

  &.is-compact {
    .tx-code-editor-toolbar__action {
      padding: 4px 8px;
    }
  }
}
</style>
