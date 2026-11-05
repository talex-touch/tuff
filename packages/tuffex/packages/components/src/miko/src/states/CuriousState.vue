<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-curious">
    <g class="cat-tail">
      <rect x="24" y="7" width="2" height="5" :fill="color" />
      <rect x="25" y="6" width="2" height="2" :fill="color" />
    </g>
    <rect x="3" y="10" width="21" height="7" :fill="color" />
    <g class="curious-head">
      <rect x="6" y="5" width="2" height="3" :fill="color" />
      <rect x="14" y="7" width="3" height="2" :fill="color" />
      <rect x="5" y="7" width="12" height="6" :fill="color" />
      <rect x="6" y="9" width="2" height="2" fill="#000" />
      <rect x="12" y="10" width="2" height="2" fill="#000" />
      <rect x="6" y="9" width="1" height="1" fill="#fff" />
      <rect x="12" y="10" width="1" height="1" fill="#fff" />
    </g>
    <g class="question-mark">
      <rect x="19" y="2" width="3" height="1" fill="#F59E0B" />
      <rect x="21" y="3" width="1" height="2" fill="#F59E0B" />
      <rect x="20" y="4" width="1" height="1" fill="#F59E0B" />
      <rect x="20" y="6" width="1" height="1" fill="#F59E0B" />
    </g>
  </g>
</template>
