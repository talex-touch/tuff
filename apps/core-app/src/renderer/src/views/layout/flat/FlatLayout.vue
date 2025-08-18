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

        <div class="AppLayout-IconFooter" :class="{ active: account?.user?.username }">
          <slot name="icon" />
          <div v-if="account?.user?.username" class="AppLayout-Footer">
            <p>
              {{ account.user.username }}
              <IdentifiedIcon style="color: var(--el-color-success-dark-2)" />
            </p>
            <span> {{ account.user.email }}</span>
          </div>
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

import FlatController from './FlatController.vue'
import FlatNavBar from './FlatNavBar.vue'
import IdentifiedIcon from '@comp/icon/svg/IdentifiedIcon.vue'

// Import account store for user information
import { storageManager } from '~/modules/channel/storage'

// Use the account store
const account = storageManager.account
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
    display: none;

    &.active {
      transform: translate(0, 0);
    }

    &:before {
      content: '';
      position: absolute;

      top: -1px;
      left: 5%;

      width: 90%;
      height: 0;

      border-top: 1px solid var(--el-border-color);
    }

    :deep(.AppLayout-Icon) {
      margin: 0;
      bottom: 0;
    }

    /**
     * User information footer
     * Displays username and email when user is logged in
     */
    .AppLayout-Footer {
      & > p {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
      }

      & > span {
        margin: 0;
        font-size: 10px;
        font-weight: 400;
      }

      position: absolute;
      display: none;

      flex-direction: column;
      justify-content: center;

      top: 4px;
      right: 10px;

      width: calc(100% - 70px);
      height: 100%;

      font-size: 12px;
      box-sizing: border-box;
    }

    position: absolute;
    padding: 0;

    left: 0;
    top: calc(100% - 100px);

    width: 100%;
    height: 50px;

    // transform: translate(-100%, 0%);
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
