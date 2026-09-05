<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'

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
        class="icon-button"
        type="button"
        :title="favoriteLabel"
        :aria-label="favoriteLabel"
        :disabled="!hasItem || favoritePending"
        @click="emit('toggleFavorite')"
      >
        <ClipboardGlyph name="star" />
        <span class="button-text" :class="{ 'sr-only': !favoritePending }">{{ favoriteLabel }}</span>
      </button>

      <button
        data-testid="delete-button"
        class="icon-button danger"
        type="button"
        :title="deletePending ? '删除中' : '删除'"
        :aria-label="deletePending ? '删除中' : '删除'"
        :disabled="!hasItem || deletePending"
        @click="emit('delete')"
      >
        <ClipboardGlyph name="trash" />
        <span class="button-text" :class="{ 'sr-only': !deletePending }">{{ deletePending ? '删除中' : '删除' }}</span>
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
  min-width: 0;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.footer-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  justify-content: flex-end;
  flex: 0 0 auto;
  min-width: 0;
  white-space: nowrap;
}

.surface-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  min-width: 0;
  padding: 0 10px;
  border-radius: 8px;
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
  box-shadow: var(--tx-box-shadow-lighter, none);
}

.surface-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.surface-button.primary {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 12%, transparent);
  color: var(--clipboard-color-accent-strong);
}

.surface-button.primary:hover:enabled {
  border-color: var(--clipboard-color-accent);
  color: var(--clipboard-color-accent-strong);
}

.surface-button.danger {
  color: var(--clipboard-color-danger);
}

.icon-button {
  width: 30px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-strong) 90%, transparent);
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.icon-button:hover:enabled {
  color: var(--clipboard-text-primary);
  border-color: color-mix(in srgb, currentColor 45%, var(--clipboard-border-color));
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.icon-button.danger {
  color: var(--clipboard-color-danger);
}

.icon-button .ClipboardGlyph {
  width: 15px;
  height: 15px;
}

/**
 * 图标按钮仍要渲染文案节点：pending 态的「处理中 / 删除中」是既有的可访问性与测试契约，
 * 非 pending 态只做视觉隐藏，不从 DOM 里摘掉。
 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}

.surface-button.with-shortcut {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  padding: 4px 10px;
  white-space: nowrap;
}

.button-shortcut {
  margin-left: 4px;
  font-size: 0.72rem;
  color: var(--clipboard-text-secondary);
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.button-text {
  font-size: 0.76rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 640px) {
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
