<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { useLiquidDrag } from '@talex-touch/tuffex/glass-surface'
import { computed, ref } from 'vue'
import GlassSurfaceLensStage from './GlassSurfaceLensStage.vue'

const { locale } = useI18n()

const stage = ref<ComponentPublicInstance | null>(null)
const lens = ref<ComponentPublicInstance | null>(null)

const stiffness = ref(150)
const damping = ref(19)
const stretch = ref(18)

const { reset } = useLiquidDrag(lens, {
  bounds: stage,
  stiffness,
  damping,
  stretch: () => stretch.value / 100000,
  restHeight: 0.8,
  pressGrow: 0.25,
})

const hint = computed(() => (locale.value === 'zh'
  ? '拖动透镜：边缘像液体一样流动，松手后弹回原形。'
  : 'Drag the lens: its rim flows like liquid and springs back when you let go.'))
</script>

<template>
  <div class="glass-drag-demo">
    <GlassSurfaceLensStage ref="stage" :hint="hint">
      <TxGlassSurface
        ref="lens"
        engine="lens"
        :width="210"
        :height="150"
        :border-radius="75"
        :bezel="25"
        :thickness="50"
        :zoom="1.13"
        :rim-saturation="9"
      />
    </GlassSurfaceLensStage>

    <div class="glass-drag-demo__controls">
      <div class="glass-drag-demo__row">
        <span>stiffness</span>
        <TxSlider v-model="stiffness" :min="40" :max="400" :step="1" show-value />
      </div>
      <div class="glass-drag-demo__row">
        <span>damping</span>
        <TxSlider v-model="damping" :min="4" :max="40" :step="0.5" show-value />
      </div>
      <div class="glass-drag-demo__row">
        <span>stretch (% per 1000 px/s)</span>
        <TxSlider v-model="stretch" :min="0" :max="60" :step="1" show-value />
      </div>
      <div class="glass-drag-demo__row">
        <TxButton size="sm" variant="secondary" @click="reset">
          {{ locale === 'zh' ? '回到中心' : 'Recentre' }}
        </TxButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-drag-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.glass-drag-demo__controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: end;
  gap: 12px 16px;
}

.glass-drag-demo__row {
  display: grid;
  gap: 6px;
}

.glass-drag-demo__row > span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
