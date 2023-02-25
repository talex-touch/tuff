<template>
  <div class="NavBarInner-Container">
    <ul class="NavBar-Controller">
      <component :closeWindow="closeWindow" :minimizeWindow="minimizeWindow" v-if="controller.comp" :is="controller.comp" />
    </ul>

    <div class="NavBarInner-Main">
      <ul class="NavBar-Home" @click="changeActivePlugin('')">
        <IconButton direct="/home" icon="home-3" />
        <IconButton direct="/plugin" icon="plug-2" />
        <IconButton icon="quill-pen"></IconButton>
        <IconButton direct="/setting" icon="settings-6"></IconButton>
      </ul>

      <ul class="NavBar-Programs fake-background">
        <IconButton :select="activePluginName === plugin.pluginInfo.name" @click="changeActivePlugin(plugin.pluginInfo.name)" v-for="plugin in plugins">
          <el-tooltip placement="right" :content="plugin.pluginInfo.name">
            <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />
          </el-tooltip>
        </IconButton>
<!--        <IconButton icon="qq"></IconButton>-->
<!--        <IconButton icon="device"></IconButton>-->
        <IconButton direct="/market" icon="add"></IconButton>
      </ul>
    </div>

    <div class="NavBar-Logo">
      <div class="NavBar-Logo-Footer">
        <el-tooltip :content="$t('nav.footer-tool.open-devtool')">
          <icon-button @click="openDevTools" small plain icon="code-s-slash"></icon-button>
        </el-tooltip>
      </div>
      <img src="@assets/TalexTouchChat-Small.png" alt="logo">
    </div>

    <teleport to="body">
      <div class="Blur-Container" :class="{ blur: options.blur, display: activePluginName.length }">

      </div>
    </teleport>
  </div>
</template>

<script>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import IconButton from '@comp/button/IconButton.vue'

export default {
  name: "NavBarInner",
  components: { IconButton, RemixIcon }
}
</script>

<script setup>
import { computed, onMounted, reactive, ref, shallowReactive, watch } from 'vue'
import { pluginManager } from '@modules/samples/node-api'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import { $t } from '@modules/lang'
import { forApplyMention } from '@modules/mention/dialog-mention'

const controller = shallowReactive({
  comp: null,
  list: {
    'MacOS': () => import('@comp/customize/controller/MacOSController.vue'),
    'Windows': () => import('@comp/customize/controller/WindowsController.vue')
  }
})

const plugins = computed(() => Object.values(pluginManager.getPluginList()))

const activePluginName = ref("")

const options = window.$storage.themeStyle

function changeActivePlugin(name) {
  pluginManager.changeActivePlugin(activePluginName.value = (activePluginName.value === name ? "" : name))
}

async function loadModule(module) {
  const m = module instanceof Function ? await module() : await module
  return m.default
}

onMounted(async () => {
  const config = window.$storage.paintCustom

  watch(config, async () => {

    controller.comp = await loadModule(controller.list[config[1]] || controller.list.MacOS)

  }, {
    deep: true,
    immediate: true
  })

  await forApplyMention( "权限申请", "touch-music 请求获取您的 Touch账号", [
    {
      content: "同意",
      onClick: async () => {
        console.log( "同意" )
        return true
      }
    },
    {
      content: "拒绝",
      time: 18,
      onClick: async () => {
        console.log( "拒绝" )
        return true
      }
    },
    {
      content: "仅在使用中允许",
      type: 'info',
      onClick: async () => {
        console.log( "仅在使用中允许" )
        return true
      }
    }
  ] )
})


function openDevTools() {
  window.$nodeApi.openDevTools()
}

function minimizeWindow() {
  window.$nodeApi.minimize()
}

function closeWindow() {
  window.$nodeApi.close()
}
</script>

<style lang="scss" scoped>
.Blur-Container {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    height: 100%;
    width: 100%;

    opacity: 1;
    background-color: var(--el-bg-color);
  }
  &.display {
    opacity: 1;
    pointer-events: unset;
  }
  z-index: 1000;
  position: absolute;

  top: 0;
  left: 70px;

  width: calc(100% - 70px);
  height: 100%;

  opacity: 0;
  pointer-events: none;
  transition: .25s;
  border-radius: 0 8px 8px 0;
  //backdrop-filter: blur(18px);
}

html.blur .Blur-Container {
  &:before {
    opacity: .5;
  }
  backdrop-filter: blur(18px);
}

html.coloring .Blur-Container {
  top: 2px;

  height: calc(100% - 4px);
  width: calc(100% - 72px);
}

.NavBarInner-Main {
  ul {
    * {
      //position: relative;
      //display: inline;
      ////padding: 10px 0;
      //
      //float: left;
      //
      //left: 0;
      //
      //height: 20px;
      //width: 100%;
      //
      //list-style: none;
      //
      //cursor: pointer;
      //transition: all 0.2s ease-in-out;
      //
      //overflow: hidden;
      -webkit-app-region: no-drag;
      //&:hover {
      //  background-color: var(--el-fill-color-light);
      //}
    }
    position: relative;
    padding: 0;
    margin: 0;

    width: 100%;
  }
  position: relative;
  padding: 10px 0;
  display: flex;

  flex-direction: column;
  //justify-content: space-between;

  height: calc(94% - 40px);

  box-sizing: border-box;
}

.NavBar-Home {
  position: relative;
  padding: 10px 0;
  display: flex;
  flex-direction: column;

  justify-content: space-between;

  width: 100%;
  height: 50%;

  box-sizing: border-box;
}

.NavBar-Programs {
  position: relative;
  display: flex;
  flex-direction: column;

  //justify-content: space-evenly;
  top: 20px;

  width: 100%;
  //height: 45%;

  box-sizing: border-box;
  border-radius: 8px;
  --fake-color: var(--el-fill-color-light);
  --fake-radius: 8px;
  --fake-opacity: .35;

  :deep(.IconButton-Container) {
    transform: scale(.75);
  }
}

.NavBar-Logo {
  .NavBar-Logo-Footer {
    position: absolute;
    padding: 0 2%;

    bottom: 0;
    left: 0;
    right: 0;
    height: 45px;
    display: flex;
    justify-content: flex-end;
    align-items: center;

    background-color: var(--el-fill-color-dark);
    border-radius: 0 0 8px 8px;
    opacity: 0;
    transform: translateY(100%);
    box-sizing: border-box;
    transition: all .25s ease-in-out;
  }
  &:hover {
    clip-path: circle(200% at 0% 0%);
    box-shadow: var(--el-box-shadow);
    background-color: var(--el-fill-color);
    .NavBar-Logo-Footer {
      opacity: 1;
      transform: translateY(0);
    }
  }
  img {
    position: absolute;

    left: 5px;
    bottom: 5px;

    width: 32px;

  }
  z-index: 1;
  position: absolute;

  left: calc(10% + 5px);

  min-width: 400px;
  min-height: 400px;

  //width: 105%;

  bottom: 10px;

  border-radius: 8px;

  user-select: none;
  -webkit-app-region: no-drag;
  clip-path: circle(50px at 0% 100%);
  filter: drop-shadow(0 0 5px var(--el-fill-color-darker));

  transition: all 0.2s ease-in-out;
}

.NavBarInner-Container {
  position: relative;
  padding: 10px;

  height: 100%;
  width: 100%;

  box-sizing: border-box;
}

.NavBar-Controller {
  position: relative;
  padding: 3px 0;
  margin: 0;

  display: flex;

  justify-content: flex-start;

  width: 100%;
  height: 5%;

  list-style: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
</style>