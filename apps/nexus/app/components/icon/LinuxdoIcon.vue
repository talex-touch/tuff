<script setup lang="ts">
import { TxIcon } from '@talex-touch/tuffex'

const props = withDefaults(defineProps<{
  size?: number
  colorful?: boolean
}>(), {
  size: 18,
  colorful: true,
})

const LINUXDO_SVG = `<svg
    class="icon-tabler"
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    <clipPath id="a"><circle cx="10" cy="12" r="7"/></clipPath>
    <circle cx="10" cy="12" r="9"/>
    <rect clip-path="url(#a)" x="1.7" y="3.7" width="16.6" height="5"/>
    <rect clip-path="url(#a)" x="1.7" y="8.7" width="16.6" height="6.7"/>
    <rect clip-path="url(#a)" x="1.7" y="15.3" width="16.6" height="5"/>
  </svg>`

const linuxdoIcon = {
  type: 'url',
  value: `data:image/svg+xml;utf8,${encodeURIComponent(LINUXDO_SVG)}`,
} as const
</script>

<template>
  <TxIcon :icon="linuxdoIcon" :size="props.size" :colorful="props.colorful" />
</template>
