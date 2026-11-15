<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="21" height="2" :fill="color" />
    <rect x="2" y="11" width="22" height="2" :fill="color" />
    <rect x="2" y="12" width="23" height="3" :fill="color" />
    <rect x="3" y="15" width="21" height="2" :fill="color" />
    <g class="cat-eyes-error">
      <rect x="5" y="10" width="1" height="1" fill="#EF4444" />
      <rect x="7" y="10" width="1" height="1" fill="#EF4444" />
      <rect x="6" y="11" width="1" height="1" fill="#EF4444" />
      <rect x="5" y="12" width="1" height="1" fill="#EF4444" />
      <rect x="7" y="12" width="1" height="1" fill="#EF4444" />
      <rect x="13" y="10" width="1" height="1" fill="#EF4444" />
      <rect x="15" y="10" width="1" height="1" fill="#EF4444" />
      <rect x="14" y="11" width="1" height="1" fill="#EF4444" />
      <rect x="13" y="12" width="1" height="1" fill="#EF4444" />
      <rect x="15" y="12" width="1" height="1" fill="#EF4444" />
    </g>
    <rect x="1" y="9" width="1" height="2" fill="#60A5FA" />
  </g>
</template>
