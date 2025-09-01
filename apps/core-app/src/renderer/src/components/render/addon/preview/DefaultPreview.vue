<script setup lang="ts" name="DefaultPreview">
import { computed } from 'vue'
import { TuffItem, TuffIcon } from '@talex-touch/utils'
import { IPluginIcon } from '@talex-touch/utils'
import PluginIcon from '~/components/plugin/PluginIcon.vue'

const props = defineProps<{
  item: TuffItem
}>()

function transformTuffIcon(icon: TuffIcon | undefined): IPluginIcon | string {
  if (!icon) {
    return ''
  }
  if (typeof icon === 'string') {
    return icon
  }
  return {
    type: icon.type,
    value: icon.value,
    init: async () => {}
  }
}

const pluginIcon = computed(() => transformTuffIcon(props.item.render?.basic?.icon))
</script>

<template>
  <div v-if="item.render?.basic" class="DefaultPreview">
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
