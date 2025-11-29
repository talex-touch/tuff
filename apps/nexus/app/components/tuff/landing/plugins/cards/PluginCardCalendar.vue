<script lang="ts" setup>
import CalendarBackground from '~/images/assets/plugin-cards/calendar.png'
</script>

<template>
  <div class="PluginCardCalendar inset-0 h-full w-full flex items-center justify-center bg-[#490F02]">
    <TuffCarouselAppleBlurImage
      :src="CalendarBackground"
      alt="Calendar"
      class="absolute bottom-0 z-1 h-[80%] w-full object-cover"
    />

    <div class="PluginCardNotion-Overlay absolute top-0 z-3 z-5 h-[30%] w-full bg-[#4E110280] backdrop-blur-sm" />
  </div>
</template>

<style scoped>
</style>
