<template>
  <ul class="FlatNavBar-Home">
    <TouchMenu>
      <p class="FlatNavBar-Title">MAIN</p>
      <TouchMenuItem route="/home" name="Dashboard" icon="i-ri-home-3-line" />
      <TouchMenuItem route="/market" name="Market" icon="i-ri-quill-pen-line" />
      <TouchMenuItem route="/plugin" name="Plugin" icon="i-ri-plug-2-line" />
      <!-- <TouchMenuItem route="/application" name="Application" icon="i-ri-apps-2-line" /> -->
      <TouchMenuItem route="/styles" name="Style" icon="i-ri-paint-line" />
      <TouchMenuItem route="/setting" name="Setting" icon="i-ri-settings-6-line" />
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
 */

import TouchMenu from '@comp/menu/TouchMenu.vue'
import TouchMenuItem from '@comp/menu/TouchMenuItem.vue'
</script>

<style lang="scss" scoped>
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
 * Used for section headers like "MAIN"
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
