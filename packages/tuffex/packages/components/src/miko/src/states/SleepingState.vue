<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-body">
    <rect x="4" y="9" width="20" height="7" :fill="color" />
    <rect x="6" y="8" width="15" height="1" :fill="color" />
    <rect x="5" y="16" width="18" height="1" :fill="color" />
    <rect x="6" y="8" width="2" height="1" :fill="color" />
    <rect x="12" y="8" width="2" height="1" :fill="color" />
    <rect x="7" y="12" width="3" height="1" fill="#000" />
    <rect x="13" y="12" width="3" height="1" fill="#000" />
    <rect x="19" y="13" width="5" height="2" :fill="color" />
    <g class="cat-zzz">
      <text x="23" y="8" font-size="6" font-family="monospace" font-weight="bold" fill="#A78BFA">
        {{ 'Z' }}
      </text>
      <text x="27" y="5" font-size="4" font-family="monospace" font-weight="bold" fill="#A78BFA">
        {{ 'z' }}
      </text>
    </g>
  </g>
</template>
