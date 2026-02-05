<script setup lang="ts">
import { TxIcon } from '@talex-touch/tuffex'

const props = withDefaults(defineProps<{
  size?: number
  colorful?: boolean
}>(), {
  size: 18,
  colorful: true,
})

const LINUXDO_SVG = `<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <clipPath id="a"><circle cx="60" cy="60" r="47"/></clipPath>
    <circle fill="#f0f0f0" cx="60" cy="60" r="50"/>
    <rect fill="#1c1c1e" clip-path="url(#a)" x="10" y="10" width="100" height="30"/>
    <rect fill="#f0f0f0" clip-path="url(#a)" x="10" y="40" width="100" height="40"/>
    <rect fill="#ffb003" clip-path="url(#a)" x="10" y="80" width="100" height="30"/>
</svg>`

const linuxdoIcon = {
  type: 'url',
  value: `data:image/svg+xml;utf8,${encodeURIComponent(LINUXDO_SVG)}`,
} as const
</script>

<template>
  <TxIcon :icon="linuxdoIcon" :size="props.size" :colorful="props.colorful" />
</template>
