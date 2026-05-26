<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { ContextMenuContext, ContextMenuPanelProps } from './types'
import { computed, provide } from 'vue'
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

provide<ContextMenuContext>(TX_CONTEXT_MENU_INJECTION_KEY, {
  close,
  closeOnSelect: props.closeOnSelect,
})
</script>

<template>
  <div
    class="tx-context-menu-panel"
    :data-tx-context-menu-layer="outsideGuard ? 'true' : undefined"
    :class="{ 'is-dense': dense }"
    :style="panelStyle"
    :role="role"
    :aria-label="ariaLabel"
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
