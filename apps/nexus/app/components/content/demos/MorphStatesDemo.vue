<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

type State = 'idle' | 'loading' | 'done' | 'card'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      states: { idle: '按钮', loading: '加载', done: '完成', card: '卡片' },
      picker: '形状状态',
      connect: '连接耳机',
      connecting: '正在连接',
      device: 'Studio Buds',
      detail: '已连接 · 电量 82%',
      disconnect: '断开',
    }
  : {
      states: { idle: 'Button', loading: 'Loading', done: 'Done', card: 'Card' },
      picker: 'Shape state',
      connect: 'Connect earbuds',
      connecting: 'Connecting',
      device: 'Studio Buds',
      detail: 'Connected · 82% battery',
      disconnect: 'Disconnect',
    })

const STATES: State[] = ['idle', 'loading', 'done', 'card']
const SHAPES: Record<State, { radius: number, fill: string, inset?: number }> = {
  idle: { radius: 12, fill: 'var(--tx-color-primary)' },
  loading: { radius: 19, fill: 'var(--tx-fill-color)' },
  done: { radius: 19, fill: 'var(--tx-color-success)' },
  card: { radius: 20, fill: 'var(--tx-fill-color-light)', inset: 12 },
}

const state = ref<State>('idle')
const shape = computed(() => SHAPES[state.value])

// The real flow: connecting resolves to a check, the check opens the card.
let timers: ReturnType<typeof setTimeout>[] = []
function clearFlow() {
  timers.forEach(clearTimeout)
  timers = []
}

function connect() {
  clearFlow()
  state.value = 'loading'
  timers.push(setTimeout(() => (state.value = 'done'), 1100))
  timers.push(setTimeout(() => (state.value = 'card'), 1900))
}

// Picking a state by hand, even mid-flight, only moves the target.
function pick(next: State) {
  clearFlow()
  state.value = next
}

onBeforeUnmount(clearFlow)
</script>

<template>
  <div class="morph-demo not-prose">
    <TxFlatRadio :model-value="state" size="sm" :aria-label="copy.picker" @update:model-value="pick">
      <TxFlatRadioItem v-for="name in STATES" :key="name" :value="name" :label="copy.states[name]" />
    </TxFlatRadio>

    <div class="morph-demo__stage">
      <TxMorph :morph-key="state" :radius="shape.radius" :fill="shape.fill" :inset="shape.inset">
        <button v-if="state === 'idle'" type="button" class="morph-demo__action" @click="connect">
          {{ copy.connect }}
        </button>
        <div v-else-if="state === 'loading'" class="morph-demo__glyph">
          <TxSpinner :size="18" :label="copy.connecting" />
        </div>
        <div v-else-if="state === 'done'" class="morph-demo__glyph is-done">
          <svg class="morph-demo__check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div v-else class="morph-demo__card">
          <div class="morph-demo__art" aria-hidden="true" />
          <div class="morph-demo__meta">
            <strong>{{ copy.device }}</strong>
            <span>{{ copy.detail }}</span>
          </div>
          <TxButton size="sm" variant="flat" @click="pick('idle')">
            {{ copy.disconnect }}
          </TxButton>
        </div>
      </TxMorph>
    </div>
  </div>
</template>

<style scoped>
.morph-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.morph-demo__stage {
  display: grid;
  place-items: center;
  min-height: 112px;
}

.morph-demo__action {
  height: 38px;
  padding: 0 18px;
  border: 0;
  background: none;
  color: var(--tx-color-white);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.morph-demo__action:focus-visible {
  outline: 2px solid var(--tx-color-white);
  outline-offset: -4px;
  border-radius: calc(var(--tx-morph-radius) - 2px);
}

.morph-demo__glyph {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--tx-text-color-primary);
}

.morph-demo__glyph.is-done {
  color: var(--tx-color-white);
}

.morph-demo__check {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.morph-demo__card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 300px;
}

/* Concentric with the shape: the shape's radius less the inset it sits in. */
.morph-demo__art {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: calc(var(--tx-morph-radius) - var(--tx-morph-inset));
  background: var(--tx-color-primary);
}

.morph-demo__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.morph-demo__meta strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}
</style>
