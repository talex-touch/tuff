<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-celebrate">
    <rect x="5" y="5" width="2" height="2" :fill="color" />
    <rect x="13" y="5" width="2" height="2" :fill="color" />
    <rect x="3" y="7" width="18" height="9" :fill="color" />
    <rect x="1" y="6" width="3" height="3" fill="#fff" />
    <rect x="20" y="6" width="3" height="3" fill="#fff" />
    <rect x="6" y="9" width="2" height="1" fill="#000" />
    <rect x="13" y="9" width="2" height="1" fill="#000" />
    <g class="confetti-stream">
      <rect x="3" y="1" width="2" height="2" fill="#FBBF24" />
      <rect x="10" y="2" width="2" height="2" fill="#EC4899" />
      <rect x="16" y="1" width="2" height="2" fill="#06B6D4" />
      <rect x="23" y="3" width="2" height="2" fill="#10B981" />
      <rect x="26" y="1" width="2" height="2" fill="#8B5CF6" />
    </g>
  </g>
</template>
