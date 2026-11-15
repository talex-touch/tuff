<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <g class="cat-tail">
      <rect x="24" y="8" width="2" height="4" :fill="color" />
      <rect x="25" y="6" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="14" height="2" :fill="color" />
    <rect x="3" y="9" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="21" height="2" :fill="color" />
    <rect x="2" y="11" width="22" height="2" :fill="color" />
    <rect x="2" y="12" width="23" height="3" :fill="color" />
    <rect x="3" y="15" width="21" height="2" :fill="color" />
    <rect x="5" y="10" width="2" height="2" fill="#000" />
    <rect x="13" y="10" width="2" height="2" fill="#000" />
    <g class="cat-sparkle">
      <rect x="18" y="2" width="3" height="3" fill="#FFD700" />
      <rect x="19" y="1" width="1" height="5" fill="#FFD700" />
      <rect x="17" y="3" width="5" height="1" fill="#FFD700" />
    </g>
  </g>
</template>
