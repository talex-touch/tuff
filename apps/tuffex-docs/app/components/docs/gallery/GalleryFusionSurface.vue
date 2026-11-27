<script setup lang="ts">
import type { FusionSurfaceBud } from '@talex-touch/tuffex/fusion-surface'
import { computed, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

// The split is the effect, so the cell plays it on its own: grow a bud,
// stretch a neck, snap it off into a drop that floats up, let the drop go,
// start over. Under reduced motion nothing loops and the cell rests on the
// attached bud, which still shows the fillet joining it to the bar.
// 22 is a clearly pinched neck, short of the break (about 27px at the
// default breakAt of 28); the default pinch eases in, so less reads as a bud
// with a waist rather than a neck.
const DETACH = [0, 22, 58]

const run = ref(0)
const step = ref(0)

// A fresh id per round: a split bud stays a drop until it has fully closed,
// so the next round grows a new one rather than reusing it.
const buds = computed<FusionSurfaceBud[]>(() => step.value < DETACH.length
  ? [{ id: `drop-${run.value}`, width: 56, height: 26, radius: 10, detach: DETACH[step.value] }]
  : [])

useGalleryLoop(() => {
  if (step.value < DETACH.length) {
    step.value += 1
    return
  }
  run.value += 1
  step.value = 0
}, 1000, 900)
</script>

<template>
  <div class="gallery-fusion-surface">
    <TxFusionSurface
      class="gallery-fusion-surface__bar"
      :buds="buds"
      :radius="14"
      stroke="var(--tx-border-color-lighter)"
    >
      <span class="gallery-fusion-surface__line" />
      <span class="gallery-fusion-surface__icon i-carbon-send" aria-hidden="true" />
    </TxFusionSurface>
  </div>
</template>

<style scoped>
/* The drop floats up to 84px above the bar and takes no layout space. */
.gallery-fusion-surface {
  padding-top: 88px;
}

.gallery-fusion-surface__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  width: 176px;
  height: 40px;
  padding: 0 12px 0 16px;
}

.gallery-fusion-surface__line {
  width: 72px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-fill-color, #f0f2f5);
}

.gallery-fusion-surface__icon {
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
