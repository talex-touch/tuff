<script setup lang="ts">
import { computed } from 'vue'
import type { StatCardProps } from './types.ts'

defineOptions({
  name: 'TxStatCard',
})

const props = withDefaults(defineProps<StatCardProps>(), {
  iconClass: '',
  clickable: false,
})

const displayValue = computed(() => {
  return typeof props.value === 'number' ? props.value.toLocaleString() : String(props.value)
})
</script>

<template>
  <div
    class="tx-stat-card fake-background"
    :class="{ 'tx-stat-card--clickable': clickable }"
    role="group"
    aria-label="Stat card"
  >
    <div class="tx-stat-card__decoration" aria-hidden="true">
      <i v-if="iconClass" class="tx-stat-card__decoration-icon" :class="iconClass" />
    </div>

    <div class="tx-stat-card__content">
      <div class="tx-stat-card__value">
        <slot name="value">{{ displayValue }}</slot>
      </div>
      <div class="tx-stat-card__label">
        <slot name="label">{{ label }}</slot>
      </div>
    </div>

    <i v-if="iconClass" class="tx-stat-card__icon" :class="iconClass" aria-hidden="true" />
  </div>
</template>

<style lang="scss" scoped>
.tx-stat-card {
  position: relative;
  width: 100%;
  height: 112px;
  padding: 16px;
  border-radius: 16px;
  box-sizing: border-box;
  overflow: hidden;

  --fake-color: var(--tx-bg-color, #fff);
  --fake-opacity: 0.7;

  background: transparent;
  border: 1px solid var(--tx-border-color-lighter, #eee);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);

  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;

  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.tx-stat-card--clickable {
  cursor: pointer;
}

.tx-stat-card--clickable:hover {
  cursor: pointer;
  --fake-opacity: 0.75;
  border-color: var(--tx-border-color, #dcdfe6);
}

.tx-stat-card--clickable:hover .tx-stat-card__decoration {
  transform: scale(1.25);
  filter: blur(30px) brightness(150%) saturate(200%);
}

.tx-stat-card--clickable:hover .tx-stat-card__icon {
  transform: scale(1.25) rotate(10deg) translate(-10%, -10%);
}

.tx-stat-card__content {
  position: relative;
  z-index: 1;
}

.tx-stat-card__value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--tx-text-color-primary, #303133);
}

.tx-stat-card__label {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.2;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-stat-card__icon {
  position: relative;
  z-index: 1;
  font-size: 28px;
  color: var(--tx-text-color-secondary, #909399);
  transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
}

.tx-stat-card__decoration {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  transform: scale(1.5);
  filter: blur(20px) brightness(120%) saturate(180%);
  transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1), filter 0.35s cubic-bezier(0.33, 1, 0.68, 1);
}

.tx-stat-card__decoration-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%) scale(1.6);
  font-size: 64px;
  opacity: 0.12;
  filter: blur(0px) saturate(140%);
  color: var(--tx-text-color-secondary, #909399);
}
</style>
