<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="3" y="8" width="19" height="8" :fill="color" />
    <rect x="6" y="10" width="2" height="1" fill="#000" />
    <rect x="12" y="10" width="2" height="1" fill="#000" />
    <g class="tasty-fish">
      <rect x="8" y="12" width="6" height="3" fill="#FBBF24" />
      <rect x="14" y="11" width="2" height="4" fill="#F59E0B" />
      <rect x="9" y="13" width="1" height="1" fill="#000" />
    </g>
    <g class="chewing-jaw">
      <rect x="7" y="14" width="3" height="2" fill="#fff" />
      <rect x="12" y="14" width="3" height="2" fill="#fff" />
    </g>
  </g>
</template>
