<script setup lang="ts">
interface Props {
  index: number
}

defineProps<Props>()
</script>

<template>
  <div
    class="apple-carousel-item rounded-3xl last:pr-[5%] md:last:pr-[33%]"
    :style="{ '--item-delay': `${0.2 * index}s` }"
  >
    <slot />
  </div>
</template>

<style scoped>
.apple-carousel-item {
  animation: apple-carousel-enter 0.5s ease-out both;
  animation-delay: var(--item-delay, 0s);
}

@keyframes apple-carousel-enter {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
