<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ActionItem {
  id: string
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
}

const props = defineProps<{
  visible: boolean
  item: TuffItem | null
  isPinned?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', actionId: string): void
}>()

const { t } = useI18n()
const activeIndex = ref(0)

const isMac = process.platform === 'darwin'

const actions = computed<ActionItem[]>(() => {
  if (!props.item) return []

  const list: ActionItem[] = []

  // Pin/Unpin action
  list.push({
    id: 'toggle-pin',
    label: props.isPinned 
      ? t('corebox.actions.unpin', '取消固定') 
      : t('corebox.actions.pin', '固定到推荐'),
    icon: props.isPinned ? 'i-ri-unpin-line' : 'i-ri-pushpin-line',
    shortcut: isMac ? '↵' : 'Enter'
  })

  // Copy action
  if (props.item.render?.basic?.title) {
    list.push({
      id: 'copy-title',
      label: t('corebox.actions.copyTitle', '复制名称'),
      icon: 'i-ri-file-copy-line',
      shortcut: isMac ? '⌘C' : 'Ctrl+C'
    })
  }

  // Open in Finder (for apps/files)
  if (props.item.kind === 'app' || props.item.kind === 'file') {
    list.push({
      id: 'reveal-in-finder',
      label: t('corebox.actions.revealInFinder', '在 Finder 中显示'),
      icon: 'i-ri-folder-open-line',
      shortcut: isMac ? '⌘⇧F' : 'Ctrl+Shift+F'
    })
  }

  // Flow Transfer to another plugin
  list.push({
    id: 'flow-transfer',
    label: t('corebox.actions.flowTransfer', '流转到其他插件'),
    icon: 'i-ri-share-forward-line',
    shortcut: isMac ? '⌘⇧D' : 'Ctrl+Shift+D'
  })

  return list
})

watch(() => props.visible, (visible) => {
  if (visible) {
    activeIndex.value = 0
  }
})

function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  if (event.key === 'Escape') {
    emit('close')
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (event.key === 'ArrowDown') {
    activeIndex.value = Math.min(activeIndex.value + 1, actions.value.length - 1)
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (event.key === 'ArrowUp') {
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (event.key === 'Enter') {
    const action = actions.value[activeIndex.value]
    if (action && !action.disabled) {
      emit('action', action.id)
    }
    event.preventDefault()
    event.stopPropagation()
    return
  }
}

function handleActionClick(action: ActionItem) {
  if (action.disabled) return
  emit('action', action.id)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="visible" class="ActionPanel-Overlay" @click.self="emit('close')">
        <div class="ActionPanel">
          <header class="ActionPanel-Header">
            <span class="ActionPanel-Title">{{ t('corebox.actions.title', '操作') }}</span>
            <span class="ActionPanel-Hint">ESC {{ t('corebox.actions.close', '关闭') }}</span>
          </header>
          <div class="ActionPanel-List">
            <div
              v-for="(action, index) in actions"
              :key="action.id"
              class="ActionPanel-Item"
              :class="{ 
                active: index === activeIndex,
                disabled: action.disabled,
                danger: action.danger
              }"
              @click="handleActionClick(action)"
              @mouseenter="activeIndex = index"
            >
              <i v-if="action.icon" :class="action.icon" class="ActionPanel-Icon" />
              <span class="ActionPanel-Label">{{ action.label }}</span>
              <span v-if="action.shortcut" class="ActionPanel-Shortcut">{{ action.shortcut }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.ActionPanel-Overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  z-index: 10000;
}

.ActionPanel {
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  width: 320px;
  overflow: hidden;
}

.ActionPanel-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ActionPanel-Title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ActionPanel-Hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.ActionPanel-List {
  padding: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.ActionPanel-Item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover,
  &.active {
    background: var(--el-fill-color);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.danger {
    color: var(--el-color-danger);
  }
}

.ActionPanel-Icon {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.ActionPanel-Label {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.ActionPanel-Shortcut {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
  font-family: system-ui, -apple-system, sans-serif;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.15s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.panel-fade-enter-active .ActionPanel,
.panel-fade-leave-active .ActionPanel {
  transition: transform 0.15s ease;
}

.panel-fade-enter-from .ActionPanel {
  transform: translateY(-10px);
}

.panel-fade-leave-to .ActionPanel {
  transform: translateY(-10px);
}
</style>
