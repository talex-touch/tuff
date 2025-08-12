<script lang="ts" name="PluginListModule" setup>
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'

const props = defineProps<{
  modelValue: any
  plugins: any[]
  shrink: boolean
}>()

const emits = defineEmits(['update:modelValue'])

const value = useModelWrapper(props, emits)
</script>

<template>
  <div class="mb-12 min-h-16">
    <p class="my-4 flex justify-between items-center text-xs opacity-70">
      <span class="PluginList-Name flex items-center gap-2">
        <i v-if="shrink" class="i-ri-check-line text-base text-[var(--el-color-primary)]" />
        <i v-else class="i-ri-puzzle-line text-base text-[var(--el-color-primary)]" />
        <slot name="name" />
      </span>
      <span class="text-[var(--el-text-color-secondary)]">
        {{ plugins.length }}
      </span>
    </p>

    <!-- <p v-t="'base.empty-select'" :class="{ visible: Object.values(plugins).length > 0 }" class="PluginList-Empty" /> -->
    <p
      :class="{ visible: Object.values(plugins).length > 0 }"
      class="PluginList-Empty"
      v-text="`No selection made.`"
    />

    <transition-group name="list">
      <div
        v-for="(plugin, index) in Object.values(plugins)"
        :key="index"
        class="PluginList-Item fake-background flex items-center h-20 mx-1.25 my-2.5 px-2 cursor-pointer rounded-12px border-2 border-transparent overflow-hidden transition-250"
        :class="{ shrink, target: plugin.name === value, dev: plugin.dev?.enable }"
        @click="value = plugin.name"
      >
        <PluginIcon class="flex-shrink-0" :icon="plugin.icon" :alt="plugin.name" />

        <div class="PluginList-Item-Main">
          <p class="text-sm">{{ plugin.name }}</p>

          <p v-if="!shrink" class="text-xs">
            {{ plugin.desc }}
          </p>
          <div v-else class="PluginList-ShrinkStatus">
            <PluginStatus :plugin="plugin" :shrink="true" />
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style lang="scss" scoped>
.PluginList-Item-Main {
  margin-left: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .PluginList-ShrinkStatus {
    position: absolute;
    padding: 0.5rem 0;
    top: 50%;
    right: 5%;
    border-radius: 18px;
    transform: translateY(-50%);
    overflow: hidden;
  }

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
}

:deep(.PluginIcon-Container) {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1.25em;
  height: 1.25em;
  font-size: 32px;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-sizing: border-box;
  grid-column: 1;
  grid-row: 1 / 3;
}

.PluginList-Item {
  &.dev :deep(.PluginIcon-Container) {
    box-shadow: 0 0 4px 2px var(--el-color-warning-light-5);
  }

  &.target {
    pointer-events: none;
    border: 2px solid var(--el-color-primary-light-3);

    &:before {
      filter: invert(0);
    }

    --fake-opacity: 0.5;
    --fake-inner-opacity: 0.5;
  }

  &.shrink {
    height: 64px;
    pointer-events: all !important;

    :deep(.PluginIcon-Container) {
      min-width: 32px;
      height: 32px;
      font-size: 24px;

      span {
        transform: scale(0.75);
      }
    }

    .PluginList-Item-Main {
      & :last-child {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
    }

    &:hover {
      border: 2px solid var(--el-color-primary-light-3);
    }
  }

  &:hover {
    border: 2px solid var(--el-border-color);

    &:before {
      filter: invert(0.15);
    }

    --fake-opacity: 0.25;
    --fake-inner-opacity: 0.25;
  }

  --fake-opacity: 0;
  --fake-inner-opacity: 0;
}

.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.list-enter-from,
.list-leave-to {
  margin-bottom: -53px;
  opacity: 0;
  transform: translateX(30px);
}

.PluginList-Empty {
  margin: 0;
  margin-bottom: 18px;
  text-align: center;
  opacity: 0.75;
  font-size: 14px;
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

  &.visible {
    margin-bottom: -35px;
    opacity: 0;
    transform: translateY(20px);
  }
}
</style>
