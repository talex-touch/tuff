<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

function applySystemTheme(isDark: boolean) {
  const root = document.documentElement
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

let cleanup: (() => void) | null = null

onMounted(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => applySystemTheme(media.matches)

  onChange()

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
    cleanup = () => media.removeEventListener('change', onChange)
    return
  }

  // Compatibility for older WebView implementations.
  media.addListener(onChange)
  cleanup = () => media.removeListener(onChange)
})
onUnmounted(() => {
  cleanup?.()
  cleanup = null
})
</script>

<template>
  <NuxtPage />
</template>

<style>
body {
  margin: 0;
  color: var(--tx-text-color-primary);
  background: var(--tx-bg-color-page);
}

html[data-theme='dark'] {
  color-scheme: dark;
}

html[data-theme='light'] {
  color-scheme: light;
}
</style>
