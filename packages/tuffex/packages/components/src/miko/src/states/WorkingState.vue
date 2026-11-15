<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <g class="cat-tail">
      <rect x="24" y="7" width="2" height="5" :fill="color" />
      <rect x="25" y="5" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="14" height="2" :fill="color" />
    <rect x="3" y="9" width="18" height="2" :fill="color" />
    <rect x="2" y="10" width="21" height="2" :fill="color" />
    <rect x="2" y="11" width="22" height="2" :fill="color" />
    <rect x="2" y="12" width="23" height="3" :fill="color" />
    <rect x="3" y="15" width="21" height="2" :fill="color" />
    <rect x="5" y="11" width="2" height="2" fill="#000" />
    <rect x="13" y="11" width="2" height="2" fill="#000" />
    <!-- 小键盘与敲代码双爪 -->
    <g class="keyboard">
      <rect x="3" y="16" width="10" height="2" fill="#333" />
      <rect x="4" y="16" width="2" height="1" fill="#666" />
      <rect x="7" y="16" width="2" height="1" fill="#666" />
      <rect x="10" y="16" width="2" height="1" fill="#666" />
    </g>
    <g class="paw-l">
      <rect x="4" y="14" width="2" height="2" fill="#fff" />
      <rect x="4" y="15" width="2" height="1" :fill="color" />
    </g>
    <g class="paw-r">
      <rect x="9" y="14" width="2" height="2" fill="#fff" />
      <rect x="9" y="15" width="2" height="1" :fill="color" />
    </g>
  </g>
</template>
