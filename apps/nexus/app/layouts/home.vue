<script setup lang="ts">
const route = useRoute()

const hideFooter = computed(() => {
  return route.path === '/updates' && route.query.view !== 'all'
})
</script>

<template>
  <div class="min-h-screen text-light">
    <TheHeader class="z-10" />
    <main class="relative z-1 w-full">
      <slot />
    </main>
  </div>
  <TuffFooter v-if="!hideFooter" />
</template>
