<script lang="ts" setup>
import TuffCarouselAppleBlurImage from '../../../carousel/apple/AppleBlurImage.vue'
import VSCodeBackground from '~/images/assets/plugin-cards/vscode.jpg'
</script>

<template>
  <div class="PluginCardVSCode inset-0 h-full w-full flex items-center justify-center bg-[#010816]">
    <TuffCarouselAppleBlurImage
      :src="VSCodeBackground"
      :defer="true"
      alt="VSCode"
      class="absolute bottom-0 z-1 h-[80%] w-full object-cover"
    />
  </div>
</template>

<style scoped>
</style>
