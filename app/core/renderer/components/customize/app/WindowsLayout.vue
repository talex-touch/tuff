<template>
  <div class="AppLayout-Container Windows">
    <div class="AppLayout-Header fake-background">
      <div class="AppLayout-Icon">
        <img src="../../../assets/logo.svg" alt="logo">

        <slot name="title" />
      </div>

      <ul class="AppLayout-Controller">
        <remix-icon @click="closeWindow" name="close" />
        <remix-icon @click="minimizeWindow" name="subtract" />
      </ul>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <PlantNavBar>
          <template #plugin-nav>
            <slot name="plugin-nav" />
          </template>
        </PlantNavBar>

        <slot name="icon" />
      </div>

      <div class="AppLayout-View fake-background">
        <slot name="view" />
      </div>
    </div>
  </div>
</template>

<script>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import IconButton from '@comp/base/button/IconButton.vue'

export default {
  name: "AppLayoutWindows",
  components: { IconButton, RemixIcon }
}
</script>

<script setup>
import { inject } from 'vue'
import PlantNavBar from "@comp/customize/navbar/PlantNavBar.vue";

const account = window.$storage.account
const activePlugin = inject('activePlugin')

function minimizeWindow() {
  window.$nodeApi.minimize()
}

function closeWindow() {
  window.$nodeApi.close()
}
</script>

<style lang="scss">
.touch-blur {
  .AppLayout-Container {
    backdrop-filter: blur(100px) saturate(180%) brightness(1.2) !important;
  }
}
</style>

<style lang="scss" scoped>
.AppLayout-Container.Windows {
  .AppLayout-Header {
    .AppLayout-Icon {
      display: flex;

      align-items: center;

      text-indent: 5px;

      img {
        width: 28px;
      }
    }
    justify-content: start;
  }

  .AppLayout-Controller {
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
        --color: var(--el-color-error);
      }
      &:nth-child(2) {
        --color: var(--el-text-color-primary);
      }
    }
    position: absolute;
    display: flex;

    right: 0;

    height: 100%;
    width: max-content;

    justify-content: center;
    align-items: center;
    flex-direction: row-reverse;
  }
}
</style>