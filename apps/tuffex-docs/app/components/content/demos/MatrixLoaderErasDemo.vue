<script setup lang="ts">
import type { MatrixLoaderEra, MatrixLoaderShape, MatrixLoaderState } from '@talex-touch/tuffex/matrix-loader'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const ERAS: readonly { id: MatrixLoaderEra, zh: string, en: string }[] = [
  { id: 'oled', zh: 'OLED', en: 'OLED' },
  { id: 'crt', zh: 'CRT 荧光', en: 'CRT Phosphor' },
  { id: 'vfd', zh: 'VFD 矩阵', en: 'VFD Matrix' },
  { id: 'dither', zh: 'Bayer 抖动', en: 'Bayer Dither' },
  { id: 'lcd', zh: '复古 LCD', en: 'Retro LCD' },
]

const SHAPES: readonly { id: MatrixLoaderShape, zh: string, en: string }[] = [
  { id: 'quad', zh: '方块', en: 'Quad' },
  { id: 'circle', zh: '圆点', en: 'Dot' },
  { id: 'diamond', zh: '菱形', en: 'Diamond' },
]

const state = ref<MatrixLoaderState>('searching')
const shape = ref<MatrixLoaderShape>('quad')
</script>

<template>
  <div class="not-prose matrix-eras-demo">
    <div class="matrix-eras-demo__bar">
      <div class="matrix-eras-demo__group">
        <TxButton
          v-for="item in SHAPES"
          :key="item.id"
          size="sm"
          :variant="shape === item.id ? 'primary' : 'secondary'"
          @click="shape = item.id"
        >
          {{ zh ? item.zh : item.en }}
        </TxButton>
      </div>
      <div class="matrix-eras-demo__group">
        <TxButton
          size="sm"
          :variant="state === 'thinking' ? 'primary' : 'secondary'"
          @click="state = 'thinking'"
        >
          Thinking
        </TxButton>
        <TxButton
          size="sm"
          :variant="state === 'searching' ? 'primary' : 'secondary'"
          @click="state = 'searching'"
        >
          Searching
        </TxButton>
        <TxButton
          size="sm"
          :variant="state === 'accelerating' ? 'primary' : 'secondary'"
          @click="state = 'accelerating'"
        >
          Accelerating
        </TxButton>
      </div>
    </div>

    <div class="matrix-eras-demo__row">
      <div v-for="era in ERAS" :key="era.id" class="matrix-eras-demo__card">
        <TxMatrixLoader
          :state="state"
          :era="era.id"
          :shape="shape"
          size="lg"
        />
        <span class="matrix-eras-demo__caption">{{ zh ? era.zh : era.en }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.matrix-eras-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.matrix-eras-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.matrix-eras-demo__group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.matrix-eras-demo__row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.matrix-eras-demo__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.matrix-eras-demo__caption {
  font-size: 12px;
  color: var(--tx-text-color-regular);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .matrix-eras-demo__row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
