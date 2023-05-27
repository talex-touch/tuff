<template>
  <el-scrollbar v-if="plugins" class="PluginList-Container">
    <div class="PluginList-Toolbox">
      <FlatCompletion :fetch="search" />
<!--      <IconButton undot middle plain icon="refresh" />-->
      <IconButton undot middle plain @click="() => $router.push('/plugin_new')" icon="add" />
      <!-- <IconButton undot middle plain @click="refresh" icon="refresh" /> -->
    </div>

    <PluginListModule shrink="true" v-model="target" :plugins="runningPlugins" >
      <template #name>运行中</template>
    </PluginListModule>
    <PluginListModule v-model="target" :plugins="Object.values(plugins)" >
      <template #name>全部插件</template>
    </PluginListModule>
  </el-scrollbar>
</template>

<script name="PluginList" setup>
import PluginListModule from "@comp/plugin/layout/PluginListModule.vue";
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";
import IconButton from "@comp/base/button/IconButton.vue";
import { pluginAdopter } from "@modules/hooks/adopters/plugin-adpoter";

const props = defineProps(['plugins'])
const emits = defineEmits(['select'])
const target = ref(-1)

const runningPlugins = computed(() => Object.values(props.plugins).filter(plugin => plugin._status === 3 || plugin._status === 4))

watch(() => target.value, () => emits('select',target.value))

async function refresh() {
  await pluginAdopter.refreshPlugins()
}

function search() {
  return []
}
</script>

<style lang="scss" scoped>
.PluginList-Toolbox {
  z-index: 1;
  position: sticky;
  display: flex;
  padding: 2px 2%;

  gap: 16px;
  top: 1%;

  width: 100%;
  height: 36px;

  justify-content: space-between;

  background-color: #00000011;

  backdrop-filter: blur(2px) brightness(1.8);
  border-radius: 8px;
  box-sizing: border-box;
}

.PluginList-Container {
  position: relative;
  padding: 0 1%;

  min-width: 350px;
  max-width: 400px;
  width: 35%;

  box-sizing: border-box;
}
</style>