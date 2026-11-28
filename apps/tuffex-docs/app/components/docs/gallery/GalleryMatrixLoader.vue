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

const states: readonly MatrixLoaderState[] = ['thinking', 'searching', 'generating', 'defining']
const index = ref(0)
const manualLockUntil = ref(0)

useGalleryLoop(() => {
  if (Date.now() < manualLockUntil.value)
    return
  index.value = (index.value + 1) % states.length
}, 2600, 2200)

const current = computed<MatrixLoaderState>(() => states[index.value]!)

function selectState(nextIndex: number): void {
  index.value = nextIndex
  manualLockUntil.value = Date.now() + 6000
}
</script>

<template>
  <div class="docs-gallery__matrix-stage">
    <div class="docs-gallery__matrix-hero">
      <TxMatrixLoader :state="current" size="lg" :display-size="40" :labels="labels" aria-hidden="true" />
      <div class="docs-gallery__matrix-meta">
        <span class="docs-gallery__matrix-label">{{ labels[current] }}</span>
        <span class="docs-gallery__matrix-key">{{ current }}</span>
      </div>
    </div>

    <div class="docs-gallery__matrix-grid">
      <button
        v-for="(state, idx) in states"
        :key="state"
        type="button"
        class="docs-gallery__matrix-tile"
        :class="{ 'is-active': idx === index }"
        :aria-pressed="idx === index"
        @click="selectState(idx)"
      >
        <TxMatrixLoader :state="state" size="sm" :display-size="18" :labels="labels" aria-hidden="true" />
        <span class="docs-gallery__matrix-tile-label">{{ labels[state] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.docs-gallery__matrix-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(308px, 100%);
}

.docs-gallery__matrix-hero {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-radius: 14px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--docs-gallery-line);
}

.docs-gallery__matrix-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-gallery__matrix-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.docs-gallery__matrix-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--docs-muted);
}

.docs-gallery__matrix-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
}

.docs-gallery__matrix-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 4px;
  border: 1px solid var(--docs-gallery-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--docs-inline-code-bg) 64%, transparent);
  color: var(--docs-muted);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;
}

.docs-gallery__matrix-tile:hover,
.docs-gallery__matrix-tile.is-active {
  border-color: color-mix(in srgb, var(--docs-accent) 46%, var(--docs-gallery-line));
  background: var(--tx-bg-color, transparent);
  color: var(--tx-text-color-primary);
}

.docs-gallery__matrix-tile-label {
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}
</style>
