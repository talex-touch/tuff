<template>
  <div class="FlatLayout-Icon">
    <img src="../../../assets/logo.svg" alt="logo" />
    <span @click="applicationUpgrade">
      <slot name="title" />
    </span>
  </div>

  <span class="mx-auto">
    {{ route.name ?? route.path }}
  </span>

  <ul class="FlatLayout-Controller op-0">
     Use native window control instead
  </ul>
</template>

<script lang="ts" name="FlatController" setup>
import { useRoute } from "vue-router";
import { applicationUpgrade } from "~/modules/hooks/application-hooks";

const route = useRoute();
</script>

<style lang="scss">

.FlatLayout-Icon {
  & span {
    .has-update &:after {
      content: "";
      position: absolute;

      margin-left: 10px;
      margin-top: 4px;

      width: 8px;
      height: 8px;

      border-radius: 50%;
      background-color: var(--el-color-warning);

      animation: breathing 1.5s ease-in-out infinite;
    }

    .has-update & {
      pointer-events: all;
      cursor: pointer;

      span {
        background-color: var(--el-color-warning-light-7) !important;
      }

      // :deep(span) {
      //   background-color: var(--el-color-warning-light-7) !important;
      // }
    }

    .touch-blur & {
      opacity: 0.75;
    }

    padding: 4px 2px;
    font-size: 12px;

    pointer-events: none;
    -webkit-app-region: no-drag;
  }

  .tag {
    padding: 4px 6px;
    --fake-radius: 4px;
    border-radius: 4px;
  }

  body.darwin & {
    padding-right: 4px;
    flex-direction: row-reverse;
  }

  display: flex;
  padding: 0 0 0 0.5%;

  height: var(--ctr-height);
  width: var(--nav-width);

  align-items: center;
  text-indent: 5px;
  box-sizing: border-box;

  img {
    width: 24px;
  }
}
</style>
