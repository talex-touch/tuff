<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-space">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="16" height="8" :fill="color" />
    <rect x="3" y="14" width="3" height="2" fill="#E2E8F0" />
    <rect x="16" y="14" width="3" height="2" fill="#E2E8F0" />
    <g class="space-helmet">
      <circle cx="10" cy="9" r="6.5" fill="rgba(56, 189, 248, 0.2)" stroke="#94A3B8" stroke-width="1.2" />
      <path d="M6,6 Q10,4 14,6" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.8" />
    </g>
    <rect x="7" y="9" width="2" height="2" fill="#000" />
    <rect x="12" y="9" width="2" height="2" fill="#000" />
    <rect x="7" y="9" width="1" height="1" fill="#fff" />
    <rect x="12" y="9" width="1" height="1" fill="#fff" />
    <path d="M20,12 Q24,16 28,11 T34,14" fill="none" stroke="#64748B" stroke-width="1" class="space-tether" />
    <g class="space-planet">
      <circle cx="28" cy="4" r="2" fill="#F59E0B" />
      <ellipse cx="28" cy="4" rx="4" ry="1" fill="none" stroke="#FDE047" stroke-width="0.6" />
    </g>
  </g>
</template>
