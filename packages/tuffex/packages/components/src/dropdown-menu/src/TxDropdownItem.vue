<script setup lang="ts">
import { inject } from 'vue'
import type { DropdownItemProps } from './types'

defineOptions({ name: 'TxDropdownItem' })

const props = withDefaults(defineProps<DropdownItemProps>(), {
  disabled: false,
  danger: false,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<{ close: () => void; closeOnSelect: boolean }>('txDropdownMenu')

function onClick() {
  if (props.disabled) return
  emit('select')
  if (ctx?.closeOnSelect) ctx?.close()
}
</script>

<template>
  <div
    class="tx-dropdown-item"
    :class="{ 'is-disabled': disabled, 'is-danger': danger }"
    role="menuitem"
    :tabindex="disabled ? -1 : 0"
    @click="onClick"
    @keydown.enter="onClick"
  >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  color: var(--tx-text-color-primary, #303133);

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
  }
}

.tx-dropdown-item.is-danger {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-dropdown-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
</style>
