<script setup lang="ts">
// Amicro source adaptations. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
withDefaults(defineProps<{ name?: string }>(), { name: 'arrow' })
const paths: Record<string, string> = {
  arrow: 'M4 12h16m-6-6 6 6-6 6', external: 'M14 4h6v6M20 4 10 14M10 4H4v16h16v-6',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', close: 'm6 6 12 12M18 6 6 18',
  up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', back: 'm15 5-7 7 7 7', forward: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6', bookmark: 'M6 4h12v16l-6-4-6 4Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M19 14a8 8 0 0 1-9-9 8.5 8.5 0 1 0 9 9Z',
  grid: 'M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z',
  list: 'M8 5h12M8 12h12M8 19h12M4 5h.01M4 12h.01M4 19h.01',
  stack: 'm12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  pip: 'M3 4h18v16H3ZM12 12h7v6h-7Z',
  help: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01',
  info: 'M12 10v7m0-10h.01',
}
</script>

<template>
  <svg class="tx-motion-control__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'dots'">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </template>
    <template v-else>
      <circle v-if="name === 'sun'" cx="12" cy="12" r="4" />
      <circle v-if="name === 'info' || name === 'help'" cx="12" cy="12" r="9" />
      <path :d="paths[name] || paths.arrow" />
    </template>
  </svg>
</template>

<style scoped>
.tx-motion-control__icon { display: block; width: 18px; height: 18px; flex: none; }
</style>
