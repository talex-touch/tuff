<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="6" y="6" width="2" height="2" :fill="color" />
    <rect x="14" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="18" height="8" :fill="color" />
    <rect x="7" y="10" width="2" height="2" fill="#000" />
    <rect x="13" y="10" width="2" height="2" fill="#000" />
    <rect x="8" y="10" width="1" height="1" fill="#38BDF8" />
    <rect x="14" y="10" width="1" height="1" fill="#38BDF8" />
    <g class="gamepad">
      <rect x="6" y="12" width="12" height="4" fill="#374151" />
      <rect x="7" y="13" width="2" height="2" fill="#06B6D4" />
      <rect x="15" y="13" width="2" height="2" fill="#EF4444" />
      <rect x="6" y="13" width="2" height="2" fill="#fff" />
      <rect x="16" y="13" width="2" height="2" fill="#fff" />
    </g>
  </g>
</template>
