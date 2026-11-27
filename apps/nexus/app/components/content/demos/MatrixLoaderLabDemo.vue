<script setup lang="ts">
import type { MatrixLoaderEra, MatrixLoaderShape, MatrixLoaderState } from '@talex-touch/tuffex/matrix-loader'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const STATES: readonly MatrixLoaderState[] = [
  'thinking',
  'searching',
  'exploring',
  'deciding',
  'generating',
  'extracting',
  'accelerating',
  'defining',
]
const ERAS: readonly MatrixLoaderEra[] = ['oled', 'crt', 'vfd', 'dither', 'lcd']
const SHAPES: readonly MatrixLoaderShape[] = ['quad', 'circle', 'diamond']

const state = ref<MatrixLoaderState>('exploring')
const era = ref<MatrixLoaderEra>('oled')
const shape = ref<MatrixLoaderShape>('quad')
const gridSize = ref(5)
const bulge = ref(1)
const taper = ref(1)
const fill = ref(1)
const speed = ref(1)
const intensity = ref(1)
const noise = ref(0.2)
const paused = ref(false)

function resetParams(): void {
  state.value = 'exploring'
  era.value = 'oled'
  shape.value = 'quad'
  gridSize.value = 5
  bulge.value = 1
  taper.value = 1
  fill.value = 1
  speed.value = 1
  intensity.value = 1
  noise.value = 0
  paused.value = false
}

function mutatePreset(): void {
  state.value = STATES[Math.floor(Math.random() * STATES.length)]!
  era.value = ERAS[Math.floor(Math.random() * ERAS.length)]!
  shape.value = SHAPES[Math.floor(Math.random() * SHAPES.length)]!
  gridSize.value = [3, 5, 7][Math.floor(Math.random() * 3)]!
  bulge.value = Number((0.4 + Math.random() * 1.1).toFixed(2))
  taper.value = Number((Math.random() * 1.2).toFixed(2))
  fill.value = Number((0.75 + Math.random() * 0.35).toFixed(2))
  noise.value = Number((Math.random() * 0.6).toFixed(2))
}
</script>

<template>
  <div class="not-prose matrix-lab-demo">
    <div class="matrix-lab-demo__preview">
      <TxMatrixLoader
        :state="state"
        :era="era"
        :shape="shape"
        :display-size="96"
        :grid-size="gridSize"
        :bulge="bulge"
        :taper="taper"
        :fill="fill"
        :speed="speed"
        :intensity="intensity"
        :noise="noise"
        :paused="paused"
        show-label
      />
      <div class="matrix-lab-demo__actions">
        <TxButton size="sm" variant="secondary" @click="paused = !paused">
          {{ paused ? (zh ? '继续' : 'Resume') : (zh ? '暂停' : 'Pause') }}
        </TxButton>
        <TxButton size="sm" variant="secondary" @click="mutatePreset">
          {{ zh ? '随机组合' : 'Mutate' }}
        </TxButton>
        <TxButton size="sm" variant="ghost" @click="resetParams">
          {{ zh ? '重置' : 'Reset' }}
        </TxButton>
      </div>
    </div>

    <div class="matrix-lab-demo__panel">
      <div class="matrix-lab-demo__chips">
        <TxButton
          v-for="s in STATES"
          :key="s"
          size="sm"
          :variant="state === s ? 'primary' : 'secondary'"
          @click="state = s"
        >
          {{ s }}
        </TxButton>
      </div>

      <div class="matrix-lab-demo__chips">
        <TxButton
          v-for="e in ERAS"
          :key="e"
          size="sm"
          :variant="era === e ? 'primary' : 'secondary'"
          @click="era = e"
        >
          {{ e }}
        </TxButton>
      </div>

      <div class="matrix-lab-demo__sliders">
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '网格阶数 (N×N)' : 'Grid (N×N)' }}</span>
          <TxSlider v-model="gridSize" :min="3" :max="9" :step="2" show-value :aria-label="zh ? '网格阶数' : 'Grid size'" />
        </div>
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '球面曲率 (bulge)' : 'Spherical bulge' }}</span>
          <TxSlider v-model="bulge" :min="0" :max="1.8" :step="0.05" show-value :aria-label="zh ? '球面曲率' : 'Bulge'" />
        </div>
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '半调渐变 (taper)' : 'Halftone taper' }}</span>
          <TxSlider v-model="taper" :min="0" :max="1.4" :step="0.05" show-value :aria-label="zh ? '半调渐变' : 'Taper'" />
        </div>
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '填充比例 (fill)' : 'Tile fill' }}</span>
          <TxSlider v-model="fill" :min="0.5" :max="1.2" :step="0.05" show-value :aria-label="zh ? '填充比例' : 'Fill'" />
        </div>
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '播放倍速 (speed)' : 'Speed' }}</span>
          <TxSlider v-model="speed" :min="0.2" :max="2.5" :step="0.1" show-value :aria-label="zh ? '播放倍速' : 'Speed'" />
        </div>
        <div class="matrix-lab-demo__field">
          <span>{{ zh ? '2D 噪声漂移 (noise)' : '2D noise drift' }}</span>
          <TxSlider v-model="noise" :min="0" :max="1" :step="0.05" show-value :aria-label="zh ? '噪声漂移' : 'Noise'" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.matrix-lab-demo {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.matrix-lab-demo__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 20px 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.matrix-lab-demo__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.matrix-lab-demo__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.matrix-lab-demo__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.matrix-lab-demo__sliders {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}

.matrix-lab-demo__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

@media (max-width: 680px) {
  .matrix-lab-demo {
    grid-template-columns: minmax(0, 1fr);
  }

  .matrix-lab-demo__sliders {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
