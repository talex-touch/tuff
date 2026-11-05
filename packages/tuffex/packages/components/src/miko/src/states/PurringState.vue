<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-purr">
    <g class="cat-tail">
      <rect x="23" y="11" width="3" height="2" :fill="color" />
      <rect x="24" y="9" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="7" width="2" height="2" :fill="color" />
    <rect x="13" y="7" width="2" height="2" :fill="color" />
    <rect x="3" y="9" width="21" height="7" :fill="color" />
    <rect x="6" y="11" width="2" height="1" fill="#000" />
    <rect x="12" y="11" width="2" height="1" fill="#000" />
    <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="9" y="12" width="1" height="1" fill="#000" />
    <rect x="10" y="12" width="1" height="1" fill="#000" />
    <g class="purr-note-1">
      <rect x="24" y="4" width="2" height="2" fill="#06B6D4" />
      <rect x="25" y="3" width="1" height="3" fill="#06B6D4" />
    </g>
    <g class="purr-heart">
      <rect x="2" y="3" width="3" height="2" fill="#EC4899" />
      <rect x="3" y="5" width="1" height="1" fill="#EC4899" />
    </g>
  </g>
</template>
