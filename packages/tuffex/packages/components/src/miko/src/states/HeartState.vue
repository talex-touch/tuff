<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-heart">
    <g class="cat-tail">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
    </g>
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="18" height="8" :fill="color" />
    <path d="M5,10 Q6.5,8.5 8,10" fill="none" stroke="#000" stroke-width="1.2" />
    <path d="M12,10 Q13.5,8.5 15,10" fill="none" stroke="#000" stroke-width="1.2" />
    <rect x="4" y="11" width="3" height="2" fill="#FB7185" />
    <rect x="13" y="11" width="3" height="2" fill="#FB7185" />
    <rect x="8" y="13" width="2" height="2" fill="#fff" />
    <rect x="11" y="13" width="2" height="2" fill="#fff" />
    <g class="floating-heart-stream">
      <path d="M18,6 A2,2 0 0,1 21,6 A2,2 0 0,1 24,6 Q24,9 21,11 Q18,9 18,6 Z" fill="#F43F5E" class="heart-big" />
      <path d="M25,2 A1.5,1.5 0 0,1 27,2 A1.5,1.5 0 0,1 29,2 Q29,4 27,5 Q25,4 25,2 Z" fill="#FB7185" class="heart-small" />
    </g>
  </g>
</template>
