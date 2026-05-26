<script setup lang="ts">
import type { ContextMenuDividerProps } from './types'

defineOptions({ name: 'TxContextMenuDivider' })

withDefaults(defineProps<ContextMenuDividerProps>(), {
  dashed: false,
  inset: false,
})
</script>

<template>
  <div
    class="tx-context-menu-divider"
    :class="{ 'is-dashed': dashed, 'is-inset': inset }"
    role="separator"
    aria-orientation="horizontal"
  />
</template>

<style lang="scss" scoped>
.tx-context-menu-divider {
  height: 1px;
  margin: 5px 6px;
  background: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 76%, transparent);
}

.tx-context-menu-divider.is-dashed {
  height: 0;
  background: transparent;
  border-top: 1px dashed color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 82%, transparent);
}

.tx-context-menu-divider.is-inset {
  margin-left: 34px;
}
</style>
