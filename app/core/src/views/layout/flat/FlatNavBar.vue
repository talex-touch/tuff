<template>
  <ul class="FlatNavBar-Home" @click="activePlugin = ''">
    <TouchMenu>
      <p class="FlatNavBar-Title">MAIN</p>
      <TouchMenuItem route="/home" name="Dashboard" icon="i-ri-home-3-line" />
      <TouchMenuItem route="/market" name="Market" icon="i-ri-quill-pen-line" />
      <TouchMenuItem route="/plugin" name="Plugin" icon="i-ri-plug-2-line" />
      <TouchMenuItem route="/application" name="Application" icon="i-ri-apps-2-line" />
      <TouchMenuItem route="/styles" name="Style" icon="i-ri-paint-line" />
      <TouchMenuItem route="/setting" name="Setting" icon="i-ri-settings-6-line" />
      <p class="FlatNavBar-Title">PLUGINS</p>
      <p op-50 font-size-3 text-center v-if="!plugins.length">NO PLUGIN INSTALLED.</p>
      <TouchMenuItem
        :id="`touch-plugin-item-${item.name}`"
        @active="changeActivePlugin($event, item)"
        :doActive="() => activePlugin === item.name"
        v-for="item in plugins"
        :key="item.name"
      >
        <span class="plugin-item-section">
          <PluginIcon :alt="item.name" :icon="item.icon" />
          {{ item.name }}
        </span>
      </TouchMenuItem>
    </TouchMenu>
  </ul>
</template>

<script lang="ts" name="FlatNavBar" setup>
import TouchMenu from "@comp/menu/TouchMenu.vue";
import TouchMenuItem from "@comp/menu/TouchMenuItem.vue";
import PluginIcon from "@comp/plugin/PluginIcon.vue";
import { ITouchPlugin } from "@talex-touch/utils/plugin";
import { inject } from "vue";

const activePlugin = inject("activePlugin");
const _plugins = inject("plugins");
const plugins = computed(() =>
  [...(_plugins.value || [])].filter(
    (item: ITouchPlugin) => item.status > 2 && item.status < 5
  )
);

function changeActivePlugin(event: Event, item: ITouchPlugin) {
  event.stopPropagation();

  activePlugin.value = item.name;
}
</script>

<style lang="scss" scoped>
.plugin-item-section {
  display: flex;
  align-items: center;
  justify-content: flex-start;

  .PluginIcon-Container,
  :deep(.html svg) {
    width: 20px;
    height: 20px;
  }
}

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
  position: relative;
  margin: 0;
  padding: 5px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;

  * {
    -webkit-app-region: no-drag;
  }
}
</style>
