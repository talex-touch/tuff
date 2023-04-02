<template>
  <div class="NavBar-Wrapper">
    <div class="NavBar-Container fake-background">
      <NavBarInner />
    </div>
    <div id="NavBar-View" class="NavBar-View fake-background">
      <keep-alive>
        <router-view></router-view>
      </keep-alive>

<!--      <teleport to=".NavBar-View">-->
        <div class="Blur-Container fake-background" :class="{ blur: options.blur, display: activePlugin?.length }">
          <PluginView />
        </div>
<!--      </teleport>-->
    </div>

  </div>
</template>

<script>
import NavBarInner from '@comp/layout/NavBarInner.vue'
import PluginView from "@comp/plugin/PluginView.vue";

export default {
  name: "NavBar",
  components: { PluginView, NavBarInner }
}
</script>

<script setup>
import { provide, ref, watch } from "vue";
import { pluginManager } from "@modules/samples/node-api";

const options = window.$storage.themeStyle

const activePlugin = ref("")
watch(() => activePlugin.value, val => pluginManager.changeActivePlugin(val))

provide("activePlugin", activePlugin)
</script>

<style lang="scss" scoped>
.Blur-Container {
  &.display {
    opacity: 1;
    pointer-events: unset;
  }
  z-index: 1000;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  transition: .25s;
  border-radius: 0 8px 8px 0;

  --fake-opacity: .75;
  //backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
}

html.blur .Blur-Container {
  backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
}

html.coloring .Blur-Container {
  top: 2px;

  height: calc(100% - 8px);
  width: calc(100% - 68px);
}

html.fullscreen .Blur-Container {
  top: 0;
  left: 0;

  width: 100%;
  height: 100%;
}

.blur .NavBar-Wrapper {
  .NavBar-Container {
    --fake-opacity: .65;
    backdrop-filter: blur(100px) saturate(180%) brightness(1.8);
  }

  .NavBar-View {
    --fake-opacity: .75;
    backdrop-filter: blur(100px) saturate(180%) brightness(1.5);
  }
}

.NavBar-Wrapper {
  .NavBar-Container {
    .fullscreen & {
      width: 0;
      opacity: 0;
    }
    z-index: 1000;
    position: relative;

    width: 70px;
    height: 100%;

    --fake-radius: 0;
    -webkit-app-region: drag;
    --fake-color: var(--el-fill-color-lighter);
    transition: .25s;
  }
  .NavBar-View {
    .fullscreen & {
      width: 100%;
    }
    z-index: 0;
    position: relative;
    //padding: 10px;

    width: calc(100% - 70px);
    height: 100%;

    box-sizing: border-box;
    --fake-radius: 0;
    --fake-color: var(--el-fill-color-lighter);
    transition: .25s;
  }
  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
}
</style>