<template>
  <teleport to="#app">
    <div class="WindowsController-Container fake-background">
      <div class="WindowsController-Title">
        <img src="@assets/logo.svg" alt="logo">
        TalexTouch
      </div>

      <div class="WindowsController-Controller">
        <IconButton @click="closeWindow" icon="close" plain small />
        <IconButton @click="minimizeWindow" icon="subtract" plain small />
      </div>
    </div>
  </teleport>
</template>

<script>
export default {
  name: "WindowsController"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import IconButton from '@comp/button/IconButton.vue'

const props = defineProps(['closeWindow', 'minimizeWindow'])
</script>

<style lang="scss">
//.NavBar-Controller {
//  height: 0 !important;
//
//  margin-bottom: -20px !important;
//}
//
//.NavBar-Wrapper {
//  top: 30px !important;
//
//  height: calc(100% - 30px) !important;
//}
</style>

<style lang="scss" scoped>
.WindowsController-Title {
  img {
    width: 24px;
    height: 24px;
  }
  position: relative;
  display: flex;

  left: 5px;

  align-items: center;
  font-size: 14px;

  color: var(--el-text-color-primary);
}

.WindowsController-Controller {
  position: absolute;
  display: flex;

  right: 0;
  height: 100%;

  float: right;

  -webkit-app-region: no-drag;

  .IconButton-Container {
    &:hover {
      opacity: .8;
    }

    width: 48px;
    height: 100%;

    border-radius: 0;
    --fake-radius: 0;
    background-color: var(--el-fill-color-dark);
  }
}

.WindowsController-Container {
  position: absolute;
  //padding: 0 30px;
  display: flex;

  align-items: center;

  top: 0;
  width: 100%;

  height: 30px;

  --fake-radius: 8px 8px 0 0;
  --fake-opacity: .65;
  box-sizing: border-box;
  backdrop-filter: blur(100px) saturate(180%) brightness(1.8);

  -webkit-app-region: drag;
}
</style>