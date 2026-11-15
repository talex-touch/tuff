<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-ninja">
    <rect x="4" y="8" width="2" height="2" :fill="color" />
    <rect x="12" y="8" width="2" height="2" :fill="color" />
    <rect x="3" y="9" width="18" height="7" :fill="color" />
    <rect x="21" y="9" width="3" height="2" :fill="color" />
    <rect x="23" y="7" width="2" height="3" :fill="color" />
    <rect x="2" y="9" width="15" height="2" fill="#18181B" />
    <rect x="7" y="9" width="4" height="2" fill="#E4E4E7" />
    <g class="ninja-ribbon">
      <rect x="0" y="8" width="3" height="1" fill="#EF4444" />
      <rect x="1" y="7" width="2" height="1" fill="#EF4444" />
    </g>
    <rect x="5" y="11" width="3" height="1" fill="#FDE047" />
    <rect x="11" y="11" width="3" height="1" fill="#FDE047" />
    <rect x="6" y="11" width="1" height="1" fill="#000" />
    <rect x="12" y="11" width="1" height="1" fill="#000" />
    <g class="ninja-shuriken">
      <polygon points="18,12 21,11 20,14 23,13 20,15 21,17 18,15 16,16 17,14 15,13" fill="#94A3B8" />
    </g>
  </g>
</template>
