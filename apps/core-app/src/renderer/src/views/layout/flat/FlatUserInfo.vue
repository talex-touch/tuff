<template>
  <div :class="{ active: isLoggedIn }" class="FlatUserInfo">
    <template v-if="isLoggedIn && currentUser?.name">
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
    </template>
  </div>
</template>

<script lang="ts" setup>
import { useAuth } from '~/modules/auth/useAuth'

const { currentUser, isLoggedIn } = useAuth()
</script>

<style lang="scss" scoped>
/**
 * User Information Styling
 * Displays user avatar and information in a horizontal layout
 */

@keyframes user-info-enter {
  from {
    transform: translate(0, 100%);
  }
  to {
    transform: translate(0, 0);
  }
}

.FlatUserInfo {
  &.active {
    animation: user-info-enter 0.5s 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
  }
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0.5rem;
  width: 100%;
  box-sizing: border-box;

  transform: translate(0, 120px);

  &:before {
    content: '';
    position: absolute;
    padding: 0 5%;

    top: 0;
    left: 0;

    width: 100%;
    height: 1px;

    opacity: 0.5;
    background: linear-gradient(
      to right,
      transparent 5%,
      var(--el-border-color) 15%,
      var(--el-border-color) 85%,
      transparent 95%
    );
    background-repeat: no-repeat;
  }

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
</style>
