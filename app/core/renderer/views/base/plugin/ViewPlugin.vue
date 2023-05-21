<template>
  <div class="Blur-Container" :class="{ blur: options?.blur || true, active: activePlugin }">
      <PluginView v-for="plugin in plugins" :key="plugin.pluginInfo.name" :plugin="plugin" />
  </div>
</template>

<script>
export default {
  name: "ViewPlugin"
}
</script>

<script setup>
import { computed, inject, onMounted, ref } from "vue";
import PluginView from "@comp/plugin/PluginView.vue";

const options = {} //window.$storage.themeStyle
const activePlugin = inject('activePlugin')
const _plugins = inject('plugins')
const plugins = computed(() => _plugins())

</script>

<style lang="scss" scoped>
.Blur-Container {
  &.active {
    opacity: 1;
    pointer-events: all;
  }
  opacity: 0;
  pointer-events: none;
}
</style>