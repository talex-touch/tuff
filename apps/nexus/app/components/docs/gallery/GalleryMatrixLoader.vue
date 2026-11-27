<script setup lang="ts">
import type { MatrixLoaderState } from '@tuffex-components/matrix-loader'
import { computed, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const { locale } = useI18n()
const labels = computed<Record<MatrixLoaderState, string>>(() =>
  locale.value === 'zh'
    ? {
        thinking: '思考中',
        searching: '检索中',
        exploring: '探索中',
        deciding: '决策中',
        generating: '生成中',
        extracting: '提取中',
        accelerating: '加速中',
        defining: '塑形中',
      }
    : {
        thinking: 'Thinking',
        searching: 'Searching',
        exploring: 'Exploring',
        deciding: 'Deciding',
        generating: 'Generating',
        extracting: 'Extracting',
        accelerating: 'Accelerating',
        defining: 'Defining',
      },
)

const states: readonly MatrixLoaderState[] = ['thinking', 'searching', 'extracting', 'defining']
const index = ref(0)

useGalleryLoop(() => {
  index.value = (index.value + 1) % states.length
}, 2000, 1800)

const current = computed<MatrixLoaderState>(() => states[index.value]!)
</script>

<template>
  <div class="docs-gallery__matrix-row">
    <TxMatrixLoader :state="current" size="md" :labels="labels" aria-hidden="true" />
    <span class="docs-gallery__matrix-label">{{ labels[current] }}</span>
  </div>
</template>

<style scoped>
.docs-gallery__matrix-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.docs-gallery__matrix-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--tx-text-color-primary);
}
</style>
