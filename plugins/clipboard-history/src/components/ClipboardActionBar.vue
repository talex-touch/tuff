<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'

const props = defineProps<{
  item: PluginClipboardItem | null
  /** Cmd/Ctrl+Enter 现在按内容类型分派，按钮文案必须跟着走，不能写死「复制」。 */
  primaryActionLabel: string
  copyPending: boolean
  applyPending: boolean
  favoritePending: boolean
  deletePending: boolean
}>()

const emit = defineEmits<{
  (event: 'primary'): void
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

/**
 * 删除要按两次。第一次把按钮变成「再按一次删除」，第二次才真删。
 *
 * 用按钮自己的状态而不是弹一个对话框：这是个键盘驱动的启动器面板，弹层会抢走焦点、
 * 打断 Esc 关闭的肌肉记忆；而删除的代价是一条记录，不值得一个模态。
 *
 * 三秒内没有第二次点击就自己退回去——一个一直亮着「再按一次删除」的按钮，
 * 下次误触时反而成了陷阱。
 */
const deleteArmed = ref(false)
let disarmTimer: ReturnType<typeof setTimeout> | null = null

const deleteLabel = computed(() => {
  if (props.deletePending) {
    return '删除中'
  }
  return deleteArmed.value ? '再按一次删除' : '删除'
})

function disarmDelete(): void {
  if (disarmTimer) {
    clearTimeout(disarmTimer)
    disarmTimer = null
  }
  deleteArmed.value = false
}

function requestDelete(): void {
  if (deleteArmed.value) {
    disarmDelete()
    emit('delete')
    return
  }

  deleteArmed.value = true
  disarmTimer = setTimeout(disarmDelete, 3000)
}

// 切换记录后待确认态必须清掉，否则下一条记录的第一次点击就直接删了。
watch(() => props.item?.id, disarmDelete)

onBeforeUnmount(disarmDelete)
</script>

<template>
  <div class="clipboard-action-bar">
    <button
      data-testid="copy-button"
      class="surface-button with-shortcut"
      type="button"
      :disabled="!hasItem || copyPending"
      @click="emit('primary')"
    >
      <span class="button-text">{{ copyPending ? '处理中' : props.primaryActionLabel }}</span>
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
        :class="{ armed: deleteArmed }"
        type="button"
        :title="deleteLabel"
        :aria-label="deleteLabel"
        :disabled="!hasItem || deletePending"
        @click="requestDelete"
        @blur="disarmDelete"
      >
        <ClipboardGlyph name="trash" />
        <span class="button-text" :class="{ 'sr-only': !deletePending && !deleteArmed }">{{ deleteLabel }}</span>
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

/**
 * 待确认态要一眼看得出来，否则「按两次」就成了「第一次没反应」。
 * 图标按钮在这里撑开成带文字的胶囊，把它和旁边的收藏按钮明确区分开。
 */
.icon-button.danger.armed {
  width: auto;
  gap: 5px;
  padding: 0 9px;
  border-color: var(--clipboard-color-danger);
  background: color-mix(in srgb, var(--clipboard-color-danger) 14%, transparent);
}

.icon-button.danger.armed .button-text {
  font-size: 0.72rem;
  white-space: nowrap;
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
