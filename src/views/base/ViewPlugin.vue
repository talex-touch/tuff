<template>
  <div class="Blur-Container fake-background" :class="{ blur: options.blur }">
    <keep-alive>
      <PluginView v-for="plugin in plugins" :key="plugin.pluginInfo.name" :plugin="plugin" />
    </keep-alive>
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

const options = window.$storage.themeStyle
const _plugins = inject('plugins')
const plugins = computed(() => _plugins())

</script>

<style scoped>

</style>