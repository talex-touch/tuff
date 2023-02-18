<template>
  <div class="Plugin-Container">
    <el-scrollbar>
      <ul class="Plugin-List" v-if="plugins">
        <plugin-item :select="select === index" :plugin="plugin"
                     @click="selectPlugin(index)" :key="plugin.pluginInfo.name" v-for="(plugin, index) in plugins" />
      </ul>
    </el-scrollbar>

    <div class="Plugin-Info" ref="pluginInfoRef" v-if="plugins">
      <PluginInfo v-if="plugins[select]" :plugin="plugins[select]" />
      <el-empty v-else description="暂未选中任何插件." />
    </div>
  </div>
</template>

<script>
export default {
  name: "Plugin"
}
</script>

<script setup>
import { pluginManager, registerTypeProcess } from '@modules/samples/node-api'
import { onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import PluginItem from '@comp/plugin/PluginItem.vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import { sleep } from '@modules/utils'

const plugins = ref()
const pluginInfoRef = ref()
const select = ref()

onMounted(() => {
  plugins.value = pluginManager.getPluginList()

  // Object.assign(plugins, _plugins)

  const logout = registerTypeProcess('plugin-status-updated', ({ data }) => {

    plugins.value[data.plugin]._status = data.status

  })

  onBeforeUnmount(logout)

})

async function selectPlugin(index) {
  if( index === select.value ) return
  const style = pluginInfoRef.value.style

  style.transform = 'scale(.9)'

  await sleep(50)

  style.opacity = '0'

  if ( index > select.value ) {
    style.transform = 'scale(.9) translateY(-50%)'

    await sleep(100)

    style.transform = 'scale(.9) translateY(50%)'
  } else {
    style.transform = 'scale(.9) translateY(50%)'

    await sleep(100)

    style.transform = 'scale(.9) translateY(-50%)'
  }

  select.value = index
  style.opacity = '1'

  await sleep(50)

  style.transform = 'scale(1) translateY(0)'

}
</script>

<style lang="scss" scoped>
.Plugin-Container {
  & > :deep(.el-scrollbar) {
    position: relative;
    margin: 0;
    padding: 0;

    width: 35%;
    min-width: 220px;
    max-width: 300px;

    border-right: 1px solid var(--el-border-color);
  }
  position: relative;
  display: flex;

  width: 100%;
  height: 100%;
}

.Plugin-Info {
  flex: 1;

  //background-color: var(--el-fill-color-light);
  transition: all .15s ease-in-out;
}

.Plugin-List {
  position: relative;
  margin: 0;
  padding: 0;

  height: 100%;

}
</style>