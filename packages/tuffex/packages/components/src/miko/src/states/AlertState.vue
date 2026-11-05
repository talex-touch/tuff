<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="2" y="7" width="4" height="2" :fill="color" />
    <rect x="14" y="7" width="4" height="2" :fill="color" />
    <rect x="1" y="8" width="5" height="1" :fill="color" />
    <rect x="14" y="8" width="5" height="1" :fill="color" />
    <rect x="3" y="9" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="21" height="2" :fill="color" />
    <rect x="2" y="11" width="22" height="2" :fill="color" />
    <rect x="2" y="12" width="23" height="3" :fill="color" />
    <rect x="3" y="15" width="21" height="2" :fill="color" />
    <rect x="5" y="10" width="2" height="3" fill="#000" />
    <rect x="13" y="10" width="2" height="3" fill="#000" />
    <g class="cat-alert-mark">
      <rect x="19" y="1" width="2" height="4" fill="#EF4444" />
      <rect x="19" y="6" width="2" height="2" fill="#EF4444" />
    </g>
  </g>
</template>
