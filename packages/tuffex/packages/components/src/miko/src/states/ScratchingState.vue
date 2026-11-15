<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="6" y="7" width="2" height="2" :fill="color" />
    <rect x="14" y="7" width="2" height="2" :fill="color" />
    <rect x="5" y="9" width="18" height="7" :fill="color" />
    <rect x="1" y="6" width="3" height="11" fill="#A87343" />
    <rect x="1" y="9" width="3" height="1" fill="#D4A373" />
    <rect x="1" y="13" width="3" height="1" fill="#D4A373" />
    <g class="scratch-paw-1">
      <rect x="3" y="8" width="3" height="2" fill="#fff" />
    </g>
    <g class="scratch-paw-2">
      <rect x="3" y="12" width="3" height="2" fill="#fff" />
    </g>
    <g class="scratch-spark">
      <rect x="4" y="7" width="1" height="1" fill="#FBBF24" />
      <rect x="4" y="14" width="1" height="1" fill="#FBBF24" />
    </g>
  </g>
</template>
