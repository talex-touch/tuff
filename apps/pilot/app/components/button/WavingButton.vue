<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
}>()
</script>

<template>
  <div class="WavingButton" flex items-center gap-2>
    <slot />
  </div>
</template>

<style lang="scss">
@keyframes back-waving {
  0% {
    opacity: 0;
    background-position: 200% 0;
  }

  35% {
    opacity: 0;
    background-position: 200% 0;
  }

  40% {
    opacity: 0.25;
    background-position: 200% 0;
  }

  50% {
    opacity: 0.5;
    background-position: 0 0;
  }

  60% {
    opacity: 0.25;
    background-position: -200% 0;
  }

  65% {
    opacity: 0;
    background-position: -200% 0;
  }

  100% {
    opacity: 0;
    background-position: -200% 0;
  }
}

.WavingButton {
  &::before {
    z-index: -3;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    filter: blur(2px) saturate(180%);
    // overflow: hidden;
    border-radius: 16px;
    background-image: linear-gradient(
        to right,
        #0000 1%,
        var(--theme-color) 100%
      ),
      linear-gradient(to left, #0000 1%, var(--theme-color) 100%);
    background-size: 200% 100%;
    background-repeat: none;
    // background-position: -200% 0;
    // transition: 1s;
    animation: back-waving 10s linear infinite;
  }
  &::after {
    z-index: -2;
    content: '';
    position: absolute;

    top: -2px;
    left: -2px;

    width: calc(100% + 4px);
    height: calc(100% + 4px);

    filter: blur(10px) saturate(180%);
    // overflow: hidden;
    border-radius: 16px;
    background-image: linear-gradient(
        to right,
        #0000 1%,
        var(--el-bg-color) 100%
      ),
      linear-gradient(to left, #0000 1%, var(--el-bg-color) 100%);
    background-size: 200% 100%;
    background-repeat: none;
    // background-position: -100% 0;
    animation: back-waving 10s linear infinite;
  }

  &:hover {
    cursor: pointer;
    background-color: var(--el-fill-color);
  }
  position: relative;
  padding: 0.25rem 0.5rem;

  width: 100%;

  font-size: 14px;
  font-weight: 600;
  // overflow: hidden;
  border-radius: 16px;

  // box-shadow: var(--el-box-shadow);
  background-color: var(--el-fill-color-light);
  backdrop-filter: blur(18px) saturate(180%);
}
</style>
