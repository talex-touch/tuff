<script setup lang="ts">
import type { TabHeaderProps } from './types'

defineOptions({
  name: 'TxTabHeader',
})

const props = defineProps<TabHeaderProps>()
</script>

<template>
  <div class="tx-tab-header fake-background">
    <slot :props="props" />
  </div>
</template>

<style lang="scss" scoped>
.tx-tab-header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.touch-blur .tx-tab-header {
  --fake-opacity: 0;
}
</style>
