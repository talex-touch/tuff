<template>
  <div class="AppLayout-Wrapper">
    <component v-if="layouts.source" :is="layouts.source">
      <template #icon>
        <div class="AppLayout-Icon fake-background">

          <div class="AppLayout-Icon-Footer">
            {{ activePlugin }}
            <span v-if="account.user" class="NavBar-Footer-LoginStatus">
          {{ account.user.username }} 已登录
            </span>
            <el-tooltip :content="$t('nav.footer-tool.open-devtool')">
              <icon-button @click="openDevTools" small plain icon="code-s-slash"></icon-button>
            </el-tooltip>
          </div>
          <img src="../../assets/logo.svg" alt="logo">
        </div>
      </template>
      <template #view>
        <slot name="view" />
      </template>
      <template #title>
        TalexTouch <span class="tag version fake-background" v-if="packageJson.version.indexOf('SNAPSHOT') !== -1 || packageJson.version.indexOf('Alpha') !== -1">{{packageJson.version }}</span>
      </template>
      <template #plugin-nav>
        <PluginNavList :plugins="plugins" v-model="activePlugin" />
      </template>
    </component>
  </div>
</template>

<script>
import AppLayoutInner from '@comp/layout/app/MacOSLayout.vue'

export default {
  name: "AppLayout",
  components: { AppLayoutInner }
}
</script>

<script setup>
import { inject, provide, ref, shallowReactive, watch } from "vue";
import { $t } from "@modules/lang";
import IconButton from "@comp/button/IconButton.vue";
import PluginNavList from "@comp/plugin/layout/PluginNavList.vue";
import { pluginAdopter } from "@modules/hooks/adopters/plugin-adpoter";

const options = window.$storage.themeStyle
const paintCustom = window.$storage.paintCustom
const packageJson = window.$nodeApi.getPackageJSON()

const layouts = shallowReactive({
  source: null,
  components: {
    'MacOS': () => import('@comp/layout/app/MacOSLayout.vue'),
    'Windows': () => import('@comp/layout/app/WindowsLayout.vue')
  }
})

watch(() => paintCustom[1], async val => {
  layouts.source = await loadModule(layouts.components[val] || layouts.components.MacOS)

}, { immediate: true })

async function loadModule(module) {
  const m = module instanceof Function ? await module() : await module
  return m.default
}

const plugins = ref()
const activePlugin = inject('activePlugin')
const account = window.$storage.account
watch(() => pluginAdopter.plugins, val => {
  plugins.value = val.values()

  provide('plugins', () => [val.values(), (cb) => {
    cb(val.values())
  }])
}, { deep: true, immediate: true })

function openDevTools() {
  window.$nodeApi.openDevTools()
}

// onMounted(async () => {
//   const config = window.$storage.paintCustom
//
//   watch(config, async () => {
//
//     controller.comp = await loadModule(controller.list[config[1]] || controller.list.MacOS)
//     AppLayout.comp = await loadModule(AppLayout.list[config[2]] || AppLayout.list.轻盈())
//
//   }, {
//     deep: true,
//     immediate: true
//   })
//
// })
</script>

<style lang="scss" scoped>
@keyframes iconEnter {
  0% {
    opacity: 0;
    filter: blur(10px) hue-rotate(180deg) invert(1) brightness(0.5) contrast(0.5) saturate(0.5) sepia(0.5);
  }
  100% {
    opacity: 1;
    filter: blur(0) hue-rotate(0deg) invert(0) brightness(1) contrast(1) saturate(1) sepia(0);
  }
}

.AppLayout-Icon {
  .AppLayout-Icon-Footer {
    .NavBar-Footer-LoginStatus {
      position: absolute;

      left: 48px;

      opacity: .8;
      font-size: 12px;
    }
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
    --fake-opacity: .9;
    backdrop-filter: blur(10px) brightness(.5);
    //background-color: var(--el-fill-color);
    .AppLayout-Icon-Footer {
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

  bottom: 20px;

  border-radius: 8px;

  user-select: none;
  -webkit-app-region: no-drag;
  clip-path: circle(50px at 0% 100%);
  filter: drop-shadow(0 0 5px var(--el-fill-color-darker));

  --fake-radius: 8px;
  --fake-opacity: 0;

  opacity: 0;
  animation: iconEnter .5s .35s ease-in-out forwards;
  transition: all 0.2s ease-in-out;
}

:deep(.AppLayout-Aside) {
  position: relative;
  padding: 10px;
  display: flex;

  flex-direction: column;

  width: 70px;
  height: calc(100% - 30px);

  box-sizing: border-box;

  --fake-radius: 0;
  --fake-opacity: .25;
  animation: asideEnter .125s ease-in;
}

@keyframes viewEnter {
  from {
    opacity: 0;
    transform: translateX(100%) scale(.85)
  }
  to {
    opacity: 1;
    transform:  translateX(0) scale(1)
  }
}

:deep(.AppLayout-Main) {
  position: relative;
  display: flex;

  height: 100vh;
}

:deep(.AppLayout-Header) {
  position: sticky;
  padding: 0 10px;
  display: flex;

  top: 0;

  height: 40px;

  align-items: center;
  justify-content: center;

  box-sizing: border-box;

  --fake-opacity: .25;
  --fake-radius: 8px 8px 0 0;
  animation: headEnter .125s ease-in;
}

:deep(.AppLayout-Controller) {
  position: relative;
  margin: 0;

  display: flex;

  justify-content: flex-start;

  width: 100%;
  height: 5%;

  list-style: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.blur .AppLayout-Wrapper {
  :deep(.AppLayout-Container) {
    backdrop-filter: blur(10px) saturate(180%) brightness(.8);
  }

  :deep(.AppLayout-View) {
    --fake-radius: 0;
    --fake-opacity: .65;
  }
}

.AppLayout-Wrapper {
  span.tag.version {
    margin-left: 10px;

    width: 110px;

    opacity: .75;
    font-size: 12px;
  }
  :deep(.AppLayout-View) {
    position: relative;

    width: calc(100% - 70px);
    height: calc(100% - 30px);

    box-sizing: border-box;

    opacity: 0;
    -webkit-app-region: no-drag;
    animation: viewEnter .25s .5s forwards;
  }
  :deep(.AppLayout-Container) {
    position: relative;
    //padding: 10px;

    height: 100%;
    width: 100%;

    box-sizing: border-box;
  }
  //.AppLayout-Container {
  //  .fullscreen & {
  //    width: 0;
  //    opacity: 0;
  //  }
  //  z-index: 1000;
  //  position: relative;
  //
  //  width: 70px;
  //  height: 100%;
  //
  //  --fake-radius: 0;
  //  -webkit-app-region: drag;
  //  --fake-color: var(--el-fill-color-lighter);
  //  transition: .25s;
  //}
  //.AppLayout-View {
  //  .fullscreen & {
  //    width: 100%;
  //  }
  //  z-index: 0;
  //  position: relative;
  //  //padding: 10px;
  //
  //  width: calc(100% - 70px);
  //  height: 100%;
  //
  //  box-sizing: border-box;
  //  --fake-radius: 0;
  //  --fake-color: var(--el-fill-color-lighter);
  //  transition: .25s;
  //}
  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
  -webkit-app-region: drag;
}
</style>