<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-chef">
    <rect x="5" y="7" width="2" height="2" :fill="color" />
    <rect x="13" y="7" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="15" height="8" :fill="color" />
    <g class="chef-hat">
      <rect x="6" y="6" width="9" height="2" fill="#E2E8F0" />
      <rect x="5" y="2" width="11" height="4" fill="#FFFFFF" />
      <circle cx="6" cy="2" r="2" fill="#FFFFFF" />
      <circle cx="10.5" cy="1" r="2.5" fill="#FFFFFF" />
      <circle cx="15" cy="2" r="2" fill="#FFFFFF" />
    </g>
    <rect x="6" y="10" width="2" height="2" fill="#000" />
    <rect x="13" y="10" width="2" height="2" fill="#000" />
    <rect x="6" y="10" width="1" height="1" fill="#fff" />
    <rect x="13" y="10" width="1" height="1" fill="#fff" />
    <g class="chef-pan">
      <rect x="16" y="12" width="6" height="2" fill="#18181B" />
      <ellipse cx="25" cy="13" rx="5" ry="2.5" fill="#334155" stroke="#18181B" stroke-width="0.8" />
      <rect x="14" y="11" width="3" height="2" fill="#fff" />
    </g>
    <g class="tossing-food">
      <ellipse cx="25" cy="7" rx="2.5" ry="1.5" fill="#FBBF24" />
      <circle cx="25" cy="7" r="0.8" fill="#F97316" />
    </g>
  </g>
</template>
