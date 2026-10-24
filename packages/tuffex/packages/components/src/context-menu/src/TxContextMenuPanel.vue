<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { ContextMenuContext, ContextMenuPanelProps } from './types'
import { computed, provide, reactive, ref, toRef } from 'vue'
import { createRovingFocus } from '../../../../utils/roving-focus'
import { TX_CONTEXT_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxContextMenuPanel' })

const props = withDefaults(defineProps<ContextMenuPanelProps>(), {
  width: undefined,
  minWidth: undefined,
  maxWidth: undefined,
  maxHeight: undefined,
  closeOnSelect: true,
  activationFeedback: true,
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

const roving = createRovingFocus(() => {
  if (!panelRef.value)
    return []
  // Keyboard navigation only applies to real menu/listbox roles; `none` opts out.
  const itemRole = props.role === 'listbox' ? 'option' : props.role === 'menu' ? 'menuitem' : null
  if (!itemRole)
    return []
  return panelRef.value.querySelectorAll<HTMLElement>(`[role="${itemRole}"]`)
}, { skipDisabled: true })

function focusFirstItem(): void {
  roving.items()[0]?.focus()
}

function handleKeydown(event: KeyboardEvent): void {
  roving.move(event)
}

provide<ContextMenuContext>(TX_CONTEXT_MENU_INJECTION_KEY, reactive({
  close,
  closeOnSelect: toRef(props, 'closeOnSelect'),
  activationFeedback: toRef(props, 'activationFeedback'),
}))

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
