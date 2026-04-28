<script setup lang="ts">
defineProps<{
  src: string
}>()
</script>

<template>
  <div class="ImageView">
    <img :src="src" alt="">
  </div>
</template>

<style lang="scss" scoped>
.ImageView {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}
</style>
