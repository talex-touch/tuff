<script setup lang="ts">
import { computed } from 'vue'
import { stripLocalePrefix } from '~/utils/web-route'

const route = useRoute()

const hideFooter = computed(() => {
  return stripLocalePrefix(route.path) === '/updates' && route.query.view !== 'all'
})
</script>

<template>
  <div class="min-h-screen text-light">
    <TheHeader />
    <main class="relative z-1 w-full">
      <slot />
    </main>
  </div>
  <TuffFooter v-if="!hideFooter" />
</template>
