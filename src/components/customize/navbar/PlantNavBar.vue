<template>
  <ul class="PlantNavBar-Home">
    <IconButton plain direct="/home" icon="home-3" />
    <IconButton plain direct="/market" icon="quill-pen"></IconButton>
    <IconButton plain direct="/plugin" icon="plug-2" />
    <IconButton plain direct="/setting" icon="settings-6"></IconButton>
  </ul>

  <ul class="NavBar-Programs">
    <slot name="plugin-nav" />
  </ul>
</template>

<script>
import IconButton from '@comp/button/IconButton.vue'

export default {
  name: "PlantNavBar",
  components: { IconButton }
}
</script>

<style lang="scss" scoped>
.NavBar-Programs {
  position: relative;
  padding: 0;
  display: flex;
  flex-direction: column;

  width: 100%;

  box-sizing: border-box;
  border-radius: 8px;
  --fake-color: var(--el-fill-color-light);
  --fake-radius: 8px;
  --fake-opacity: .35;

  :deep(.IconButton-Container) {
    transform: scale(.75);
  }
}

.PlantNavBar-Home {
  * {
    -webkit-app-region: no-drag;
  }
  :deep(.IconButton-Container) {

  }
  position: relative;
  margin: 0;
  padding: 10px 0;
  display: flex;
  flex-direction: column;

  justify-content: space-between;

  width: 100%;
  height: 50%;

  box-sizing: border-box;
}
</style>