<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-sleepy">
    <rect x="22" y="13" width="4" height="2" :fill="color" />
    <rect x="25" y="12" width="2" height="2" :fill="color" />
    <rect x="4" y="8" width="2" height="2" :fill="color" />
    <rect x="12" y="8" width="2" height="2" :fill="color" />
    <rect x="3" y="9" width="19" height="7" :fill="color" />
    <rect x="4" y="16" width="17" height="1" :fill="color" />
    <rect x="5" y="10" width="3" height="1" fill="#000" />
    <rect x="12" y="10" width="3" height="1" fill="#000" />
    <g class="sleepy-tear">
      <rect x="4" y="11" width="1" height="2" fill="#38BDF8" />
    </g>
    <g class="yawn-mouth">
      <rect x="8" y="11" width="4" height="4" fill="#000" />
      <rect x="9" y="13" width="2" height="2" fill="#F43F5E" />
    </g>
    <g class="yawn-bubble">
      <circle cx="16" cy="7" r="1.5" fill="#A855F7" opacity="0.6" />
      <circle cx="19" cy="4" r="2.5" fill="#A855F7" opacity="0.75" />
    </g>
  </g>
</template>
