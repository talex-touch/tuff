<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-workout">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="12" height="2" fill="#EF4444" />
    <rect x="4" y="7" width="12" height="1" fill="#fff" opacity="0.6" />
    <rect x="3" y="9" width="16" height="8" :fill="color" />
    <rect x="5" y="11" width="2" height="1" fill="#000" />
    <rect x="11" y="11" width="2" height="1" fill="#000" />
    <rect x="14" y="9" width="1" height="2" fill="#38BDF8" class="sweat-drop" />
    <g class="dumbbell-l">
      <rect x="1" y="9" width="2" height="4" fill="#334155" />
      <rect x="3" y="10" width="2" height="2" fill="#64748B" />
      <rect x="4" y="10" width="2" height="2" fill="#fff" />
    </g>
    <g class="dumbbell-r">
      <rect x="17" y="9" width="2" height="2" fill="#64748B" />
      <rect x="19" y="9" width="2" height="4" fill="#334155" />
      <rect x="16" y="10" width="2" height="2" fill="#fff" />
    </g>
  </g>
</template>
