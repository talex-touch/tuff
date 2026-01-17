<script setup lang="ts">
import type { DropdownItemProps } from './types'
import { inject } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'

defineOptions({ name: 'TxDropdownItem' })

const props = withDefaults(defineProps<DropdownItemProps>(), {
  disabled: false,
  danger: false,
  arrow: false,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<{ close: () => void, closeOnSelect: boolean }>('txDropdownMenu')

function onClick() {
  if (props.disabled)
    return
  emit('select')
  if (ctx?.closeOnSelect)
    ctx?.close()
}
</script>

<template>
  <TxCardItem
    class="tx-dropdown-item"
    :class="{ 'is-disabled': disabled, 'is-danger': danger }"
    role="menuitem"
    :clickable="!disabled"
    :disabled="disabled"
    @click="onClick"
  >
    <template #title>
      <slot />
    </template>

    <template v-if="$slots.right || arrow" #right>
      <slot name="right">
        <TxIcon name="chevron-down" class="tx-dropdown-item__arrow" aria-hidden="true" />
      </slot>
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
.tx-dropdown-item {
  --tx-card-item-padding: 8px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 10px;
}

.tx-dropdown-item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-dropdown-item.is-danger :deep(.tx-card-item__title) {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-dropdown-item.is-disabled {
  opacity: 0.5;
}

.tx-dropdown-item__arrow {
  transform: rotate(-90deg);
  opacity: 0.7;
}
</style>
