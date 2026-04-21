<script name="ViewPlugin" setup>
import PluginView from '~/components/plugin/PluginView.vue'
import { appSetting } from '~/modules/channel/storage'

const options = computed(() => appSetting.background ?? {})
const activePlugin = inject('activePlugin')
const plugins = inject('plugins')
</script>

<template>
  <div
    class="Blur-Container"
    :class="{ 'touch-blur': options?.blur || true, active: activePlugin }"
  >
    <PluginView
      v-for="plugin in plugins"
      :id="`${plugin.name}-plugin-view`"
      :key="plugin.name"
      :plugin="plugin"
    />
  </div>
</template>

<style lang="scss" scoped>
.Blur-Container {
  &.active {
    opacity: 1;
    pointer-events: all;
  }

  opacity: 0;
  pointer-events: none;
  -webkit-app-region: no-drag;
}
</style>
