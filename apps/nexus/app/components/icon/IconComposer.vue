<script setup lang="ts">
import Logo from './Logo.vue'

const route = useRoute()
const meta = computed(() => route.meta)
const layout = computed(() => meta.value.layout)

const title = computed(() => {
  if (layout.value === 'docs')
    return 'Docs'
  if (layout.value === 'store')
    return 'Store'
  if (layout.value === 'dashboard')
    return 'Dashboard'
  if (layout.value === 'license')
    return 'License'
  if (layout.value === 'default')
    return 'Default'
  if (layout.value === 'fullscreen')
    return 'Fullscreen'
  return ''
})
</script>

<template>
  <div class="IconComposer flex items-center gap-2">
    <Logo />
    <div class="IconComposer-Brand flex items-center gap-3">
      <span class="text-lg sm:text-xl font-sans">Tuff</span>
      <span class="text-lg sm:text-xl op-50 font-space-grotesk">Nexus</span>
      <transition name="fade">
        <div v-if="title" class="IconComposer-SubType flex gap-3 items-center">
          <span class="block text-xl op-25 scale-y-120">|</span>
          <span class="block text-xl text-primary font-medium">{{ title }}</span>
        </div>
      </transition>
    </div>
    <!-- <BetaIcon /> -->
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

.font-space-grotesk {
  font-family: 'Space Grotesk', sans-serif;
}
</style>
