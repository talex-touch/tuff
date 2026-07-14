<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { ContextMenuContext, ContextMenuPanelProps } from './types'
import { computed, provide, ref } from 'vue'
import { TX_CONTEXT_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxContextMenuPanel' })

const props = withDefaults(defineProps<ContextMenuPanelProps>(), {
  width: undefined,
  minWidth: undefined,
  maxWidth: undefined,
  maxHeight: undefined,
  closeOnSelect: true,
  close: undefined,
  dense: false,
  outsideGuard: false,
  role: 'menu',
  ariaLabel: undefined,
})

const panelRef = ref<HTMLElement | null>(null)

function formatSize(value: number | string | undefined) {
  if (typeof value === 'number')
    return `${value}px`
  return value
}

const panelStyle = computed<StyleValue>(() => ({
  width: formatSize(props.width),
  minWidth: formatSize(props.minWidth),
  maxWidth: formatSize(props.maxWidth),
  maxHeight: formatSize(props.maxHeight),
}))

function close() {
  props.close?.()
}

function getEnabledItems(): HTMLElement[] {
  if (!panelRef.value || props.role !== 'menu')
    return []
  return Array.from(panelRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .filter(item => item.getAttribute('aria-disabled') !== 'true')
}

function focusFirstItem(): void {
  getEnabledItems()[0]?.focus()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return

  const items = getEnabledItems()
  if (items.length === 0)
    return

  event.preventDefault()
  const activeIndex = items.indexOf(document.activeElement as HTMLElement)

  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items[items.length - 1]?.focus()
    return
  }

  const direction = event.key === 'ArrowDown' ? 1 : -1
  const fallbackIndex = direction > 0 ? -1 : 0
  const nextIndex = (Math.max(activeIndex, fallbackIndex) + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

provide<ContextMenuContext>(TX_CONTEXT_MENU_INJECTION_KEY, {
  close,
  closeOnSelect: props.closeOnSelect,
})

defineExpose({ focusFirstItem })
</script>

<template>
  <div
    ref="panelRef"
    class="tx-context-menu-panel"
    :data-tx-context-menu-layer="outsideGuard ? 'true' : undefined"
    :class="{ 'is-dense': dense }"
    :style="panelStyle"
    :role="role"
    :aria-label="ariaLabel"
    @keydown="handleKeydown"
  >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-context-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: auto;
}

.tx-context-menu-panel.is-dense {
  gap: 0;
}
</style>
