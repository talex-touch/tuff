<script lang="ts" name="AppLayoutFlat" setup>
/**
 * FlatLayout Component
 *
 * This component provides a flat layout structure for the application.
 * It includes a header with a controller, a sidebar navigation, and a main content area.
 *
 * Slots:
 * - title: For the title content in the header
 * - icon: For icons in the footer
 * - view: For the main content area
 */
import FlatController from './FlatController.vue'
import FlatFooter from './FlatFooter.vue'
import FlatNavBar from './FlatNavBar.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
  }>(),
  {
    display: false,
  },
)

const isDisplayMode = computed(() => props.display)
</script>

<template>
  <div class="AppLayout-Container Flat" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <FlatController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="!isDisplayMode" #title>
          <slot name="title" />
        </template>
      </FlatController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <FlatNavBar />

        <div class="AppLayout-IconFooter">
          <slot v-if="!isDisplayMode" name="icon" />
          <FlatFooter v-if="!isDisplayMode" />
          <div v-else class="LayoutDisplay-Footer" />
        </div>
      </div>

      <div class="AppLayout-View fake-background">
        <slot v-if="!isDisplayMode" name="view" />
        <div v-else class="LayoutDisplay-View" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * Flat Layout Styles
 *
 * Provides styling for the flat layout structure including:
 * - Main container layout
 * - Header styling
 * - Sidebar navigation
 * - Main content area
 * - Footer with user information
 */

.AppLayout-Container.Flat {
  /**
   * Main content view styling
   * Positioned relative to the container
   * Takes up remaining width after sidebar
   */
  .AppLayout-View {
    position: relative;

    top: 0;
    left: 0;

    flex: none;

    width: calc(100% - var(--nav-width));

    overflow: hidden;
    --fake-radius: 8px 0 0 0;
    border-radius: 8px 0 0 0;
    box-sizing: border-box;
  }

  /**
   * Icon footer styling
   * Hidden by default, shown when user is logged in
   */
  .AppLayout-IconFooter {
    :deep(.AppLayout-Icon) {
      margin: 0;
      bottom: 0;
    }

    position: absolute;
    padding: 0;

    left: 0;
    bottom: 0;

    width: 100%;
    height: 110px;

    -webkit-app-region: no-drag;
  }
}

/**
 * Flat layout container variables and header styling
 */
.AppLayout-Container.Flat {
  --ctr-height: 40px;
  --nav-width: 200px;

  .AppLayout-Header {
    padding: 0;
    justify-content: space-between;

    body.darwin & {
      flex-direction: row-reverse;
      justify-content: center;
    }
  }
}

.AppLayout-Container.Flat.is-display {
  --ctr-height: 28px;
  --nav-width: 64px;

  min-height: 150px;
  padding: 6px 8px;
  gap: 4px;

  border-radius: 12px;
  pointer-events: none;

  .AppLayout-Header {
    padding: 4px 6px;
    border-bottom: none;
    gap: 10px;
  }

  .AppLayout-Aside {
    padding: 4px;
    border-right: none;
  }

  .AppLayout-IconFooter {
    position: relative;
    height: auto;
    min-height: 36px;
  }

  :deep(.TouchMenuItem-Container) {
    padding: 0.3rem;
    margin: 0.15rem 0;
    min-height: 20px;
    --fake-inner-opacity: 0.35;
  }

  .LayoutDisplay-View,
  .LayoutDisplay-Footer {
    width: 100%;
    background: var(--el-fill-color-darker);
    border-radius: 8px;
    opacity: 0.65;
  }

  .LayoutDisplay-View {
    height: 100%;
  }

  .LayoutDisplay-Footer {
    height: 34px;
    margin-top: 8px;
  }
}
</style>
