<template>
  <div class="PluginList-Module">
    <p class="PluginList-Title">
      <span class="PluginList-Name">
        <slot name="name" />
      </span>
      <span class="PluginList-Amo">
        {{ plugins.length }} 个
      </span>
    </p>

    <p :class="{ visible: Object.values(plugins).length > 0 }" class="PluginList-Empty" v-t="'base.empty-select'" />

    <transition-group name="list">
      <div @click="value = plugin" class="PluginList-Item fake-background"
           :class="{ shrink, target: plugin === value, dev: plugin.pluginInfo.pluginSubInfo?.dev?.enable }" v-for="(plugin, index) in Object.values(plugins)" :key="index" >
        <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />

        <div class="PluginList-Item-Main">
          <p>{{ plugin.pluginInfo.name }}</p>

          <p v-if="!shrink">{{ plugin.pluginInfo.description }}</p>
          <div v-else class="PluginList-ShrinkStatus">
            <PluginStatus :plugin="plugin" :shrink="true" />
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script>
export default {
  name: "PluginListModule"
}
</script>

<script setup>
import PluginIcon from "@comp/plugin/PluginIcon.vue";
import { useModelWrapper } from "@modules/utils";
import PluginStatus from "@comp/plugin/action/PluginStatus.vue";

const props = defineProps(['modelValue', 'plugins', 'shrink'])
const emits = defineEmits(['update:modelValue'])

const value = useModelWrapper(props, emits)
</script>

<style lang="scss" scoped>
.PluginList-Module {
  .PluginList-Title {
    .PluginList-Amo {
      font-size: 14px;
      color: var(--el-text-color-secondary);
    }
    //margin-bottom: -5px;

    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  margin-bottom: 40px;
  min-height: 80px;
}

.PluginList-Item {
  .PluginList-Item-Main {
    .PluginList-ShrinkStatus {
      position: absolute;

      top: 50%;

      right: 5%;

      border-radius: 8px;
      transform: translateY(-50%);
      overflow: hidden;
    }
    margin-left: 15px;
    & :first-child {
      margin: 0;

      font-weight: 600;
      font-size: 20px;
    }
    & :last-child {
      margin: 0;

      font-size: 14px;
      color: var(--el-text-color-secondary);
    }
    display: flex;
    height: 60%;

    flex-direction: column;
    justify-content: space-between;
  }
  :deep(.PluginIcon-Container) {
    display: flex;

    justify-content: center;
    align-items: center;

    grid-column: 1;
    grid-row: 1 / 3;

    width: 64px;
    height: 64px;

    font-size: 48px;

    border-radius: 50%;
    box-sizing: border-box;
    background-color: var(--el-fill-color);
  }
  &.target {
    pointer-events: none;

    border: 2px solid var(--el-color-primary);
    box-shadow: 0 0 4px 2px var(--el-color-primary-light-5);
  }
  &:after {
    // linear image
    z-index: -1;
    content: "";
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, var(--el-color-primary-light-9) 25%, transparent 50%, transparent 75%, var(--el-color-primary-light-9) 75%);
    background-size: 1px 1px;
  }
  &.dev {
    background: linear-gradient(45deg, rgba(254, 159, 14, 0.1) 25%, transparent 25%, transparent 50%, rgba(254, 159, 14, 0.2) 50%, rgba(254, 159, 14, 0.1) 75%, transparent 75%, transparent);
    background-size: 20px 30px;
  }
  &.shrink {
    :deep(.PluginIcon-Container) {
      width: 32px;
      height: 32px;

      font-size: 24px;
    }
    .PluginList-Item-Main {
      & :last-child {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
    }
    height: 40px;

    pointer-events: all !important;
  }
  &:hover {
    border: 2px solid var(--el-color-primary-light-5);
    box-shadow: 0 0 4px 1px var(--el-color-primary-light-5);

    &:after {
      background-size: 2px 2px;
    }
  }
  display: flex;
  padding: 0 20px;

  align-items: center;

  height: 80px;
  margin: 10px 5px;

  cursor: pointer;
  border-radius: 8px;
  border: 2px solid var(--el-border-color);
  box-shadow: 0 0 2px 1px var(--el-fill-color-dark);

  overflow: hidden;
  transition: .25s;
}

.list-move, /* 对移动中的元素应用的过渡 */
.list-enter-active,
.list-leave-active {
  transition: all 0.5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.list-enter-from,
.list-leave-to {
  margin-bottom: -53px;

  opacity: 0;
  transform: translateX(30px);
}

.PluginList-Empty {
  &.visible {
    //margin-top: 30px;
    //margin-bottom: -3px;

    opacity: 0;
    transform: translateY(20px);
  }
  margin-bottom: -35px;

  //top: 40px;
  //width: 100%;

  text-align: center;

  opacity: .75;
  font-size: 14px;

  transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}
</style>