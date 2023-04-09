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
        <PlantNavBar v-model="activePlugin" />

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
import IconButton from '@comp/button/IconButton.vue'

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
.blur {
  .AppLayout-Container {
    backdrop-filter: blur(40px) saturate(180%) brightness(1.2) !important;
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

@keyframes asideEnter {
  0% {
    transform: perspective(1px) scale(.95) translateX(-10px) rotate3d(0, .05, 0, 1deg);
  }
  100% {
    transform: perspective(1px) scale(1) translateX(0) rotate3d(0, 0, 0, 1deg);
  }
}

@keyframes headEnter {
  0% {
    transform: perspective(1px) scale(.95) translateY(-10px) rotate3d(.05, 0, 0, -1deg);
  }
  100% {
    transform: perspective(1px) scale(1) translateY(0) rotate3d(0, 0, 0, -1deg);
  }
}
</style>