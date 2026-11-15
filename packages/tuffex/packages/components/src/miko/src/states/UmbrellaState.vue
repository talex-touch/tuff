<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-umbrella">
    <g class="umbrella-item">
      <path d="M4,7 Q14,1 24,7 Z" fill="#10B981" />
      <rect x="3" y="7" width="22" height="1" fill="#059669" />
      <line x1="14" y1="7" x2="14" y2="14" stroke="#92400E" stroke-width="1.5" />
      <path d="M14,14 Q14,16 12,16" fill="none" stroke="#92400E" stroke-width="1.2" />
    </g>
    <rect x="7" y="9" width="2" height="2" :fill="color" />
    <rect x="15" y="9" width="2" height="2" :fill="color" />
    <rect x="6" y="11" width="14" height="6" :fill="color" />
    <rect x="8" y="12" width="2" height="2" fill="#000" />
    <rect x="14" y="12" width="2" height="2" fill="#000" />
    <rect x="8" y="12" width="1" height="1" fill="#fff" />
    <rect x="14" y="12" width="1" height="1" fill="#fff" />
    <rect x="12" y="13" width="3" height="2" fill="#fff" />
    <g class="rain-drops">
      <rect x="2" y="4" width="1" height="2" fill="#60A5FA" />
      <rect x="26" y="5" width="1" height="2" fill="#60A5FA" />
      <rect x="1" y="12" width="1" height="2" fill="#60A5FA" />
      <rect x="28" y="11" width="1" height="2" fill="#60A5FA" />
    </g>
  </g>
</template>
