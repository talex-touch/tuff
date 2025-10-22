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
          <div v-if="currentUser?.name" class="AppLayout-Footer">
            <div class="user-avatar">
              <img
                v-if="currentUser.avatar"
                :src="currentUser.avatar"
                :alt="currentUser.name"
                class="avatar-image"
              />
              <div v-else class="avatar-placeholder">
                {{ currentUser.name.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="user-info">
              <p class="user-name">
                {{ currentUser.name }}
              </p>
              <span class="user-email">
                {{ currentUser.email }}
              </span>
            </div>
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

import { useAuth } from '~/modules/auth/useAuth'
import FlatController from './FlatController.vue'
import FlatNavBar from './FlatNavBar.vue'

const { isLoggedIn, currentUser } = useAuth()
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
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0.5rem;
      position: absolute;
      width: 100%;
      height: 100%;
      box-sizing: border-box;

      .user-avatar {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        overflow: hidden;
        background: var(--el-color-primary-light-8);
        display: flex;
        align-items: center;
        justify-content: center;

        .avatar-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-8);
        }
      }

      .user-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;

        .user-name {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--el-text-color-primary);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-email {
          margin: 0;
          font-size: 11px;
          font-weight: 400;
          color: var(--el-text-color-regular);
          opacity: 0.8;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }

    position: absolute;
    padding: 0;

    left: 0;
    bottom: 0;

    width: 100%;
    height: 50px;

    --webkit-app-region: drag;
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
