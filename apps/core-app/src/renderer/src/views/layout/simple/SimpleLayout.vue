<script lang="ts" name="AppLayoutSimple" setup>
/**
 * SimpleLayout Component
 *
 * This component provides a Simple layout structure for the application.
 * It includes a header with a controller, a sidebar navigation, and a main content area.
 *
 * Slots:
 * - title: For the title content in the header
 * - icon: For icons in the footer
 * - view: For the main content area
 */
import SimpleController from './SimpleController.vue'
import SimpleFooter from './SimpleFooter.vue'
import SimpleNavBar from './SimpleNavBar.vue'

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
  <div class="AppLayout-Container Simple" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <SimpleController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="!isDisplayMode" #title>
          <slot name="title" />
        </template>
      </SimpleController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <SimpleNavBar />

        <div class="AppLayout-IconFooter">
          <slot v-if="!isDisplayMode" name="icon" />
          <SimpleFooter v-if="!isDisplayMode" />
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
 * Simple Layout Styles
 *
 * Provides styling for the Simple layout structure including:
 * - Main container layout
 * - Header styling
 * - Sidebar navigation
 * - Main content area
 * - Footer with user information
 */

.AppLayout-Container.Simple {
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
    --fake-radius: 0;
    border-radius: 0;
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
 * Simple layout container variables and header styling
 */
.AppLayout-Container.Simple {
  --ctr-height: 40px;
  --nav-width: 200px;

  .AppLayout-Aside {
    --fake-inner-opacity: 0.5;
    border-right: 1px solid var(--el-border-color);
  }

  .AppLayout-Header {
    padding: 0;
    justify-content: space-between;

    --fake-opacity: 1;
    border-bottom: 1px solid var(--el-border-color);

    body.darwin & {
      flex-direction: row-reverse;
      justify-content: center;
    }
  }
}

.AppLayout-Container.Simple.is-display {
  --ctr-height: 26px;
  --nav-width: 68px;

  min-height: 150px;
  padding: 6px;
  gap: 4px;

  border-radius: 12px;
  pointer-events: none;

  .AppLayout-Header {
    padding: 4px 6px;
    border-bottom: none;
    gap: 8px;
  }

  .AppLayout-Main {
    gap: 6px;
  }

  .AppLayout-Aside {
    padding: 2px 4px;
    border-right: none;
  }

  .AppLayout-IconFooter {
    position: relative;
    height: auto;
    min-height: 32px;
  }

  :deep(.TouchMenuItem-Container) {
    padding: 0.25rem;
    margin: 0.2rem 0;
    min-height: 20px;

    --fake-inner-opacity: 0.4;
  }

  .LayoutDisplay-View,
  .LayoutDisplay-Footer {
    width: 100%;
    background: var(--el-fill-color-darker);
    border-radius: 8px;
    opacity: 0.6;
  }

  .LayoutDisplay-View {
    height: 100%;
  }

  .LayoutDisplay-Footer {
    height: 32px;
    margin-top: 6px;
  }
}
</style>
