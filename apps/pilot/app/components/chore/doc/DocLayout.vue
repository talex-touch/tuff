<script setup lang="ts">
import Logo from '../Logo.vue'
import AccountAvatar from '../../personal/AccountAvatar.vue'
</script>

<template>
  <el-container class="DocumentTemplate">
    <el-header>
      <span flex items-center>
        <span class="head-start">
          <span font-bold>ThisAI</span>
        </span>
        文档中心
      </span>

      <div class="head-end">
        <el-input placeholder="搜索文档...">
          <template #append>
            Ctrl+K
          </template>
        </el-input>
      </div>
    </el-header>
    <el-container class="DocumentTemplate-Main">
      <slot />
    </el-container>
  </el-container>
</template>

<style lang="scss">
.DocumentTemplate {
  .el-header {
    .head-start {
      margin-right: 1rem;
      padding-right: 1rem;

      display: flex;
      align-items: center;

      border-right: 1px solid var(--el-border-color);
    }

    .head-end {
      .el-input {
        &__wrapper {
          box-shadow: none;
          border-radius: 8px 0 0 8px;
          background: var(--el-fill-color);
        }
        &-group__append {
          position: relative;
          padding: 0 10px;
          margin: auto 0;
          margin-right: 0.5rem;

          height: 20px;

          font-size: 12px;
          box-shadow: none;
          // background: var(--el-bg-color);
          border-radius: 4px;

          box-sizing: border-box;
        }
        right: 5px;

        background: var(--el-fill-color);
        border-radius: 8px;
      }
    }

    .AccountAvatar-Wrapper {
      margin-top: 7px;

      .el-avatar {
        width: 36px;
        height: 36px;
      }
    }
    padding: 0 1rem;
    display: flex;

    align-items: center;
    justify-content: space-between;

    width: 100%;

    border-bottom: 1px solid var(--el-border-color);
  }

  &-Main {
    position: relative;
    margin: 0;
    padding: 0;

    height: 100%;
    width: 100%;
    // max-width: 1680px;

    overflow: hidden;
  }

  position: absolute;
  display: flex;

  align-items: center;
  flex-direction: column;
  justify-content: center;

  width: 100%;
  height: 100%;

  background-color: var(--el-bg-color);
}
</style>
