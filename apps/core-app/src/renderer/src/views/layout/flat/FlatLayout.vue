<template>
  <div class="AppLayout-Container Flat" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <template v-if="isDisplayMode">
        <div class="LayoutDisplay-Line short" />
        <div class="LayoutDisplay-Line long" />
      </template>
      <FlatController v-else>
        <template #title>
          <slot name="title" />
        </template>
      </FlatController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <template v-if="isDisplayMode">
          <div class="LayoutDisplay-Block nav" />
          <div class="LayoutDisplay-Block footer" />
        </template>
        <template v-else>
          <FlatNavBar />

          <div class="AppLayout-IconFooter">
            <slot name="icon" />
            <FlatFooter />
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
import FlatNavBar from './FlatNavBar.vue'
import FlatFooter from './FlatFooter.vue'

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
  --nav-width: 56px;

  min-height: 140px;
  padding: 8px;

  .AppLayout-Header {
    padding: 6px 8px;
    gap: 6px;
    align-items: flex-start;
  }

  .AppLayout-Main {
    gap: 8px;
    padding-top: 4px;
    height: calc(100% - var(--ctr-height));
  }

  .AppLayout-Aside {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: var(--nav-width);
  }

  .AppLayout-View {
    width: calc(100% - var(--nav-width));
    border-radius: 8px 0 0 8px;
  }

  .LayoutDisplay-Line,
  .LayoutDisplay-Block,
  .LayoutDisplay-View {
    background: var(--el-fill-color-darker);
    border-radius: 6px;
    opacity: 0.85;
  }

  .LayoutDisplay-Line {
    height: 10px;
    margin: 6px 0;

    &.short {
      width: 50px;
      align-self: flex-start;
    }

    &.long {
      width: 110px;
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
      height: 22%;
      opacity: 0.5;
    }
  }

  .LayoutDisplay-View {
    width: 100%;
    height: 100%;
    border-radius: 8px 0 0 8px;
  }
}
</style>
