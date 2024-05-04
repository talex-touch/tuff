<template>
  <el-scrollbar v-if="plugins" class="PluginList-Container cubic-transition">
    <div class="PluginList-Toolbox">
      <FlatCompletion :fetch="search" />
    </div>

    <PluginListModule shrink="true" v-model="target" :plugins="runningPlugins">
      <template #name>Running</template>
    </PluginListModule>
    <PluginListModule v-model="target" :plugins="Object.values(plugins)">
      <template #name>All</template>
    </PluginListModule>

    <div class="PluginList-Add transition-cubic fake-background">
      <div id="newPluginBtn" @click="() => toggleNewPlugin()" class="new-plus" />
    </div>
  </el-scrollbar>
</template>

<script name="PluginList" setup>
import PluginListModule from "@comp/plugin/layout/PluginListModule.vue";
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";

const props = defineProps(['plugins'])
const emits = defineEmits(['select'])
const target = ref(-1)

const runningPlugins = computed(() => props.plugins.filter(plugin => plugin.status === 3 || plugin.status === 4))

watch(() => target.value, () => emits('select', target.value))

function search() {
  return []
}

const toggleNewPlugin = inject('toggleNewPlugin')
</script>

<style lang="scss" scoped>
.PluginList-Add {
  &:before {
    filter: invert(.25);
    transition: .25s;
  }

  &:hover {
    padding: 4px 8px;
    --fake-radius: 4px;

    --fake-opacity: .125;
    --fake-inner-opacity: .125;
  }

  position: sticky;
  padding: 4px;
  display: inline-block;

  bottom: 2%;

  left: 50%;

  --fake-color: var(--el-text-color-primary);
  --fake-opacity: .25;
  --fake-inner-opacity: .25;
  --fake-radius: 50%;
  transform: translateX(-50%);
}

.PluginList-Toolbox {
  z-index: 1;
  position: sticky;
  padding: 2px 2%;

  top: 1%;

  width: 100%;
  height: 36px;

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