<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-fishing">
    <rect x="5" y="7" width="2" height="2" :fill="color" />
    <rect x="11" y="7" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="15" height="9" :fill="color" />
    <rect x="6" y="9" width="2" height="2" fill="#000" />
    <rect x="11" y="9" width="2" height="2" fill="#000" />
    <rect x="6" y="9" width="1" height="1" fill="#fff" />
    <rect x="11" y="9" width="1" height="1" fill="#fff" />
    <g class="fishing-rod">
      <line x1="14" y1="12" x2="28" y2="4" stroke="#B45309" stroke-width="1.5" />
      <line x1="28" y1="4" x2="28" y2="14" stroke="#94A3B8" stroke-width="0.8" stroke-dasharray="2,1" />
      <rect x="27" y="13" width="2" height="2" fill="#EF4444" class="fishing-bobber" />
      <rect x="25" y="16" width="6" height="1" fill="#38BDF8" opacity="0.6" />
    </g>
    <g class="jumping-fish">
      <rect x="29" y="10" width="3" height="2" fill="#F97316" />
      <polygon points="32,9 34,11 32,13" fill="#F97316" />
    </g>
  </g>
</template>
