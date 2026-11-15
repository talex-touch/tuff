<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-cheer">
    <rect x="6" y="7" width="2" height="2" :fill="color" />
    <rect x="14" y="7" width="2" height="2" :fill="color" />
    <rect x="4" y="9" width="17" height="7" :fill="color" />
    <rect x="7" y="11" width="2" height="2" fill="#000" />
    <rect x="13" y="11" width="2" height="2" fill="#000" />
    <g class="glowstick-pink">
      <rect x="1" y="1" width="2" height="8" fill="#EC4899" />
      <rect x="1" y="8" width="3" height="2" fill="#fff" />
    </g>
    <g class="glowstick-cyan">
      <rect x="22" y="1" width="2" height="8" fill="#06B6D4" />
      <rect x="21" y="8" width="3" height="2" fill="#fff" />
    </g>
  </g>
</template>
