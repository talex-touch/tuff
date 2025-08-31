<script setup lang="ts" name="DefaultPreview">
import { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'

const props = defineProps<{
  item: TuffItem
}>()

const iconValue = computed(() => {
  const icon = props.item.render?.basic?.icon
  if (typeof icon === 'string') {
    return icon
  }
  return icon?.value
})
</script>

<template>
  <div v-if="item.render?.basic" class="DefaultPreview">
    <div class="icon" v-if="iconValue">
      <PluginIcon :icon="iconValue" :alt="item.render.basic.title" />
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
