<script setup lang="ts">
import type { MatrixLoaderState } from '@talex-touch/tuffex/matrix-loader'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

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

const STATE_LABELS = computed<Record<MatrixLoaderState, string>>(() =>
  zh.value
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

const activeState = ref<MatrixLoaderState>('thinking')
const autoCycle = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

function startCycle(): void {
  stopCycle()
  if (!autoCycle.value)
    return
  timer = setInterval(() => {
    const idx = STATES.indexOf(activeState.value)
    activeState.value = STATES[(idx + 1) % STATES.length]!
  }, 2200)
}

function stopCycle(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(autoCycle, startCycle, { immediate: true })
onBeforeUnmount(stopCycle)

function selectState(state: MatrixLoaderState): void {
  autoCycle.value = false
  activeState.value = state
}
</script>

<template>
  <div class="not-prose matrix-states-demo">
    <div class="matrix-states-demo__stage">
      <TxMatrixLoader
        :state="activeState"
        size="lg"
        :labels="STATE_LABELS"
        show-label
      />
      <div class="matrix-states-demo__controls">
        <TxButton
          size="sm"
          :variant="autoCycle ? 'primary' : 'secondary'"
          @click="autoCycle = !autoCycle"
        >
          {{ autoCycle ? (zh ? '自动轮播中' : 'Auto-cycling') : (zh ? '开启轮播' : 'Auto-cycle') }}
        </TxButton>
        <span class="matrix-states-demo__hint">
          {{ zh ? '点击下方任意状态可切换并观察过渡' : 'Click any state below to morph smoothly' }}
        </span>
      </div>
    </div>

    <div class="matrix-states-demo__grid">
      <button
        v-for="state in STATES"
        :key="state"
        type="button"
        class="matrix-states-demo__cell"
        :class="{ 'is-active': activeState === state }"
        :aria-pressed="activeState === state"
        @click="selectState(state)"
      >
        <TxMatrixLoader :state="state" size="md" :labels="STATE_LABELS" />
        <span class="matrix-states-demo__name">{{ STATE_LABELS[state] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.matrix-states-demo {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.matrix-states-demo__stage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.matrix-states-demo__controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.matrix-states-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.matrix-states-demo__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.matrix-states-demo__cell {
  appearance: none;
  border: 0;
  background: var(--tx-fill-color-blank);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  border-radius: 10px;
  padding: 14px 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--tx-text-color-regular);
}

.matrix-states-demo__cell:hover {
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
}

.matrix-states-demo__cell.is-active {
  background: var(--tx-color-primary-light-9);
  box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  color: var(--tx-text-color-primary);
}

.matrix-states-demo__name {
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 560px) {
  .matrix-states-demo__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
