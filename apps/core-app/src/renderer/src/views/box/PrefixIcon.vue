<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import AppIcon from '~/assets/logo.svg'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'

const { onProgressUpdate, indexProgress } = useFileIndexMonitor()

const isIndexing = computed(() => {
  const stage = indexProgress.value?.stage
  return stage && stage !== 'idle' && stage !== 'completed'
})

const progressPercent = computed(() => {
  if (!indexProgress.value || !isIndexing.value) return 0
  return Math.max(0, Math.min(100, indexProgress.value.progress ?? 0))
})

// SVG circle parameters: radius=24, circumference=2*PI*24 ≈ 150.8
const circumference = 2 * Math.PI * 24
const strokeDashoffset = computed(() => {
  return circumference - (progressPercent.value / 100) * circumference
})

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = onProgressUpdate(() => {})
})
onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <div class="PrefixIcon transition-cubic">
    <img class="transition-cubic" :src="AppIcon" />
    <svg
      v-if="isIndexing"
      class="ProgressRing op-50"
      viewBox="0 0 52 52"
      :class="{ 'op-0': !isIndexing }"
    >
      <!-- Background track -->
      <circle class="ProgressRing-Track" cx="26" cy="26" r="24" fill="none" stroke-width="2.5" />
      <!-- Progress arc -->
      <circle
        class="ProgressRing-Arc"
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke-width="2.5"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
      />
    </svg>
  </div>
</template>

<style lang="scss" scoped>
.PrefixIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ProgressRing {
  position: absolute;
  inset: 0;
  width: 52px;
  height: 52px;
  transform: rotate(-90deg);
  pointer-events: none;
}

.ProgressRing-Track {
  stroke: var(--el-border-color-lighter);
  opacity: 0.4;
}

.ProgressRing-Arc {
  stroke: var(--el-color-primary);
  transition: stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
