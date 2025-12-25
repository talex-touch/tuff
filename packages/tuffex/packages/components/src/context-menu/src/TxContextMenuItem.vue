<script setup lang="ts">
import { inject } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'

defineOptions({ name: 'TxContextMenuItem' })

const props = withDefaults(defineProps<{
  disabled?: boolean
  danger?: boolean
}>(), {
  disabled: false,
  danger: false,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<{ close: () => void } | null>('txContextMenu', null)

function onClick() {
  if (props.disabled) return
  emit('select')
  ctx?.close?.()
}
</script>

<template>
  <TxCardItem
    class="tx-context-menu-item"
    :class="{ 'is-disabled': disabled, 'is-danger': danger }"
    role="menuitem"
    :clickable="!disabled"
    :disabled="disabled"
    @click="onClick"
  >
    <template #title>
      <slot />
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
.tx-context-menu-item {
  --tx-card-item-padding: 8px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 10px;
}

.tx-context-menu-item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-context-menu-item.is-danger :deep(.tx-card-item__title) {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-context-menu-item.is-disabled {
  opacity: 0.5;
}
</style>
