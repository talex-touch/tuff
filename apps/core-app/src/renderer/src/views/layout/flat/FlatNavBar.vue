<script lang="ts" name="FlatNavBar" setup></script>

<template>
  <ul class="FlatNavBar-Home">
    <slot />
  </ul>
</template>

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
