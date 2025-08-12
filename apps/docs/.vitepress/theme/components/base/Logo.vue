<template>
  <div class="About-Image">
    <img :src="Logo" alt="logo" />
  </div>
</template>

<script setup>
import Logo from './../../../../images/logo.svg'
</script>

<style lang="scss">
.About-Image {
  position: relative;

  width: 100%;
  aspect-ratio: 1 / 1;

  img {
    position: absolute;

    top: 0;
    right: 0;

    height: 100%;
  }
}
</style>