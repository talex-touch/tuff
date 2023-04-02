<template>
  <div class="NavBarInner-Container">
    <ul class="NavBar-Controller">
      <component :closeWindow="closeWindow" :minimizeWindow="minimizeWindow" v-if="controller.comp" :is="controller.comp" />
    </ul>

    <div class="NavBarInner-Main">
      <component v-model="activePlugin" v-if="navbar.comp" :is="navbar.comp" />
<!--      <LeafNavBar v-model="activePluginName" />-->
    </div>

    <div class="NavBar-Logo">
      <LottieFrame />

      <div class="NavBar-Logo-Footer">
        {{ activePlugin }}
        <span v-if="account.user" class="NavBar-Footer-LoginStatus">
          {{ account.user.username }} 已登录
        </span>
        <el-tooltip :content="$t('nav.footer-tool.open-devtool')">
          <icon-button @click="openDevTools" small plain icon="code-s-slash"></icon-button>
        </el-tooltip>
      </div>
      <img src="@assets/logo.svg" alt="logo">
    </div>

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
import { inject, onMounted, shallowReactive, watch } from 'vue'
import { $t } from '@modules/lang'
import LottieFrame from '@comp/icon/lotties/LottieFrame.vue'

const account = window.$storage.account
const activePlugin = inject('activePlugin')

const controller = shallowReactive({
  comp: null,
  list: {
    'MacOS': () => import('@comp/customize/controller/MacOSController.vue'),
    'Windows': () => import('@comp/customize/controller/WindowsController.vue')
  }
})

const navbar = shallowReactive({
  comp: null,
  list: {
    '轻盈': () => import('@comp/customize/navbar/LeafNavBar.vue'),
    '丰富': () => import('@comp/customize/navbar/PlantNavBar.vue')
  }
})

async function loadModule(module) {
  const m = module instanceof Function ? await module() : await module
  return m.default
}

onMounted(async () => {
  const config = window.$storage.paintCustom

  watch(config, async () => {

    controller.comp = await loadModule(controller.list[config[1]] || controller.list.MacOS)
    navbar.comp = await loadModule(navbar.list[config[2]] || navbar.list.轻盈())

  }, {
    deep: true,
    immediate: true
  })

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
.NavBar-Logo-Footer {
  .NavBar-Footer-LoginStatus {
    position: absolute;

    left: 48px;

    opacity: .8;
    font-size: 12px;
  }
}

.NavBarInner-Main {
  position: relative;
  padding: 10px 0;
  display: flex;

  flex-direction: column;

  height: calc(94% - 40px);

  box-sizing: border-box;
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
  z-index: 100000;
  position: absolute;

  left: calc(10% + 5px);

  min-width: 400px;
  min-height: 400px;

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