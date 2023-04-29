<template>
  <el-scrollbar v-if="plugins" class="PluginList-Container">
    <div class="PluginList-Toolbox">
      refreshPlugins
    </div>

    <PluginListModule shrink="true" v-model="target" :plugins="runningPlugins" >
      <template #name>运行中</template>
    </PluginListModule>
    <PluginListModule v-model="target" :plugins="Object.values(plugins)" >
      <template #name>全部插件</template>
    </PluginListModule>
  </el-scrollbar>
</template>

<script>
export default {
  name: "PluginList",
}
</script>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import PluginListModule from "@comp/plugin/layout/PluginListModule.vue";

const props = defineProps(['plugins'])
const emits = defineEmits(['select'])
const target = ref(-1)

const runningPlugins = computed(() => Object.values(props.plugins).filter(plugin => plugin._status === 3 || plugin._status === 4))

watch(() => target.value, () => emits('select',target.value))
</script>

<style lang="scss" scoped>
.PluginList-Container {
  position: relative;
  padding: 0 1%;

  min-width: 300px;
  max-width: 400px;
  width: 35%;

  box-sizing: border-box;
}
</style>