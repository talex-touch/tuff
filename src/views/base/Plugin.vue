<template>
  <div class="Plugin-Container">
    <el-scrollbar>
      <ul class="Plugin-List">
        <plugin-item :select="select === index" :plugin="plugin"
                     @click="selectPlugin(index)" :key="plugin.pluginInfo.name" v-for="(plugin, index) in plugins" />
      </ul>
    </el-scrollbar>

    <div class="Plugin-Info" ref="pluginInfoRef">
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
import { pluginManager } from '@modules/samples/node-api'
import { onMounted, reactive, ref } from 'vue'
import PluginItem from '@comp/plugin/PluginItem.vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'

const plugins = reactive({})
const pluginInfoRef = ref()
const select = ref()

onMounted(() => {
  const _plugins = pluginManager.getPluginList()

  console.log( plugins )

  Object.assign(plugins, _plugins)

})

function selectPlugin(index) {
  if( index === select.value ) return
  const style = pluginInfoRef.value.style

  style.opacity = '0'
  style.transform = 'scale(.8)'

  if ( index > select.value ) {
    style.transform = 'scale(.8) translateY(-100%)'
    setTimeout(() => {
      style.transform = 'scale(.8) translateY(100%)'
    }, 150)
  } else {
    style.transform = 'scale(.8) translateY(100%)'
    setTimeout(() => {
      style.transform = 'scale(.8) translateY(-100%)'
    }, 150)
  }

  select.value = index

  setTimeout(() => {
    style.transform = 'scale(1) translateY(0)'
    style.opacity = '1'
  }, 300)
}
</script>

<style lang="scss" scoped>
.Plugin-Container {
  :deep(.el-scrollbar) {
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