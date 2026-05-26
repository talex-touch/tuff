<script setup lang="ts">
import type { ContextMenuContext, ContextMenuItemProps } from './types'
import { computed, inject } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import { TX_CONTEXT_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxContextMenuItem' })

const props = withDefaults(defineProps<ContextMenuItemProps>(), {
  disabled: false,
  danger: false,
  color: undefined,
  shortcut: undefined,
  submenu: false,
  closeOnSelect: undefined,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<ContextMenuContext | null>(TX_CONTEXT_MENU_INJECTION_KEY, null)

const itemStyle = computed(() => {
  if (!props.color)
    return undefined
  return {
    '--tx-context-menu-item-color': props.color,
  } as Record<string, string>
})

function onClick() {
  if (props.disabled)
    return
  emit('select')

  const shouldClose = props.closeOnSelect ?? ctx?.closeOnSelect ?? true
  if (shouldClose)
    ctx?.close?.()
}
</script>

<template>
  <TxCardItem
    class="tx-context-menu-item"
    :class="{ 'is-disabled': disabled, 'is-danger': danger, 'has-custom-color': !!color }"
    :style="itemStyle"
    role="menuitem"
    :clickable="!disabled"
    :disabled="disabled"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="onClick"
  >
    <template v-if="$slots.avatar" #avatar>
      <slot name="avatar" />
    </template>

    <template #title>
      <slot />
    </template>

    <template v-if="$slots.description" #description>
      <slot name="description" />
    </template>

    <template v-if="$slots.right || shortcut || submenu" #right>
      <slot name="right">
        <span v-if="shortcut" class="tx-context-menu-item__shortcut">{{ shortcut }}</span>
        <TxIcon v-if="submenu" name="chevron-down" class="tx-context-menu-item__arrow" aria-hidden="true" />
      </slot>
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
.tx-context-menu-item {
  --tx-card-item-padding: 8px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 10px;
}

.tx-context-menu-item :deep(.tx-card-item__top) {
  align-items: center;
}

.tx-context-menu-item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-context-menu-item-color, var(--tx-text-color-primary, #303133));
}

.tx-context-menu-item.is-danger {
  --tx-context-menu-item-color: var(--tx-color-danger, #f56c6c);
}

.tx-context-menu-item.is-disabled {
  opacity: 0.5;
}

.tx-context-menu-item__shortcut {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.tx-context-menu-item__arrow {
  transform: rotate(-90deg);
  opacity: 0.68;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
