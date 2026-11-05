<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-peek">
    <!-- 边栏/桌面边缘 (避免悬空) -->
    <rect x="2" y="16" width="32" height="3" fill="#3F3F46" />
    <rect x="2" y="16" width="32" height="1" fill="#71717A" />
    <!-- 猫猫探头 -->
    <rect x="11" y="7" width="2" height="3" :fill="color" />
    <rect x="21" y="7" width="2" height="3" :fill="color" />
    <rect x="9" y="10" width="16" height="6" :fill="color" />
    <g class="peek-eyes">
      <rect x="12" y="11" width="2" height="2" fill="#000" />
      <rect x="20" y="11" width="2" height="2" fill="#000" />
      <rect x="12" y="11" width="1" height="1" fill="#fff" />
      <rect x="20" y="11" width="1" height="1" fill="#fff" />
    </g>
    <rect x="15" y="13" width="4" height="1" fill="#000" />
    <!-- 两只搭在边缘上的小白爪 -->
    <rect x="11" y="15" width="3" height="2" fill="#fff" />
    <rect x="20" y="15" width="3" height="2" fill="#fff" />
  </g>
</template>
