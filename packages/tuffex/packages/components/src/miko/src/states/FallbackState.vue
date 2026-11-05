<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <g class="cat-tail">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
      <rect x="26" y="7" width="2" height="2" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="14" height="2" :fill="color" />
    <rect x="3" y="9" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="19" height="2" :fill="color" />
    <rect x="2" y="11" width="21" height="4" :fill="color" />
    <rect x="3" y="15" width="19" height="2" :fill="color" />
    <rect x="5" y="10" width="2" height="2" fill="#000" />
    <rect x="12" y="10" width="2" height="2" fill="#000" />
    <rect x="5" y="10" width="1" height="1" fill="#fff" />
    <rect x="12" y="10" width="1" height="1" fill="#fff" />
    <rect x="8" y="12" width="3" height="1" fill="#000" />
    <rect x="9" y="13" width="1" height="1" fill="#000" />
    <rect x="3" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
  </g>
</template>
