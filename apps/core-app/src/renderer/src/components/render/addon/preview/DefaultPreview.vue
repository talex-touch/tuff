<script setup lang="ts" name="DefaultPreview">
import { TuffItem } from '@talex-touch/utils';

const props = defineProps<{
  item: TuffItem
}>()
</script>

<template>
  <div class="DefaultPreview">
    <p>Unsupported file type</p>
    <p>{{ item.meta?.file?.path }}</p>
  </div>
</template>

<style lang="scss" scoped>
.DefaultPreview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>