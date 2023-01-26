<template>
  <div class="Plugin-Container">
    <ul class="Plugin-List">
      <p class="Plugin-TipPin">
        已安装
        <span style="float: right">
          {{ Object.keys(plugins)?.length || 0 }} 个
        </span>
      </p>
      <el-scrollbar>
        <li @click="selectPlugin(index)"
            :class="{ 'select': select === index }" class="plugin-item"
            :key="plugin.pluginInfo.name" v-for="(plugin, index) in plugins">
          <PluginIcon :alt="plugin.pluginInfo.name" :icon="plugin.pluginInfo.icon" />
<!--          <img :alt="plugin.pluginInfo.name" src="@assets/TalexTouchChat-Small.png" />-->

          <span class="plugin-version">{{ plugin.pluginInfo.version }}</span>

          <div class="plugin-wrapper">
            <p class="plugin-name">{{ plugin.pluginInfo.name }}</p>
            <p class="plugin-description">{{ plugin.pluginInfo.description }}</p>

  <!--          <div class="plugin-authors">-->
  <!--            <span class="plugin-author" v-for="author in plugin.pluginInfo.authors" :key="author.name">-->
  <!--              {{ author.name }}-->
  <!--            </span>-->
  <!--          </div>-->
          </div>
        </li>
      </el-scrollbar>
    </ul>

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
import PluginIcon from '@comp/plugin/PluginIcon.vue'

const plugins = reactive({})
const pluginInfoRef = ref()
const select = ref()

onMounted(() => {

  Object.assign(plugins, pluginManager.getPluginList())

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
.plugin-item {
  &.new-version {
    &:before {
      content: "新";
      position: absolute;
      padding: 0 2px;

      left: -50%;
      top: -25%;

      width: 100%;
      height: 40px;
      line-height: 60px;

      text-align: center;
      font-size: 12px;
      background-color: var(--el-color-danger);
      transform: rotate(-45deg) scale(.8);
    }
  }
  &:after {
    content: "";
    position: absolute;

    top: 20%;
    right: 5%;

    width: 10px;
    height: 60%;

    border-radius: 8px;
    background-color: var(--el-border-color-lighter);
    transition: all 0.2s ease-in-out;
  }
  &:hover {

    .plugin-version {
      background-color: var(--el-fill-color-dark);
    }

    &:after {
      background-color: var(--el-border-color);
    }

    opacity: .85;
    background-color: var(--el-fill-color-light);
  }
  &.select {
    .plugin-wrapper {
      .plugin-name {
        color: var(--el-fill-color-lighter);
      }

      .plugin-description {
        color: var(--el-fill-color);
      }

    }

    .plugin-version {
      background-color: var(--el-color-primary-light-3);
    }

    &:after {
      background-color: var(--el-color-primary-light-3);
    }

    background-color: var(--el-color-primary);
  }
  .PluginIcon-Container {
    padding: 8px;

    width: 48px;
    height: 48px;

    aspect-ratio: 1 / 1;
    :deep(.remix) {
      font-size: 48px;
    }
  }
  .plugin-wrapper {
    .plugin-name {
      margin: 0;

      font-weight: 600;
      font-size: 14px;
      color: var(--el-color-primary-light-3);
    }
    .plugin-description {
      margin: 0;

      font-size: 12px;
    }
    position: relative;
    padding-bottom: 2px;
    margin-left: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;

    height: 80%;
    flex: 1;

    box-sizing: border-box;
  }
  //.plugin-authors {
  //  .plugin-author {
  //    &:before {
  //      z-index: -1;
  //      content: "";
  //      position: absolute;
  //
  //      left: -1px;
  //      top: -1px;
  //
  //      width: 100%;
  //      height: 100%;
  //
  //      opacity: .35;
  //      border-radius: 4px;
  //      background-color: var(--el-fill-color-darker);
  //    }
  //    position: relative;
  //    padding: 2px 4px;
  //
  //    opacity: .75;
  //    border-radius: 4px;
  //  }
  //
  //  font-size: 12px;
  //}
  .plugin-version {
    position: absolute;
    padding: 2px 6px;

    top: 0;
    right: 10%;

    font-size: 12px;

    background-color: var(--el-fill-color-dark);
    border-radius: 0 0 4px 4px;
    transform: scale(.85);
    transition: all 0.2s ease-in-out;
  }

  position: relative;
  display: flex;
  margin: 2% 0;
  padding: 5px;

  align-items: center;

  left: 2%;

  width: 96%;
  height: 70px;

  border-radius: 8px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
  //border-bottom: 1px solid var(--el-border-color-light);

  cursor: pointer;
  list-style: none;
  box-sizing: border-box;
  overflow: hidden;
  transition: all 0.2s ease-in-out;
}

.Plugin-Container {
  position: relative;
  display: flex;

  width: 100%;
  height: 100%;

}

.Plugin-Info {
  flex: 1;

  background-color: var(--el-fill-color-light);
  transition: all .15s ease-in-out;
}

.Plugin-List {
  .Plugin-TipPin {
    margin: 0;
    padding: 1% 2%;

    font-size: 12px;
    opacity: .75;
    background-color: var(--el-fill-color);
    border-bottom: 1px solid var(--el-border-color-light);
    span {
      font-size: 10px;
      line-height: 15px;
    }
  }
  position: relative;
  margin: 0;
  padding: 0;

  width: 35%;
  min-width: 220px;
  max-width: 300px;

  background-color: var(--el-fill-color-lighter);
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;
}
</style>