<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-magic">
    <g class="cat-tail">
      <rect x="23" y="10" width="3" height="2" :fill="color" />
      <rect x="24" y="8" width="3" height="3" :fill="color" />
    </g>
    <g class="wizard-hat">
      <polygon points="4,7 16,7 10,1" fill="#4C1D95" />
      <rect x="3" y="6" width="14" height="2" fill="#6D28D9" />
      <polygon points="10,1 12,0 12,2" fill="#FDE047" />
    </g>
    <rect x="3" y="8" width="18" height="8" :fill="color" />
    <rect x="6" y="10" width="2" height="2" fill="#000" />
    <rect x="13" y="10" width="2" height="2" fill="#000" />
    <rect x="6" y="10" width="1" height="1" fill="#fff" />
    <rect x="13" y="10" width="1" height="1" fill="#fff" />
    <g class="magic-wand">
      <line x1="15" y1="13" x2="26" y2="4" stroke="#78350F" stroke-width="1.5" />
      <circle cx="27" cy="3" r="2.5" fill="#38BDF8" />
    </g>
    <g class="magic-sparkles">
      <rect x="24" y="0" width="2" height="2" fill="#FDE047" />
      <rect x="30" y="3" width="2" height="2" fill="#EC4899" />
      <rect x="27" y="7" width="1" height="1" fill="#A855F7" />
      <rect x="22" y="2" width="1" height="1" fill="#38BDF8" />
    </g>
  </g>
</template>
