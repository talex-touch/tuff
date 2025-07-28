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
      :lists="pendingLists[plugin.name] || []"
    />
  </div>
</template>

<script name="ViewPlugin" setup>
import PluginView from "@comp/plugin/PluginView.vue";
import { touchChannel } from "@modules/channel/channel-core";

const options = window.$storage.themeStyle;
const activePlugin = inject("activePlugin");
const plugins = inject("plugins");
// const plugins = computed(() => _plugins());

const pendingLists = reactive({})

onMounted(() => {
  touchChannel.regChannel(
    "plugin:message-transport",
    async ({ data: _data, reply }) => {
      // console.log("[Plugin] Receive message from plugin", _data)
      const { data, plugin } = _data
      if (!plugins.value.filter(item => item.name === plugin)?.length) {
        delete pendingLists[plugin]
        return reply({
          code: 404,
          message: "Plugin not found",
        })
      }

      const pendingList = pendingLists[plugin] || (pendingLists[plugin] = [])
      pendingList.push({
        data,
        reply,
      });
    }
  );
});
</script>

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
