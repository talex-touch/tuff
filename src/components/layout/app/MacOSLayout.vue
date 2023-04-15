<template>
  <div class="AppLayout-Container MacOS">
    <div class="AppLayout-Header fake-background">
      <ul class="AppLayout-Controller">
        <remix-icon @click="closeWindow" name="close" />
        <remix-icon @click="minimizeWindow" name="subtract" />
      </ul>

      <slot name="title" />
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <LeafNavBar v-model="activePlugin">
          <template #plugin-nav>
            <slot name="plugin-nav" />
          </template>
        </LeafNavBar>

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
  name: "AppLayoutMacOS",
  components: { IconButton, RemixIcon }
}
</script>

<script setup>
import { inject } from 'vue'
import LeafNavBar from "@comp/customize/navbar/LeafNavBar.vue";

const account = window.$storage.account
const activePlugin = inject('activePlugin')

function minimizeWindow() {
  window.$nodeApi.minimize()
}

function closeWindow() {
  window.$nodeApi.close()
}
</script>

<style lang="scss" scoped>
.AppLayout-Container.MacOS {
  .AppLayout-Controller {
    .remix {
      &:hover {
        color: var(--el-text-color-primary);
      }
      width: 10px;
      height: 10px;

      border-radius: 50%;

      font-size: 10px;
      color: var(--color);
      cursor: pointer;
      background-color: var(--color);
      &:first-child {
        --color: var(--el-color-error);
      }
      &:nth-child(2) {
        --color: var(--el-color-warning);
      }
    }
    position: absolute;
    padding: 3px 0;
    display: flex;

    left: 10px;

    height: 100%;
    width: 50px;

    justify-content: center;
    align-items: center;

    gap: 10px;

    text-indent: 0;
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