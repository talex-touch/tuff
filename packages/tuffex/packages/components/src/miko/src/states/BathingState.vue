<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <g class="cat-tail">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="3" y="8" width="18" height="8" :fill="color" />
    <rect x="6" y="11" width="2" height="2" fill="#000" />
    <rect x="12" y="11" width="2" height="1" fill="#000" />
    <g class="paw-bath">
      <rect x="13" y="9" width="3" height="3" :fill="color" />
      <rect x="14" y="10" width="2" height="2" fill="#FF76A5" />
    </g>
    <rect x="9" y="13" width="2" height="1" fill="#FF76A5" />
  </g>
</template>
