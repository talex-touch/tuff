<template>
  <div class="FlatLayout-Icon">
    <img src="../../../assets/logo.svg" alt="logo">
    <span @click="applicationUpgrade">
      <slot name="title" />
    </span>
  </div>

  <span>
    {{ route.name }}
  </span>

  <ul class="FlatLayout-Controller">
    <remix-icon @click="minimizeWindow" name="subtract" />
    <remix-icon @click="closeWindow" name="close" />
  </ul>
</template>

<script name="FlatController" setup>
import { useRoute } from 'vue-router'
import { applicationUpgrade } from "@modules/hooks/application-hooks";
import RemixIcon from '@comp/icon/RemixIcon.vue'

const route = useRoute()

function minimizeWindow() {
  window.$nodeApi.minimize()
}

function closeWindow() {
  window.$nodeApi.close()
}
</script>

<style lang="scss">
.FlatLayout-Icon {
  & span {
    .has-update &:after {
      content: '';
      position: absolute;

      margin-left: 10px;
      margin-top: 5px;

      width: 8px;
      height: 8px;

      border-radius: 50%;
      background-color: var(--el-color-warning);

      animation: breathing 1.5s ease-in-out infinite;
    }

    .has-update & {
      pointer-events: all;
      cursor: pointer;

      :deep(span) {
        background-color: var(--el-color-warning-light-7) !important;
      }
    }

    .touch-blur & {
      opacity: .75;
    }

    padding: 4px 2px;
    font-size: 12px;

    pointer-events: none;
    -webkit-app-region: no-drag;
  }

  :deep(.tag) {
    padding: 4px 6px;
    --fake-radius: 4px;
    border-radius: 4px;
  }

  display: flex;
  padding: 0 0 0 .5%;

  height: var(--ctr-height);
  width: var(--nav-width);

  align-items: center;
  text-indent: 5px;
  box-sizing: border-box;

  img {
    width: 24px;
  }

}

.FlatLayout-Controller {
  .remix {
    &:hover {
      color: var(--el-fill-color-light);
      background-color: var(--color);
    }

    position: relative;
    display: flex;

    justify-content: center;
    align-items: center;

    width: 50px;
    height: 100%;

    cursor: pointer;
    font-size: 20px;
    color: var(--el-text-color-primary);

    --fake-radius: 0;
    transition: .25s;

    &:first-child {
      --color: var(--el-text-color-primary);
    }

    &:nth-child(2) {
      --color: var(--el-color-error);
    }
  }

  position: relative;
  display: flex;

  right: 0;

  height: 30px;
  width: max-content;

  -webkit-app-region: no-drag;
}
</style>