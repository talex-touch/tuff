<script setup lang="ts" name="AudioPreview">
import { TuffItem } from '@talex-touch/utils';

const props = defineProps<{
  item: TuffItem
}>()
</script>

<template>
  <div class="AudioPreview">
    <audio :src="item.meta?.file?.path" controls />
  </div>
</template>

<style lang="scss" scoped>
.AudioPreview {
  width: 100%;
  height: 100%;

  audio {
    width: 100%;
  }
}
</style>