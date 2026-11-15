<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="3" y="8" width="18" height="8" :fill="color" />
    <g class="spiral-eyes">
      <rect x="5" y="10" width="3" height="1" fill="#000" />
      <rect x="7" y="11" width="1" height="1" fill="#000" />
      <rect x="5" y="12" width="2" height="1" fill="#000" />
      <rect x="13" y="10" width="3" height="1" fill="#000" />
      <rect x="15" y="11" width="1" height="1" fill="#000" />
      <rect x="13" y="12" width="2" height="1" fill="#000" />
    </g>
    <g class="dizzy-stars">
      <rect x="9" y="2" width="2" height="2" fill="#FBBF24" />
      <rect x="17" y="3" width="1" height="1" fill="#FBBF24" />
    </g>
  </g>
</template>
