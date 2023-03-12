<template>
  <ul class="NavBar-Home" @click="activePlugin = ''">
    <IconButton direct="/home" icon="home-3" />
    <IconButton direct="/plugin" icon="plug-2" />
    <IconButton icon="quill-pen"></IconButton>
    <IconButton direct="/setting" icon="settings-6"></IconButton>
  </ul>

  <ul class="NavBar-Programs fake-background">
    <IconButton @click="activePlugin = plugin.pluginInfo.name " :select="activePlugin === plugin.pluginInfo.name" v-for="plugin in plugins">
      <el-tooltip placement="right" :content="plugin.pluginInfo.name">
        <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />
      </el-tooltip>
    </IconButton>
    <!--        <IconButton icon="qq"></IconButton>-->
    <!--        <IconButton icon="device"></IconButton>-->
    <IconButton direct="/market" icon="add"></IconButton>
  </ul>
</template>

<script>
import IconButton from '@comp/button/IconButton.vue'

export default {
  name: "LeafNavBar",
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

const activePlugin = useModelWrapper(props, emits)

const plugins = computed(() => Object.values(pluginManager.getPluginList()))

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

.NavBar-Home {
  * {
    -webkit-app-region: no-drag;
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