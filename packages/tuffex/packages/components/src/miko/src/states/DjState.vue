<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-dj">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="12" height="9" :fill="color" />
    <g class="dj-headphones">
      <path d="M2,9 Q10,2 18,9" fill="none" stroke="#EF4444" stroke-width="1.8" />
      <rect x="1" y="8" width="3" height="4" rx="1" fill="#1E293B" />
      <rect x="16" y="8" width="3" height="4" rx="1" fill="#1E293B" />
    </g>
    <rect x="5" y="9" width="10" height="2" fill="#06B6D4" />
    <g class="dj-deck">
      <rect x="0" y="14" width="26" height="5" fill="#0F172A" />
      <circle cx="5" cy="16" r="3" fill="#18181B" stroke="#64748B" stroke-width="0.8" class="vinyl-l" />
      <circle cx="16" cy="16" r="3" fill="#18181B" stroke="#64748B" stroke-width="0.8" class="vinyl-r" />
      <rect x="4" y="14" width="2" height="2" fill="#fff" class="scratch-hand-l" />
      <rect x="15" y="14" width="2" height="2" fill="#fff" class="scratch-hand-r" />
      <rect x="22" y="15" width="1" height="3" fill="#10B981" class="eq-bar-1" />
      <rect x="24" y="14" width="1" height="4" fill="#F59E0B" class="eq-bar-2" />
    </g>
  </g>
</template>
