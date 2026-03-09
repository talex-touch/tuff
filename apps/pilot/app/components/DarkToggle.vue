<script setup lang="ts">
import { viewTransition } from '~/composables/theme/colors'

const color = useColorMode()

useHead({
  meta: [
    {
      id: 'theme-color',
      name: 'theme-color',
      content: () => (color.preference === 'dark' ? '#222222' : '#ffffff'),
    },
  ],
})
</script>

<template>
  <button class="!outline-none" @click="viewTransition">
    <div class="i-carbon-sun dark:i-carbon-moon" />
  </button>
</template>

<style>

</style>
