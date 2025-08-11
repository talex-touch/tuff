<script lang="ts" name="TuffItemAddon" setup>
import { TuffItem } from '@talex-touch/utils'

defineProps<{
  type?: 'preview'
  item?: TuffItem
}>()
</script>

<template>
  <div class="TuffItemAddon transition-cubic" :class="{ show: !!type }">
    <template v-if="type === 'preview'">
      <TuffItemPreviewer :item="item!" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.TuffItemAddon {
  z-index: 1;
  position: relative;

  top: 0;
  right: 0;

  width: 0;
  height: 100%;

  overflow: hidden;
  border-left: 1px solid var(--el-border-color);

  &.show {
    width: 60%;
  }
}
</style>
