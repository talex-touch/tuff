<template>
  <div class="Blur-Container fake-background" :class="{ blur: options.blur }">
    <PluginView v-for="plugin in plugins" :key="plugin.pluginInfo.name" :plugin="plugin" />
  </div>
</template>

<script>
export default {
  name: "ViewPlugin"
}
</script>

<script setup>
import { inject, onMounted, ref } from "vue";
import PluginView from "@comp/plugin/PluginView.vue";

const options = window.$storage.themeStyle
const plugins = ref()

onMounted(() => {
  const [_plugins, cb] = inject('plugins')()

  plugins.value = [ ..._plugins ]
  cb((val) => {
    plugins.value = [ ...val ]
  })

})
</script>

<style scoped>

</style>