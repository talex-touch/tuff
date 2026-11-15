<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-stretch">
    <g class="cat-tail-stretch">
      <rect x="23" y="2" width="2" height="8" :fill="color" />
      <rect x="24" y="1" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="11" width="2" height="2" :fill="color" />
    <rect x="11" y="11" width="2" height="2" :fill="color" />
    <rect x="4" y="12" width="9" height="4" :fill="color" />
    <rect x="12" y="9" width="12" height="7" :fill="color" />
    <rect x="1" y="15" width="4" height="2" :fill="color" />
    <rect x="1" y="15" width="2" height="1" fill="#FF76A5" />
    <rect x="5" y="13" width="2" height="1" fill="#000" />
    <rect x="9" y="13" width="2" height="1" fill="#000" />
  </g>
</template>
