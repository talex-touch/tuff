<script setup lang="ts" name="DefaultPreview">
import type { ITuffIcon, TuffIcon, TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import PluginIcon from '~/components/plugin/PluginIcon.vue'

const props = defineProps<{
  item: TuffItem
}>()

function transformTuffIcon(icon: TuffIcon | undefined): ITuffIcon | null {
  if (!icon) {
    return null
  }
  if (typeof icon === 'string') {
    // Convert string to ITuffIcon format
    return {
      type: 'url',
      value: icon,
    }
  }
  return {
    type: icon.type,
    value: icon.value,
  }
}

const pluginIcon = computed(() => {
  const icon = transformTuffIcon(props.item.render?.basic?.icon)
  return icon
})
</script>

<template>
  <div v-if="item.render?.basic && pluginIcon" class="DefaultPreview">
    <div class="icon">
      <PluginIcon :icon="pluginIcon" :alt="item.render.basic.title" />
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
