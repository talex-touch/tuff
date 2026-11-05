<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-running">
    <g class="running-dust">
      <rect x="27" y="14" width="3" height="2" fill="#9CA3AF" />
      <rect x="30" y="13" width="2" height="1" fill="#D1D5DB" />
      <rect x="25" y="16" width="2" height="1" fill="#9CA3AF" />
    </g>
    <g class="running-tail">
      <rect x="23" y="9" width="6" height="2" :fill="color" />
      <rect x="28" y="8" width="2" height="2" :fill="color" />
    </g>
    <rect x="4" y="6" width="3" height="2" :fill="color" />
    <rect x="11" y="6" width="3" height="2" :fill="color" />
    <rect x="3" y="8" width="13" height="2" :fill="color" />
    <rect x="3" y="9" width="16" height="2" :fill="color" />
    <rect x="2" y="10" width="19" height="2" :fill="color" />
    <rect x="2" y="11" width="21" height="3" :fill="color" />
    <rect x="3" y="14" width="19" height="2" :fill="color" />
    <rect x="5" y="10" width="3" height="1" fill="#000" />
    <rect x="12" y="10" width="3" height="1" fill="#000" />
    <rect x="8" y="13" width="2" height="1" fill="#000" />
    <g class="running-paw-fl">
      <rect x="4" y="15" width="3" height="2" fill="#fff" />
    </g>
    <g class="running-paw-fr">
      <rect x="8" y="15" width="3" height="2" fill="#fff" />
    </g>
    <g class="running-paw-bl">
      <rect x="17" y="15" width="3" height="2" fill="#fff" />
    </g>
    <g class="running-paw-br">
      <rect x="21" y="15" width="3" height="2" fill="#fff" />
    </g>
  </g>
</template>
