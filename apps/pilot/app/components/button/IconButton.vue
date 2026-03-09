<script setup lang="ts">
const props = defineProps<{
  stay?: boolean
  shining?: boolean
}>()
</script>

<template>
  <div :class="{ stay, shining }" class="IconButton">
    <slot />
  </div>
</template>

<style lang="scss">
@keyframes button_shining {
  0% {
    opacity: 0.5;
    transform: scale(0.75) rotate(0);
  }
  50% {
    opacity: 0.75;
    transform: scale(0.75) rotate(180deg);
  }
  100% {
    opacity: 0.5;
    transform: scale(0.75) rotate(360deg);
  }
}

.IconButton {
  &.stay {
    &::before {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.5;
      border-radius: 12px;
      background-color: var(--el-mask-color-extra-light);
    }
    backdrop-filter: blur(16px) saturate(180%);
  }
  &:active {
    transform: scale(0.75);
  }
  &:hover {
    background-color: var(--el-mask-color-extra-light);
  }

  &.shining {
    &::after {
      z-index: -2;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      --spread: 16px;
      opacity: 0.5;
      border-radius: 12px;
      box-shadow:
        -10px -10px var(--spread) 0px #5b51d8,
        0 -10px var(--spread) 0px #833ab4,
        10px -10px var(--spread) 0px #e1306c,
        10px 0 var(--spread) 0px #fd1d1d,
        10px 10px var(--spread) 0px #f77737,
        0 10px var(--spread) 0px #fcaf45,
        -10px 10px var(--spread) 0px #ffdc80;

      animation: button_shining 1s infinite linear;
    }
  }
  position: relative;
  display: flex;

  width: 2rem;
  height: 2rem;

  align-items: center;
  justify-content: center;

  cursor: pointer;
  transition: 0.25s;
  user-select: none;
  border-radius: 12px;
  box-shadow: var(--el-box-shadow);
}
</style>
