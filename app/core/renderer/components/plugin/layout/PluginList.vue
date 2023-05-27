<template>
  <el-scrollbar v-if="plugins" class="PluginList-Container">
    <div class="PluginList-Toolbox">
      <FlatCompletion :fetch="search" />

      <div class="new-plus" @click="() => toggleNewPlugin()" id="newPluginBtn" />
    </div>

    <PluginListModule shrink="true" v-model="target" :plugins="runningPlugins">
      <template #name>运行中</template>
    </PluginListModule>
    <PluginListModule v-model="target" :plugins="Object.values(plugins)">
      <template #name>全部插件</template>
    </PluginListModule>
  </el-scrollbar>
</template>

<script name="PluginList" setup>
import PluginListModule from "@comp/plugin/layout/PluginListModule.vue";
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";

const props = defineProps(['plugins'])
const emits = defineEmits(['select'])
const target = ref(-1)

const runningPlugins = computed(() => Object.values(props.plugins).filter(plugin => plugin._status === 3 || plugin._status === 4))

watch(() => target.value, () => emits('select', target.value))

function search() {
  return []
}

const toggleNewPlugin = inject('toggleNewPlugin')
</script>

<style lang="scss" scoped>
.new-plus {
  visibility: hidden;
  right: 1%;
}

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

  background-color: var(--el-fill-color);

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