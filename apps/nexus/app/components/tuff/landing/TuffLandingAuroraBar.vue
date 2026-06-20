<script lang="ts" setup>
interface Props {
  width: string | number
  x: string | number
  delay: number
  duration: number
  hue: number
  aspectRatio: number
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :style="{
      '--x': `${props.x}`,
      '--width': `${props.width}`,
      '--aspect-ratio': `${props.aspectRatio}`,
      '--background': `linear-gradient(hsl(${props.hue} 80% 60%), transparent)`,
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
