<template>
  <div class="AppLayout-Wrapper fake-background" :class="{ mica, coloring, contrast }">
    <FlatLayout>
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
          <AppLogo />
        </div>
      </template>
      <template #view>
        <router-view />

        <ViewPlugin />
      </template>
      <template #title>
        TalexTouch <span class="tag version fake-background">{{ packageJson.version }}</span>
      </template>
    </FlatLayout>
  </div>
</template>

<script name="AppLayout" setup>
import { inject, provide, ref, watch } from "vue";
import { $t } from "@modules/lang";
import IconButton from "@comp/base/button/IconButton.vue";
import AppLogo from "@comp/icon/AppLogo.vue";
import { pluginAdopter } from "@modules/hooks/adopters/plugin-adpoter";
import FlatLayout from "./flat/FlatLayout.vue";
import ViewPlugin from "~/views/base/plugin/ViewPlugin.vue";
import { themeStyle, triggerThemeTransition } from "@modules/storage/theme-style";

const packageJson = window.$nodeApi.getPackageJSON()

const plugins = ref()
const activePlugin = inject('activePlugin')
const account = window.$storage.account
provide('plugins', () => plugins.value)
watch(() => pluginAdopter.plugins.values(), val => plugins.value = [...val], { deep: true, immediate: true })
watch(() => pluginAdopter.plugins.size, () => plugins.value = [...pluginAdopter.plugins.values()])

const mica = computed(() => themeStyle.value.theme.window === 'Mica')
const coloring = computed(() => themeStyle.value.theme.addon.coloring)
const contrast = computed(() => themeStyle.value.theme.addon.contrast)

function openDevTools() {
  window.$nodeApi.openDevTools()
}

onMounted(() => {
  triggerThemeTransition([innerWidth / 2, innerHeight / 2], themeStyle.value.theme.style.auto ? 'auto' : themeStyle.value.theme.style.dark ? 'dark' : 'light')
})
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

  left: calc(var(--default-icon-addon, 10%) + 5px);

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
  .NavBar-Home {
    max-height: 300px;
  }

  z-index: 1000;
  position: relative;
  padding: 1rem .5rem;
  display: flex;

  flex-direction: column;

  left: 0;

  width: var(--nav-width, 30px);
  // height: 100%;

  flex: 1;
  // flex-shrink: 0;

  box-sizing: border-box;

  --fake-radius: 0;
  --fake-opacity: .25;
  transition: margin-right .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
  left .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
  width .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
  opacity .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

@keyframes viewEnter {
  from {
    opacity: 0;
    transform: translateX(100%) scale(.85)
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1)
  }
}

:deep(.AppLayout-Main) {
  position: relative;
  display: flex;

  flex: 1;
  height: calc(100% - var(--ctr-height, 40px));

  overflow: hidden;
}

:deep(.AppLayout-Header) {
  z-index: 1000;
  position: sticky;
  padding: 0 10px;
  display: flex;

  top: 0;

  height: var(--ctr-height, 40px);

  align-items: center;
  justify-content: center;

  box-sizing: border-box;

  --fake-opacity: .25;
  --fake-radius: 8px 8px 0 0;

  transition:
    margin-bottom .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
    top .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
    height .5s cubic-bezier(0.785, 0.135, 0.150, 0.860),
    opacity .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
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

.mica.AppLayout-Wrapper {
  --fake-inner-opacity: .75;
}

.AppLayout-Wrapper {
  span.tag.version {
    margin-left: 10px;

    width: 110px;

    opacity: .75;
    font-size: 12px;
  }

  :deep(.AppLayout-View) {
    z-index: 100;
    position: relative;

    //width: calc(100% - 70px);
    // height: calc(100% - 30px);
    flex: 1;

    flex: 1;

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

  --nav-width: 70px;
  --ctr-height: 40px;

  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
  -webkit-app-region: drag;
}
</style>