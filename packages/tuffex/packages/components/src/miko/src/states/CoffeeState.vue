<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-coffee">
    <g class="cat-tail">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="14" height="2" :fill="color" />
    <rect x="3" y="9" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="19" height="2" :fill="color" />
    <rect x="2" y="11" width="21" height="4" :fill="color" />
    <rect x="3" y="15" width="19" height="2" :fill="color" />
    <rect x="5" y="10" width="3" height="1" fill="#000" />
    <rect x="12" y="10" width="3" height="1" fill="#000" />
    <rect x="3" y="12" width="2" height="1" fill="#FF76A5" />
    <rect x="15" y="12" width="2" height="1" fill="#FF76A5" />
    <g class="coffee-cup">
      <rect x="8" y="11" width="5" height="5" fill="#E2E8F0" />
      <rect x="8" y="11" width="5" height="1" fill="#94A3B8" />
      <rect x="9" y="12" width="3" height="1" fill="#78350F" />
      <rect x="13" y="12" width="2" height="3" fill="none" stroke="#94A3B8" stroke-width="1" />
      <rect x="7" y="13" width="2" height="2" fill="#fff" />
      <rect x="12" y="13" width="2" height="2" fill="#fff" />
    </g>
    <g class="coffee-steam">
      <rect x="9" y="8" width="1" height="2" fill="#CBD5E1" opacity="0.8" />
      <rect x="11" y="7" width="1" height="3" fill="#CBD5E1" opacity="0.8" />
    </g>
  </g>
</template>
