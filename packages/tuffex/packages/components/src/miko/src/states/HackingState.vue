<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="3" y="8" width="19" height="8" :fill="color" />
    <g class="sunglasses">
      <rect x="4" y="10" width="12" height="3" fill="#111827" />
      <rect x="6" y="10" width="2" height="1" fill="#10B981" />
      <rect x="12" y="10" width="2" height="1" fill="#10B981" />
    </g>
    <g class="hack-matrix">
      <rect x="1" y="14" width="8" height="2" fill="#064E3B" />
      <rect x="2" y="14" width="1" height="1" fill="#34D399" />
      <rect x="5" y="14" width="2" height="1" fill="#34D399" />
      <rect x="3" y="15" width="2" height="1" fill="#10B981" />
    </g>
    <g class="hack-paws">
      <rect x="3" y="13" width="3" height="2" fill="#fff" opacity="0.8" />
      <rect x="6" y="12" width="3" height="2" fill="#fff" opacity="0.9" />
    </g>
  </g>
</template>
