<template>
  <ul class="PlantNavBar-Home" @click="changeActivePlugin('')">
    <IconButton plain direct="/home" icon="home-3" />
    <IconButton plain direct="/plugin" icon="plug-2" />
    <IconButton plain icon="quill-pen"></IconButton>
    <IconButton plain direct="/setting" icon="settings-6"></IconButton>
  </ul>

  <ul class="NavBar-Programs fake-background">
    <IconButton plain :select="activePluginName === plugin.pluginInfo.name" @click="changeActivePlugin(plugin.pluginInfo.name)" v-for="plugin in plugins">
      <el-tooltip placement="right" :content="plugin.pluginInfo.name">
        <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />
      </el-tooltip>
    </IconButton>
    <!--        <IconButton icon="device"></IconButton>-->
    <IconButton plain direct="/market" icon="add"></IconButton>
  </ul>
</template>

<script>
import IconButton from '@comp/button/IconButton.vue'

export default {
  name: "PlantNavBar",
  components: { IconButton }
}
</script>

<script setup>
import { computed, ref } from 'vue'
import { pluginManager } from '@modules/samples/node-api'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import { useModelWrapper } from '@modules/utils'

const props = defineProps(['modelValue'])
const emits = defineEmits(['update:modelValue'])

const activePluginName = useModelWrapper(props, emits)

const plugins = computed(() => Object.values(pluginManager.getPluginList()))

function changeActivePlugin(name) {
  pluginManager.changeActivePlugin(activePluginName.value = (activePluginName.value === name ? "" : name))
}
</script>

<style lang="scss" scoped>
.NavBar-Programs {
  position: relative;
  padding: 0;
  display: flex;
  flex-direction: column;

  width: 100%;

  box-sizing: border-box;
  border-radius: 8px;
  --fake-color: var(--el-fill-color-light);
  --fake-radius: 8px;
  --fake-opacity: .35;

  :deep(.IconButton-Container) {
    transform: scale(.75);
  }
}

.PlantNavBar-Home {
  * {
    -webkit-app-region: no-drag;
  }
  :deep(.IconButton-Container) {

  }
  position: relative;
  margin: 0;
  padding: 10px 0;
  display: flex;
  flex-direction: column;

  justify-content: space-between;

  width: 100%;
  height: 50%;

  box-sizing: border-box;
}
</style>