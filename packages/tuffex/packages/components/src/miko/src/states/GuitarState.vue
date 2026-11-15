<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-guitar">
    <g class="cat-tail-guitar">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
      <rect x="26" y="6" width="2" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="18" height="8" :fill="color" />
    <rect x="5" y="9" width="2" height="2" fill="#000" />
    <rect x="13" y="9" width="2" height="2" fill="#000" />
    <rect x="5" y="9" width="1" height="1" fill="#fff" />
    <rect x="13" y="9" width="1" height="1" fill="#fff" />
    <rect x="8" y="11" width="3" height="1" fill="#000" />
    <g class="guitar-instrument">
      <rect x="1" y="9" width="2" height="2" fill="#B45309" />
      <rect x="3" y="10" width="6" height="2" fill="#D97706" />
      <rect x="9" y="9" width="6" height="6" fill="#DC2626" />
      <rect x="10" y="8" width="4" height="8" fill="#DC2626" />
      <circle cx="12" cy="12" r="1.5" fill="#18181B" />
      <rect x="3" y="11" width="10" height="0.5" fill="#FDE047" />
      <rect x="11" y="10" width="2" height="2" fill="#fff" class="strum-paw" />
      <rect x="4" y="11" width="2" height="2" fill="#fff" />
    </g>
    <g class="guitar-notes">
      <rect x="17" y="4" width="2" height="2" fill="#EC4899" />
      <rect x="19" y="3" width="1" height="3" fill="#EC4899" />
      <rect x="22" y="6" width="2" height="2" fill="#3B82F6" />
      <rect x="24" y="5" width="1" height="3" fill="#3B82F6" />
    </g>
  </g>
</template>
