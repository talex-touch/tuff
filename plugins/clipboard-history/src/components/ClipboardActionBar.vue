<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed } from 'vue'

const props = defineProps<{
  item: PluginClipboardItem | null
  copyPending: boolean
  applyPending: boolean
  favoritePending: boolean
  deletePending: boolean
}>()

const emit = defineEmits<{
  (event: 'copy'): void
  (event: 'apply'): void
  (event: 'toggleFavorite'): void
  (event: 'delete'): void
}>()

const hasItem = computed(() => Boolean(props.item?.id))
const favoriteLabel = computed(() => {
  if (props.favoritePending) {
    return '处理中'
  }
  return props.item?.isFavorite ? '取消收藏' : '收藏'
})
const applyLabel = computed(() => {
  if (props.applyPending) {
    return '粘贴中'
  }
  return '粘贴到当前应用'
})
</script>

<template>
  <div class="clipboard-action-bar">
    <button
      data-testid="copy-button"
      class="surface-button with-shortcut"
      type="button"
      :disabled="!hasItem || copyPending"
      @click="emit('copy')"
    >
      <span class="button-text">{{ copyPending ? '复制中' : '复制' }}</span>
      <span class="button-shortcut">Cmd/Ctrl + Enter</span>
    </button>

    <button
      data-testid="apply-button"
      class="surface-button primary with-shortcut"
      type="button"
      :disabled="!hasItem || applyPending"
      @click="emit('apply')"
    >
      <span class="button-text">{{ applyLabel }}</span>
      <span class="button-shortcut">Enter</span>
    </button>

    <div class="footer-actions">
      <button
        data-testid="favorite-button"
        class="surface-button"
        type="button"
        :disabled="!hasItem || favoritePending"
        @click="emit('toggleFavorite')"
      >
        <span class="button-text">{{ favoriteLabel }}</span>
      </button>

      <button
        data-testid="delete-button"
        class="surface-button danger"
        type="button"
        :disabled="!hasItem || deletePending"
        @click="emit('delete')"
      >
        <span class="button-text">{{ deletePending ? '删除中' : '删除' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.clipboard-action-bar {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  width: auto;
  flex: 0 0 auto;
  white-space: nowrap;
}

.footer-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  justify-content: flex-end;
  flex: 0 0 auto;
  white-space: nowrap;
}

.surface-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-strong) 90%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.surface-button:hover:enabled {
  background: color-mix(in srgb, currentColor 10%, transparent);
  border-color: color-mix(in srgb, currentColor 45%, var(--clipboard-border-color));
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.surface-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.surface-button.primary {
  border-color: color-mix(in srgb, var(--clipboard-color-accent, #6366f1) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent, #6366f1) 12%, transparent);
  color: var(--clipboard-color-accent-strong, var(--clipboard-color-accent, #6366f1));
}

.surface-button.primary:hover:enabled {
  border-color: var(--clipboard-color-accent, #6366f1);
  color: var(--clipboard-color-accent-strong, var(--clipboard-color-accent, #6366f1));
}

.surface-button.danger {
  color: var(--clipboard-color-danger, #ef4444);
}

.surface-button.with-shortcut {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  padding: 6px 12px;
  white-space: nowrap;
}

.button-shortcut {
  margin-left: 4px;
  font-size: 0.78rem;
  color: var(--clipboard-text-secondary);
  line-height: 1;
}

.button-text {
  font-size: 0.82rem;
  font-weight: 600;
}

@media (max-width: 720px) {
  .clipboard-action-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .footer-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
