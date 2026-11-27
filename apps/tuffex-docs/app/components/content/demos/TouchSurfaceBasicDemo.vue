<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const lean = ref(10)
const hoverLift = ref(0.3)
const pressGrow = ref(6)
const stretch = ref(10)

const touch = computed(() => ({
  lean: lean.value / 100,
  hoverLift: hoverLift.value,
  pressGrow: pressGrow.value / 100,
  stretch: stretch.value / 100000,
}))

const hint = computed(() => (locale.value === 'zh'
  ? '划过、按住它们，或在手机上用手指触摸。'
  : 'Sweep across them, press them, or touch them on a phone.'))
</script>

<template>
  <div class="touch-surface-demo">
    <div class="touch-surface-demo__stage">
      <span class="touch-surface-demo__ring" aria-hidden="true" />
      <div class="touch-surface-demo__cards">
        <TxTouchSurface class="touch-surface-demo__card" :radius="32" v-bind="touch">
          <span class="touch-surface-demo__label">Base</span>
        </TxTouchSurface>
        <TxTouchSurface class="touch-surface-demo__card" mode="glass" :radius="32" v-bind="touch">
          <span class="touch-surface-demo__label">Base · glass</span>
        </TxTouchSurface>
        <TxTouchSurface
          surface="glass"
          class="touch-surface-demo__card"
          :width="176"
          :height="64"
          :border-radius="32"
          v-bind="touch"
        >
          <span class="touch-surface-demo__label">Glass</span>
        </TxTouchSurface>
      </div>
      <p class="touch-surface-demo__hint">
        {{ hint }}
      </p>
    </div>

    <div class="touch-surface-demo__controls">
      <div class="touch-surface-demo__row">
        <span>lean (% of half its size)</span>
        <TxSlider v-model="lean" :min="0" :max="30" :step="1" show-value />
      </div>
      <div class="touch-surface-demo__row">
        <span>hoverLift</span>
        <TxSlider v-model="hoverLift" :min="0" :max="1" :step="0.05" show-value />
      </div>
      <div class="touch-surface-demo__row">
        <span>pressGrow (%)</span>
        <TxSlider v-model="pressGrow" :min="0" :max="20" :step="0.5" show-value />
      </div>
      <div class="touch-surface-demo__row">
        <span>stretch (% per 1000 px/s)</span>
        <TxSlider v-model="stretch" :min="0" :max="60" :step="1" show-value />
      </div>
    </div>
  </div>
</template>

<style scoped>
.touch-surface-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.touch-surface-demo__stage {
  position: relative;
  display: grid;
  min-height: 190px;
  place-items: center;
  overflow: hidden;
  border-radius: 16px;
  background:
    radial-gradient(120% 90% at 100% 0%, #6f8fe8 0%, #2f4fc0 38%, transparent 60%),
    radial-gradient(90% 80% at 0% 100%, #5fd3b2 0%, #2f9c86 40%, transparent 62%),
    #0a1a5c;
}

.touch-surface-demo__ring {
  position: absolute;
  top: -70px;
  right: 8%;
  width: 190px;
  height: 190px;
  border: 20px solid rgb(160 190 255 / 0.55);
  border-radius: 50%;
  pointer-events: none;
}

.touch-surface-demo__hint {
  position: absolute;
  top: 12px;
  left: 16px;
  margin: 0;
  color: rgb(255 255 255 / 0.74);
  font-size: 12px;
  pointer-events: none;
}

.touch-surface-demo__cards {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px 24px;
  padding: 44px 16px 24px;
}

.touch-surface-demo__card {
  z-index: 1;
  width: 176px;
  height: 64px;
}

.touch-surface-demo__card :deep(.tx-base-surface__content) {
  display: grid;
  height: 100%;
  place-items: center;
}

.touch-surface-demo__label {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.touch-surface-demo__controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: end;
  gap: 12px 16px;
}

.touch-surface-demo__row {
  display: grid;
  gap: 6px;
}

.touch-surface-demo__row > span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
