<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="7" y="6" width="2" height="2" :fill="color" />
    <rect x="14" y="6" width="2" height="2" :fill="color" />
    <rect x="5" y="8" width="16" height="8" :fill="color" />
    <g class="broom">
      <rect x="3" y="6" width="1" height="8" fill="#B45309" />
      <rect x="1" y="14" width="4" height="3" fill="#FDE047" />
    </g>
    <rect x="6" y="16" width="1" height="1" fill="#9CA3AF" />
    <rect x="8" y="15" width="1" height="1" fill="#9CA3AF" />
  </g>
</template>
