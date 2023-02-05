<template>
  <li :class="{ select }" class="PluginItem-Container">
    <PluginIcon :alt="plugin.pluginInfo.name" :icon="plugin.pluginInfo.icon" />

    <span class="plugin-version">{{ plugin.pluginInfo.version }}</span>

    <div class="plugin-wrapper">
      <p class="plugin-name">{{ plugin.pluginInfo.name }}</p>
      <p class="plugin-description">{{ plugin.pluginInfo.description }}</p>

    </div>
  </li>
</template>

<script>
import PluginIcon from '@comp/plugin/PluginIcon.vue'

export default {
  name: "PluginItem",
  components: { PluginIcon },
  props: ['plugin', 'select']
}
</script>

<style lang="scss" scoped>
.PluginItem-Container {
  &.new-version {
    &:before {
      content: "新";
      position: absolute;
      padding: 0 2px;

      left: -50%;
      top: -25%;

      width: 100%;
      height: 40px;
      line-height: 60px;

      text-align: center;
      font-size: 12px;
      background-color: var(--el-color-danger);
      transform: rotate(-45deg) scale(.8);
    }
  }
  &:after {
    content: "";
    position: absolute;

    top: 20%;
    right: 5%;

    width: 10px;
    height: 60%;

    border-radius: 8px;
    background-color: var(--el-border-color-lighter);
    transition: all 0.2s ease-in-out;
  }
  &:hover {

    .plugin-version {
      background-color: var(--el-fill-color-dark);
    }

    &:after {
      background-color: var(--el-border-color);
    }

    opacity: .85;
    background-color: var(--el-fill-color-light);
  }
  &.select {
    .plugin-wrapper {
      .plugin-name {
        color: var(--el-fill-color-lighter);
      }

      .plugin-description {
        color: var(--el-fill-color);
      }

    }

    .plugin-version {
      background-color: var(--el-color-primary-light-3);
    }

    &:after {
      background-color: var(--el-color-primary-light-3);
    }

    background-color: var(--el-color-primary);
  }
  .PluginIcon-Container {
    padding: 8px;

    width: 48px;
    height: 48px;

    aspect-ratio: 1 / 1;
    :deep(.remix) {
      font-size: 48px;
    }
  }
  .plugin-wrapper {
    .plugin-name {
      margin: 0;

      font-weight: 600;
      font-size: 14px;
      color: var(--el-color-primary-light-3);
    }
    .plugin-description {
      margin: 0;

      font-size: 12px;
    }
    position: relative;
    padding-bottom: 2px;
    margin-left: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;

    height: 80%;
    flex: 1;

    box-sizing: border-box;
  }
  //.plugin-authors {
  //  .plugin-author {
  //    &:before {
  //      z-index: -1;
  //      content: "";
  //      position: absolute;
  //
  //      left: -1px;
  //      top: -1px;
  //
  //      width: 100%;
  //      height: 100%;
  //
  //      opacity: .35;
  //      border-radius: 4px;
  //      background-color: var(--el-fill-color-darker);
  //    }
  //    position: relative;
  //    padding: 2px 4px;
  //
  //    opacity: .75;
  //    border-radius: 4px;
  //  }
  //
  //  font-size: 12px;
  //}
  .plugin-version {
    position: absolute;
    padding: 2px 6px;

    top: 0;
    right: 10%;

    font-size: 12px;

    background-color: var(--el-fill-color-dark);
    border-radius: 0 0 4px 4px;
    transform: scale(.85);
    transition: all 0.2s ease-in-out;
  }

  position: relative;
  display: flex;
  margin: 2% 0;
  padding: 5px;

  align-items: center;

  left: 2%;

  width: 96%;
  height: 70px;

  border-radius: 8px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
  //border-bottom: 1px solid var(--el-border-color-light);

  cursor: pointer;
  list-style: none;
  box-sizing: border-box;
  overflow: hidden;
  transition: all 0.2s ease-in-out;
}
</style>