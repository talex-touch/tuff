<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import type {
  MetaAction,
  MetaActionExecuteRequest,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffIcon from '~/components/base/TuffIcon.vue'
import MetaActionItem from '~/components/meta/MetaActionItem.vue'

const { t } = useI18n()
const transport = useTuffTransport()

const visible = ref(false)
const searchQuery = ref('')
const activeIndex = ref(0)
const item = ref<TuffItem | null>(null)
const allActions = ref<MetaAction[]>([])

const searchInput = ref<HTMLInputElement>()

// Group actions by group property
const groupedActions = computed(() => {
  const groups = new Map<string, MetaAction[]>()
  const defaultGroup = '操作'

  for (const action of filteredActions.value) {
    const group = action.render.group || defaultGroup
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(action)
  }

  return Array.from(groups.entries()).map(([title, actions]) => ({
    title,
    actions
  }))
})

// Filter actions based on search query (title + subtitle + fuzzy)
const filteredActions = computed(() => {
  if (!searchQuery.value.trim()) {
    return allActions.value
  }

  const query = searchQuery.value.toLowerCase().trim()
  return allActions.value.filter((action) => {
    const title = action.render.basic.title.toLowerCase()
    const subtitle = action.render.basic.subtitle?.toLowerCase() || ''

    // 1. Title match
    if (title.includes(query)) return true

    // 2. Subtitle match
    if (subtitle.includes(query)) return true

    // 3. Fuzzy match (simple implementation - can be enhanced with pinyin library)
    // For now, check if all query characters appear in order
    let titleIndex = 0
    for (let i = 0; i < query.length; i++) {
      const char = query[i]
      const foundIndex = title.indexOf(char, titleIndex)
      if (foundIndex === -1) {
        // Try subtitle
        const subFoundIndex = subtitle.indexOf(char, 0)
        if (subFoundIndex === -1) {
          return false
        }
      } else {
        titleIndex = foundIndex + 1
      }
    }
    return true
  })
})

// Get flat list of actions for keyboard navigation
const flatActions = computed(() => {
  const flat: MetaAction[] = []
  for (const group of groupedActions.value) {
    flat.push(...group.actions)
  }
  return flat
})

// Listen for show/hide messages from main process via IPC
const unregShow = transport.on(MetaOverlayEvents.ui.show, (data: MetaShowRequest) => {
  item.value = data.item
  const merged: MetaAction[] = [
    ...(data.pluginActions || []),
    ...(data.itemActions || []),
    ...data.builtinActions
  ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  allActions.value = merged
  visible.value = true
})

const unregHide = transport.on(MetaOverlayEvents.ui.hide, () => {
  visible.value = false
  searchQuery.value = ''
  activeIndex.value = 0
})

// Focus search input when visible
watch(visible, (newVisible) => {
  if (newVisible) {
    activeIndex.value = 0
    searchQuery.value = ''
    setTimeout(() => {
      searchInput.value?.focus()
    }, 100)
  }
})

function handleKeyDown(event: KeyboardEvent) {
  if (!visible.value) return

  // ESC: Close MetaOverlay (priority over other ESC handlers)
  if (event.key === 'Escape') {
    handleClose()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // Arrow keys: Navigate
  if (event.key === 'ArrowDown') {
    activeIndex.value = Math.min(activeIndex.value + 1, flatActions.value.length - 1)
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

  // Enter: Execute selected action
  if (event.key === 'Enter') {
    const action = flatActions.value[activeIndex.value]
    if (action && !action.render.disabled) {
      handleActionExecute(action)
    }
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // Check for shortcut matches
  if (event.metaKey || event.ctrlKey) {
    const shortcut = getShortcutString(event)
    const matchingAction = flatActions.value.find((action) => {
      if (!action.render.shortcut) return false
      return normalizeShortcut(action.render.shortcut) === normalizeShortcut(shortcut)
    })
    if (matchingAction && !matchingAction.render.disabled) {
      handleActionExecute(matchingAction)
      event.preventDefault()
      event.stopPropagation()
    }
  }
}

function getShortcutString(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.metaKey) parts.push('⌘')
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('⇧')
  if (event.key && event.key.length === 1) {
    parts.push(event.key.toUpperCase())
  } else if (event.key === 'Enter') {
    parts.push('↵')
  }
  return parts.join('')
}

function normalizeShortcut(shortcut: string): string {
  return shortcut
    .replace(/⌘/g, 'Meta')
    .replace(/Ctrl/g, 'Meta')
    .replace(/⇧/g, 'Shift')
    .replace(/↵/g, 'Enter')
    .toLowerCase()
}

async function handleActionExecute(action: MetaAction) {
  if (!item.value) return

  try {
    // Include item in request for main process to use
    const payload: MetaActionExecuteRequest & { item?: TuffItem } = {
      actionId: action.id,
      itemId: item.value.id,
      item: item.value
    }
    await transport.send(MetaOverlayEvents.action.execute, payload)
  } catch (error) {
    console.error('[MetaOverlay] Failed to execute action', error)
  }
}

async function handleClose() {
  try {
    await transport.send(MetaOverlayEvents.ui.hide)
  } catch (error) {
    console.error('[MetaOverlay] Failed to hide', error)
  }
}

// Register keyboard listener
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
})

onBeforeUnmount(() => {
  unregShow()
  unregHide()
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<template>
  <Transition name="meta-fade">
    <div v-if="visible" class="MetaOverlay" @click.self="handleClose">
      <div class="MetaPanel">
        <!-- Search Header -->
        <div class="MetaHeader">
          <div class="SearchBox">
            <TuffIcon
              :icon="{ type: 'class', value: 'i-ri-search-line' }"
              :size="16"
              class="SearchIcon"
            />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="SearchInput"
              :placeholder="t('corebox.meta.searchPlaceholder', '搜索操作...')"
              @keydown="handleKeyDown"
            />
            <span class="ShortcutHint">⌘K</span>
          </div>
        </div>

        <!-- Action List -->
        <div class="MetaList">
          <template v-for="group in groupedActions" :key="group.title">
            <div v-if="group.title" class="GroupTitle">
              {{ group.title }}
            </div>
            <MetaActionItem
              v-for="action in group.actions"
              :key="action.id"
              :action="action"
              :active="flatActions.indexOf(action) === activeIndex"
              @click="handleActionExecute(action)"
              @mouseenter="activeIndex = flatActions.indexOf(action)"
            />
          </template>
        </div>

        <!-- Footer -->
        <div class="MetaFooter">
          <span>↑↓ {{ t('corebox.meta.select', '选择') }}</span>
          <span>Enter {{ t('corebox.meta.execute', '执行') }}</span>
          <span>Esc {{ t('corebox.meta.close', '关闭') }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.MetaOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.MetaPanel {
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  width: 400px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.MetaHeader {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.SearchBox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  transition: border-color 0.2s;

  &:focus-within {
    border-color: var(--el-color-primary);
  }
}

.SearchIcon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.SearchInput {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--el-text-color-primary);

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}

.ShortcutHint {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  flex-shrink: 0;
}

.MetaList {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.GroupTitle {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.MetaFooter {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.meta-fade-enter-active,
.meta-fade-leave-active {
  transition: opacity 0.2s ease;
}

.meta-fade-enter-from,
.meta-fade-leave-to {
  opacity: 0;
}

.meta-fade-enter-active .MetaPanel,
.meta-fade-leave-active .MetaPanel {
  transition: transform 0.2s ease;
}

.meta-fade-enter-from .MetaPanel {
  transform: translateY(-10px) scale(0.98);
}

.meta-fade-leave-to .MetaPanel {
  transform: translateY(-10px) scale(0.98);
}
</style>
