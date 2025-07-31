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
      <p v-if="!plugins.length" op-50 font-size-3 text-center>NO PLUGIN INSTALLED.</p>
      <TouchMenuItem
        v-for="item in plugins"
        :id="`touch-plugin-item-${item.name}`"
        :key="item.name"
        :do-active="() => activePlugin === item.name"
        @active="changeActivePlugin($event, item)"
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
/**
 * Flat Navigation Bar Component
 *
 * This component provides a navigation bar for the flat layout.
 * It includes main navigation items and dynamically loaded plugin items.
 *
 * Features:
 * - Main navigation items (Dashboard, Market, Plugin, Application, Style, Setting)
 * - Dynamic plugin items based on installed plugins
 * - Active plugin highlighting
 */

import TouchMenu from '@comp/menu/TouchMenu.vue'
import TouchMenuItem from '@comp/menu/TouchMenuItem.vue'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import { ITouchPlugin } from '@talex-touch/utils/plugin'
import { computed, inject } from 'vue'

// Inject reactive values from parent components
const activePlugin: any = inject('activePlugin')
const _plugins: any = inject('plugins')

// Computed property to filter plugins by status
// Only show plugins with status > 2 and < 5 (active plugins)
const plugins = computed(() =>
  [...(_plugins.value || [])].filter((item: ITouchPlugin) => item.status > 2 && item.status < 5)
)

/**
 * Change the active plugin
 *
 * @param event - The click event
 * @param item - The plugin item that was clicked
 * @returns void
 */
function changeActivePlugin(event: Event, item: ITouchPlugin): void {
  event.stopPropagation()
  activePlugin.value = item.name
}
</script>

<style lang="scss" scoped>
/**
 * Plugin item section styling
 * Flex container for plugin icon and name
 */
.plugin-item-section {
  display: flex;
  align-items: center;
  justify-content: flex-start;

  /**
   * Plugin icon sizing
   * Ensures consistent icon size for both Vue components and HTML SVG elements
   */
  .PluginIcon-Container,
  :deep(.html svg) {
    width: 20px;
    height: 20px;
  }
}

/**
 * Navigation bar programs section styling
 * Container for additional program items (if any)
 */
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

/**
 * Navigation bar title styling
 * Used for section headers like "MAIN" and "PLUGINS"
 */
:deep(.FlatNavBar-Title) {
  margin: 0 0 10px 0;

  opacity: 0.25;
  font-size: 12px;
  font-weight: 600;
}

/**
 * Main navigation bar container styling
 * Full height container with padding and flex layout
 */
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
