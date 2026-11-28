<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton, TxDistortionWave, TxSlider } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      scrub: '手动进度擦洗',
      liveMode: '取消擦洗（自动播放）',
      trigger: '中心发射',
      beforeTitle: '等待校验签名',
      beforeBody: '中心扩散模式会把起点图标保持清晰，光环从中心向外铺开。',
      afterTitle: '密钥校验通过',
      afterBody: '目标视图随折射前沿无缝呈现，拖动上方滑块可定格任意瞬间。',
    }
  : {
      scrub: 'Scrub progress',
      liveMode: 'Release scrub',
      trigger: 'Trigger ring',
      beforeTitle: 'Awaiting signature check',
      beforeBody: 'Center mode holds the origin sharp while an iridescent ring radiates outward.',
      afterTitle: 'Signature verified',
      afterBody: 'Drag the scrubber above to freeze any instant of the lens and colour rim.',
    })

const scrubbing = ref(true)
const scrubValue = ref(0.34)
const revealed = ref(false)
const originRef = ref<HTMLButtonElement | null>(null)

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function onScrubUpdate(value: number): void {
  scrubbing.value = true
  scrubValue.value = value
}
</script>

<template>
  <div class="dw-scrub not-prose">
    <div class="dw-scrub__bar">
      <div class="dw-scrub__slider">
        <span class="dw-scrub__label">{{ copy.scrub }}</span>
        <TxSlider
          class="dw-scrub__control"
          :model-value="scrubValue"
          :min="0"
          :max="1"
          :step="0.01"
          :aria-label="copy.scrub"
          show-value
          :format-value="formatPercent"
          @update:model-value="onScrubUpdate"
        />
      </div>
      <TxButton v-if="scrubbing" size="sm" variant="secondary" @click="scrubbing = false">
        {{ copy.liveMode }}
      </TxButton>
      <TxButton v-else size="sm" variant="primary" @click="revealed = !revealed">
        {{ copy.trigger }}
      </TxButton>
    </div>

    <TxDistortionWave
      class="dw-scrub__card-host"
      type="center"
      palette="green"
      :revealed="revealed"
      :scrub="scrubbing ? scrubValue : null"
      :source="originRef"
      :corner-radius="18"
    >
      <div class="dw-scrub__panel">
        <div class="dw-scrub__badge-spacer" />
        <h4>{{ copy.beforeTitle }}</h4>
        <p>{{ copy.beforeBody }}</p>
      </div>
      <template #revealed>
        <div class="dw-scrub__panel dw-scrub__panel--verified">
          <div class="dw-scrub__badge-spacer" />
          <h4>{{ copy.afterTitle }}</h4>
          <p>{{ copy.afterBody }}</p>
        </div>
      </template>
      <template #overlay>
        <div class="dw-scrub__overlay">
          <button
            ref="originRef"
            type="button"
            class="dw-scrub__orb"
            :aria-label="copy.trigger"
            @click="scrubbing = false; revealed = !revealed"
          >
            <span :class="revealed ? 'i-carbon-checkmark' : 'i-carbon-security'" aria-hidden="true" />
          </button>
        </div>
      </template>
    </TxDistortionWave>
  </div>
</template>

<style scoped>
.dw-scrub {
  display: grid;
  gap: 14px;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.dw-scrub__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.dw-scrub__slider {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 260px;
  min-width: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.dw-scrub__label {
  flex: none;
  white-space: nowrap;
}

.dw-scrub__control {
  flex: 1 1 auto;
  min-width: 140px;
}

.dw-scrub__card-host {
  border-radius: 18px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.dw-scrub__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 28px 24px;
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
}

.dw-scrub__panel--verified {
  background: var(--tx-color-success-light-9, var(--tx-bg-color));
}

.dw-scrub__panel h4,
.dw-scrub__panel p {
  margin: 0;
}

.dw-scrub__panel h4 {
  font-size: 15px;
  font-weight: 600;
}

.dw-scrub__panel p {
  max-width: 42ch;
  color: var(--tx-text-color-regular);
  line-height: 1.5;
}

.dw-scrub__badge-spacer {
  width: 52px;
  height: 52px;
}

.dw-scrub__overlay {
  display: flex;
  justify-content: center;
  padding-top: 28px;
  pointer-events: none;
}

.dw-scrub__orb {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 50%;
  background: var(--tx-text-color-primary);
  color: var(--tx-bg-color);
  font-size: 20px;
  cursor: pointer;
  pointer-events: auto;
}
</style>
