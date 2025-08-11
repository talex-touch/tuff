<script setup lang="ts" name="DefaultPreview">
import { TuffItem } from '@talex-touch/utils'

const props = defineProps<{
  item: TuffItem
}>()

console.log(props)
</script>

<template>
  <div v-if="item.render?.basic" class="DefaultPreview">
    <div class="icon">
      <PluginIcon :icon="item.render?.basic?.icon?.value" :alt="item.render.basic.title" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.DefaultPreview {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 150px;

  .icon {
    margin: auto;

    width: 64px;
    height: 64px;
  }
}
</style>
