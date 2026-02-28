<script lang="ts" setup>
import { computed } from 'vue'

interface Props {
  width: string | number
  x: string | number
  delay: number
  duration: number
}

const props = defineProps<Props>()

const hue = computed(() => Math.floor(Math.random() * 360))
const ar = computed(() => Math.floor(Math.random() * 10) + 1)
</script>

<template>
  <div
    :style="{
      '--x': `${props.x}`,
      '--width': `${props.width}`,
      '--aspect-ratio': `${ar}`,
      '--background': `linear-gradient(hsl(${hue} 80% 60%), transparent)`,
      '--duration': `${props.duration}s`,
      '--delay': `${props.delay}s`,
    }"
    class="aurora-bar absolute top-0 left-[var(--x)] [aspect-ratio:1/var(--aspect-ratio)] [width:var(--width)] [background:var(--background)]"
  />
</template>

<style scoped>
.aurora-bar {
  transform: translate(-50%, 100cqmax);
  animation: aurora-flow var(--duration, 6s) linear infinite;
  animation-delay: var(--delay, 0s);
}

@keyframes aurora-flow {
  from {
    transform: translate(-50%, 100cqmax);
  }
  to {
    transform: translate(-50%, -100%);
  }
}
</style>
