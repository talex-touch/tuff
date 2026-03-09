<script setup lang="ts">
const props = defineProps<{
  text: string
  once?: boolean
  animation?: string
}>()
</script>

<template>
  <div class="TextShading" :class="{ once }">
    <span class="eraser" :style="animation || ''" v-text="`${text}`" />
  </div>
</template>

<style lang="scss">
.TextShading {
  &.once .eraser {
    animation: cubic-bezier(0.6, -0.28, 0.735, 0.045) erasing 2s forwards;
  }

  .eraser {
    color: transparent;
    background: linear-gradient(
      to right,
      var(--color, var(--el-text-color-primary)) 50%,
      #0000 calc(50% + 2rem)
    );

    opacity: 0;
    background-size: 200% 100%;
    background-position: -100% 0;

    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;

    // cubic-bezier(0.6, -0.28, 0.735, 0.045)
    animation: cubic-bezier(0.6, -0.28, 0.735, 0.045) erasing 2s infinite;
  }

  position: relative;
}

@keyframes erasing {
  to {
    opacity: 1;
    background-position: -200% 0;
  }
}
</style>
