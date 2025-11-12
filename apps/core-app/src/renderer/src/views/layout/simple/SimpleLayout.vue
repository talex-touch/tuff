<template>
  <div class="AppLayout-Container Simple" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <template v-if="isDisplayMode">
        <div class="LayoutDisplay-Line short" />
        <div class="LayoutDisplay-Line long" />
      </template>
      <SimpleController v-else>
        <template #title>
          <slot name="title" />
        </template>
      </SimpleController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <template v-if="isDisplayMode">
          <div class="LayoutDisplay-Block nav" />
          <div class="LayoutDisplay-Block footer" />
        </template>
        <template v-else>
          <SimpleNavBar />

          <div class="AppLayout-IconFooter">
            <slot name="icon" />
            <SimpleFooter />
          </div>
        </template>
      </div>

      <div class="AppLayout-View fake-background">
        <div v-if="isDisplayMode" class="LayoutDisplay-View" />
        <slot v-else name="view" />
      </div>
    </div>
  </div>
</template>

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
import SimpleNavBar from './SimpleNavBar.vue'
import SimpleFooter from './SimpleFooter.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
  }>(),
  {
    display: false
  }
)

const isDisplayMode = computed(() => props.display)
</script>

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
  --ctr-height: 28px;
  --nav-width: 60px;
  --fake-inner-opacity: 0;

  min-height: 140px;
  padding: 6px;

  .AppLayout-Header {
    padding: 6px 8px;
    gap: 6px;
    align-items: flex-start;
  }

  .AppLayout-Main {
    gap: 6px;
    padding: 4px 0 0;
    height: calc(100% - var(--ctr-height));
  }

  .AppLayout-Aside {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: var(--nav-width);
    border-right: none;
  }

  .AppLayout-View {
    width: calc(100% - var(--nav-width));
    border-radius: 6px;
  }

  .LayoutDisplay-Line,
  .LayoutDisplay-Block,
  .LayoutDisplay-View {
    background: var(--el-fill-color-darker);
    border-radius: 6px;
    opacity: 0.8;
  }

  .LayoutDisplay-Line {
    height: 10px;
    margin: 6px 0;

    &.short {
      width: 60px;
      align-self: flex-start;
    }

    &.long {
      width: 120px;
      align-self: flex-end;
    }
  }

  .LayoutDisplay-Block {
    width: 100%;
    margin: 0;

    &.nav {
      flex: 1;
    }

    &.footer {
      height: 20%;
      opacity: 0.5;
    }
  }

  .LayoutDisplay-View {
    width: 100%;
    height: 100%;
    border-radius: 6px;
  }
}
</style>
