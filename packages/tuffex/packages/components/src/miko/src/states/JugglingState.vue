<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="5" y="7" width="2" height="2" :fill="color" />
    <rect x="13" y="7" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="4" height="2" :fill="color" />
    <rect x="12" y="8" width="4" height="2" :fill="color" />
    <rect x="3" y="9" width="16" height="2" :fill="color" />
    <rect x="2" y="11" width="20" height="5" :fill="color" />
    <g class="juggle-ball-1">
      <rect x="6" y="2" width="3" height="3" fill="#10B981" />
    </g>
    <g class="juggle-ball-2">
      <rect x="14" y="1" width="3" height="3" fill="#3B82F6" />
    </g>
    <g class="juggle-ball-3">
      <rect x="21" y="3" width="3" height="3" fill="#F59E0B" />
    </g>
    <rect x="6" y="11" width="2" height="2" fill="#000" />
    <rect x="13" y="11" width="2" height="2" fill="#000" />
  </g>
</template>
