<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="7" y="6" width="2" height="2" :fill="color" />
    <rect x="15" y="6" width="2" height="2" :fill="color" />
    <rect x="5" y="8" width="18" height="8" :fill="color" />
    <rect x="2" y="11" width="6" height="5" fill="#E5E7EB" />
    <rect x="3" y="12" width="4" height="1" fill="#4B5563" />
    <rect x="3" y="14" width="3" height="1" fill="#4B5563" />
    <g class="glasses">
      <rect x="7" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
      <rect x="12" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
    </g>
  </g>
</template>
