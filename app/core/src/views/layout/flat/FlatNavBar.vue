<template>
  <ul class="FlatNavBar-Home" @click="activePlugin = ''">
    <TouchMenu>
      <p class="FlatNavBar-Title">MAIN</p>
      <TouchMenuItem route="/home" name="Dashboard" icon="i-ri-home-3-line" />
      <TouchMenuItem route="/market" name="Market" icon="i-ri-quill-pen-line" />
      <TouchMenuItem route="/plugin" name="Plugin" icon="i-ri-plug-2-line" />
      <TouchMenuItem route="/styles" name="Style" icon="i-ri-paint-line" />
      <TouchMenuItem route="/application" name="Application" icon="i-ri-apps-2-line" />
      <TouchMenuItem route="/setting" name="Setting" icon="i-ri-settings-6-line" />
      <p class="FlatNavBar-Title">PLUGINS</p>
      <p op-50 font-size-3 text-center v-if="!plugins.length">NO PLUGIN INSTALLED.</p>
      <TouchMenuItem @active="changeActivePlugin($event, item)" :doActive="() => activePlugin === item.name"
        v-for="item in plugins" :key="item.name">
        {{ item.name }}
      </TouchMenuItem>
    </TouchMenu>
  </ul>
</template>

<script lang="ts" name="FlatNavBar" setup>
import TouchMenu from "@comp/menu/TouchMenu.vue";
import TouchMenuItem from "@comp/menu/TouchMenuItem.vue";
import { ITouchPlugin } from "@talex-touch/utils/plugin";
import { inject } from "vue";

const activePlugin = inject("activePlugin");
const _plugins = inject("plugins");
const plugins = computed(() =>
  _plugins().filter((item: ITouchPlugin) => item.status > 2 && item.status < 5)
);

function changeActivePlugin(event: Event, item: ITouchPlugin) {
  event.stopPropagation();

  activePlugin.value = item.name;
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
  --fake-radius: 8px;
  --fake-opacity: 0;

  -webkit-app-region: no-drag;

  :deep(.scale-upper.active) {
    .IconButton-Container {
      transform: scale(0.75);
    }
  }

  :deep(.IconButton-Container) {
    --fake-opacity: 0;
    --fake-inner-opacity: 0;
    --fake-radius: 8px;
    transform: scale(0.85);
  }
}

:deep(.FlatNavBar-Title) {
  margin: 0 0 10px 0;

  opacity: 0.25;
  font-size: 12px;
  font-weight: 600;
}

.FlatNavBar-Home {
  * {
    -webkit-app-region: no-drag;
  }

  position: relative;
  margin: 0;
  padding: 5px 0;
  display: flex;
  flex-direction: column;

  justify-content: space-between;

  width: 100%;

  box-sizing: border-box;
}
</style>
