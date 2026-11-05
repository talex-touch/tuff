<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-dance">
    <g class="cat-tail-dance">
      <rect x="23" y="6" width="2" height="6" :fill="color" />
      <rect x="25" y="4" width="3" height="3" :fill="color" />
    </g>
    <rect x="6" y="5" width="2" height="2" :fill="color" />
    <rect x="14" y="5" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="17" height="9" :fill="color" />
    <rect x="1" y="9" width="3" height="2" fill="#fff" />
    <rect x="21" y="9" width="3" height="2" fill="#fff" />
    <rect x="6" y="9" width="2" height="2" fill="#000" />
    <rect x="13" y="10" width="2" height="1" fill="#000" />
    <g class="dance-note">
      <rect x="2" y="2" width="2" height="2" fill="#8B5CF6" />
      <rect x="3" y="1" width="1" height="3" fill="#8B5CF6" />
    </g>
  </g>
</template>
