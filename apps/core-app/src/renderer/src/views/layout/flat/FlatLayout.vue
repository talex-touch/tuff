<template>
  <div class="AppLayout-Container Flat">
    <div class="AppLayout-Header fake-background">
      <FlatController>
        <template #title>
          <slot name="title" />
        </template>
      </FlatController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <FlatNavBar />

        <div class="AppLayout-IconFooter" :class="{ active: isLoggedIn }">
          <slot name="icon" />
          <FlatFooter
            v-if="currentUser?.name"
            :current-user="currentUser"
            @click-download="handleDownloadClick"
          />
        </div>
      </div>

      <div class="AppLayout-View fake-background">
        <slot name="view" />
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

import { useAuth } from '~/modules/auth/useAuth'
import FlatController from './FlatController.vue'
import FlatNavBar from './FlatNavBar.vue'
import FlatFooter from './FlatFooter.vue'

const { isLoggedIn, currentUser } = useAuth()

const handleDownloadClick = () => {
  // TODO: Navigate to download center
  console.log('Open download center')
}
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
    &.active {
      transform: translate(0, 0);
    }

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

    -webkit-app-region: drag;
    transform: translate(0%, 100%);
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
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
</style>
