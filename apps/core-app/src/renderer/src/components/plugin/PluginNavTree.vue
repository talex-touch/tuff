<script lang="ts" name="PluginNavTree" setup>
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'
import type { ITouchPlugin } from '@talex-touch/utils'

const { plugins } = usePluginSelection()

console.log(plugins.value)
</script>

<template>
  <div class="PluginNavTree">
    <div v-for="plugin in plugins" :key="plugin.name">
      {{ plugin.name }}
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
