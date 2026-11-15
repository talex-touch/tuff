<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-box">
    <rect x="3" y="9" width="24" height="9" fill="#B48450" />
    <rect x="3" y="9" width="24" height="2" fill="#C99B67" />
    <rect x="3" y="17" width="24" height="1" fill="#8D5C2C" />
    <rect x="1" y="8" width="4" height="2" fill="#C99B67" />
    <rect x="25" y="8" width="4" height="2" fill="#C99B67" />
    <rect x="14" y="13" width="2" height="2" fill="#8D5C2C" />
    <rect x="12" y="12" width="1" height="1" fill="#8D5C2C" />
    <rect x="14" y="11" width="1" height="1" fill="#8D5C2C" />
    <rect x="16" y="11" width="1" height="1" fill="#8D5C2C" />
    <rect x="17" y="12" width="1" height="1" fill="#8D5C2C" />
    <g class="box-peeker">
      <rect x="8" y="4" width="2" height="3" :fill="color" />
      <rect x="18" y="4" width="2" height="3" :fill="color" />
      <rect x="7" y="7" width="14" height="3" :fill="color" />
      <rect x="9" y="7" width="2" height="2" fill="#000" />
      <rect x="17" y="7" width="2" height="2" fill="#000" />
      <rect x="9" y="7" width="1" height="1" fill="#fff" />
      <rect x="17" y="7" width="1" height="1" fill="#fff" />
    </g>
  </g>
</template>
