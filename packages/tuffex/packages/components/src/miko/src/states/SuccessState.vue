<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <g class="cat-tail">
      <rect x="24" y="5" width="2" height="6" :fill="color" />
      <rect x="23" y="3" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="5" width="2" height="2" :fill="color" />
    <rect x="13" y="5" width="2" height="2" :fill="color" />
    <rect x="4" y="6" width="4" height="2" :fill="color" />
    <rect x="12" y="6" width="4" height="2" :fill="color" />
    <rect x="3" y="7" width="14" height="2" :fill="color" />
    <rect x="3" y="8" width="18" height="2" :fill="color" />
    <rect x="2" y="9" width="21" height="2" :fill="color" />
    <rect x="2" y="10" width="22" height="2" :fill="color" />
    <rect x="2" y="11" width="23" height="3" :fill="color" />
    <rect x="3" y="14" width="21" height="2" :fill="color" />
    <rect x="4" y="10" width="1" height="1" fill="#000" />
    <rect x="5" y="9" width="2" height="1" fill="#000" />
    <rect x="7" y="10" width="1" height="1" fill="#000" />
    <rect x="12" y="10" width="1" height="1" fill="#000" />
    <rect x="13" y="9" width="2" height="1" fill="#000" />
    <rect x="15" y="10" width="1" height="1" fill="#000" />
    <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="9" y="12" width="2" height="1" fill="#000" />
  </g>
</template>
