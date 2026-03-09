<script setup lang="ts">
import type { InputPlusProperty } from '../input/input'

const props = defineProps<{
  modelValue?: boolean
}>()
</script>

<template>
  <div class="Chat-StatusBar">
    <div class="Chat-StatusBar-Main">
      <div class="StatusBar-Start only-pc-display">
        <slot name="start" />
      </div>
      <span>科塔智爱可能会犯错，生成的内容仅供参考。</span>
      <div class="StatusBar-End">
        <slot name="end" />
        <ChoreVersionBar class="tag only-pc-display" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.Chat-StatusBar {
  .StatusBar-Start,
  .StatusBar-End {
    display: flex;

    height: 100%;
  }

  > span {
    mix-blend-mode: difference;
  }

  .tag {
    &.success {
      background-color: var(--el-color-success);
    }
    &.error {
      color: #fff;
      background-color: var(--el-color-danger);
    }

    &.warning {
      color: #000;
      background-color: var(--el-color-warning);
    }

    &.shining {
      animation: tag_shining 1s infinite;
    }

    padding: 0.25rem 0.5rem;
    display: flex;

    height: 100%;

    gap: 0.25rem;
    align-items: center;
    // line-height: 36px;

    mix-blend-mode: none;
    color: var(--el-text-color-primary);
  }

  // .mobile &,
  .apple.tablet & {
    .Chat-StatusBar-Main {
      justify-content: center;
    }

    padding-top: 14px;
    padding-bottom: 28px;
  }

  .mobile & {
    .Chat-StatusBar-Main {
      justify-content: center;
    }
  }

  .Chat-StatusBar-Main {
    position: absolute;

    top: 0;

    width: 100%;

    display: flex;

    align-items: center;
    justify-content: space-between;
  }

  z-index: 3;
  position: absolute;
  // padding: 0 1rem;

  left: 0;
  bottom: 0;

  height: 24px;
  width: 100%;

  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;

  backdrop-filter: blur(18px);
  // border-top: 1px solid var(--el-border-color);
  // background-color: var(--el-bg-color-page);
  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    background-color: var(--el-bg-color);
  }
}

@keyframes tag_shining {
  0% {
    opacity: 0.75;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.75;
  }
}
</style>
