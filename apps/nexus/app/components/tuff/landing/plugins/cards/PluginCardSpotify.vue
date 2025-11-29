<script lang="ts" setup>
import SpotifyBackground from '~/images/assets/plugin-cards/spotify.png'
</script>

<template>
  <div class="PluginCardSpotify inset-0 h-full w-full flex items-center justify-center bg-[#000618]">
    <TuffCarouselAppleBlurImage
      :src="SpotifyBackground"
      alt="Spotify"
      class="absolute bottom-0 z-1 h-[80%] w-full object-cover"
    />

    <div class="PluginCardNotion-Overlay absolute top-0 z-3 z-5 h-[20%] w-full bg-[#00061850] backdrop-blur-sm" />
  </div>
</template>

<style scoped>
</style>
