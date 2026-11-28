<script setup lang="ts">
import { hasDocument } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import { galleryText } from './gallery-text'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  localeKey: 'en' | 'zh'
}>()

/*
 * Calm 3-row specimen: one live determinate transfer plus two quiet semantic
 * states (complete and high-water warning). Keeping the timer inside the
 * specimen means the cell's reset button replays the climb from its resting
 * frame, and readers with reduced motion see a settled mid-run composition.
 */
const PROGRESS_STEPS = [24, 56, 78, 94, 100, 100] as const
const TOTAL_MB = 2.4

const stepIndex = ref(1)
const cycle = ref(0)

const activePercent = computed(() => PROGRESS_STEPS[stepIndex.value] ?? 56)
const activeTransfer = computed(() => {
  const transferred = ((activePercent.value / 100) * TOTAL_MB).toFixed(1)
  return `${transferred} / ${TOTAL_MB.toFixed(1)} MB · ${activePercent.value}%`
})

const labels = computed(() => galleryText[props.localeKey].progress)

useGalleryLoop(() => {
  if (hasDocument() && document.hidden)
    return
  const next = stepIndex.value + 1
  if (next >= PROGRESS_STEPS.length) {
    stepIndex.value = 0
    cycle.value += 1
  }
  else {
    stepIndex.value = next
  }
}, 1400, 1400)
</script>

<template>
  <div class="docs-gallery__progress-list">
    <div class="docs-gallery__progress-row">
      <div class="docs-gallery__progress-head">
        <span class="docs-gallery__progress-label">{{ labels.downloading }}</span>
        <span class="docs-gallery__progress-meta">{{ activeTransfer }}</span>
      </div>
      <TxProgressBar
        :key="cycle"
        :percentage="activePercent"
        height="6px"
        :aria-label="labels.downloadAria"
      />
    </div>

    <div class="docs-gallery__progress-row">
      <div class="docs-gallery__progress-head">
        <span class="docs-gallery__progress-label">{{ labels.installed }}</span>
        <span class="docs-gallery__progress-meta">{{ labels.doneMeta }}</span>
      </div>
      <TxProgressBar
        :percentage="100"
        status="success"
        height="6px"
        :aria-label="labels.installedAria"
      />
    </div>

    <div class="docs-gallery__progress-row">
      <div class="docs-gallery__progress-head">
        <span class="docs-gallery__progress-label">{{ labels.cache }}</span>
        <span class="docs-gallery__progress-meta">76%</span>
      </div>
      <TxProgressBar
        :percentage="76"
        status="warning"
        height="6px"
        :aria-label="labels.cacheAria"
      />
    </div>
  </div>
</template>
