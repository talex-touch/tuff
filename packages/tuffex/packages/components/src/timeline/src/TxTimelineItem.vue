<script setup lang="ts">
import type { TimelineContext, TimelineItemColor } from './types'
import { inject } from 'vue'
import { TxIcon } from '../../icon'

interface Props {
  title?: string
  time?: string
  icon?: string
  color?: TimelineItemColor
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  color: 'default',
  active: false,
})

const timeline = inject<TimelineContext>('timeline', { layout: 'vertical' })
const layout = timeline.layout
</script>

<template>
  <div
    class="tx-timeline-item" :class="[
      `tx-timeline-item--${layout}`,
      { 'tx-timeline-item--active': active },
    ]"
  >
    <div class="tx-timeline-item__dot" :class="`tx-timeline-item__dot--${color}`">
      <TxIcon v-if="icon" :name="icon" class="tx-timeline-item__icon" />
    </div>

    <div class="tx-timeline-item__content">
      <div v-if="title || time" class="tx-timeline-item__header">
        <div v-if="title" class="tx-timeline-item__title">
          {{ title }}
        </div>
        <div v-if="time" class="tx-timeline-item__time">
          {{ time }}
        </div>
      </div>

      <div v-if="$slots.default" class="tx-timeline-item__description">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tx-timeline-item {
  position: relative;
}

.tx-timeline-item--vertical {
  padding-bottom: 24px;
}

.tx-timeline-item--vertical:last-child {
  padding-bottom: 0;
}

.tx-timeline-item--vertical::before {
  content: '';
  position: absolute;
  left: -24px;
  top: 24px;
  bottom: -24px;
  width: 2px;
  background: var(--tx-timeline-line, #e5e7eb);
}

.tx-timeline-item--vertical:last-child::before {
  display: none;
}

.tx-timeline-item--horizontal {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 40px;
  min-width: 120px;
}

.tx-timeline-item__dot {
  position: absolute;
  left: -28px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px var(--tx-timeline-dot-border, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.tx-timeline-item__dot--default {
  background: var(--tx-timeline-dot-default, #6b7280);
}

.tx-timeline-item__dot--primary {
  background: var(--tx-timeline-dot-primary, #3b82f6);
}

.tx-timeline-item__dot--success {
  background: var(--tx-timeline-dot-success, #22c55e);
}

.tx-timeline-item__dot--warning {
  background: var(--tx-timeline-dot-warning, #f59e0b);
}

.tx-timeline-item__dot--error {
  background: var(--tx-timeline-dot-error, #ef4444);
}

.tx-timeline-item__dot--active {
  box-shadow: 0 0 0 2px var(--tx-timeline-dot-active, #3b82f6);
  transform: scale(1.2);
}

.tx-timeline-item--horizontal .tx-timeline-item__dot {
  position: static;
  margin-bottom: 8px;
}

.tx-timeline-item__icon {
  font-size: 6px;
  color: #ffffff;
}

.tx-timeline-item__content {
  flex: 1;
}

.tx-timeline-item--horizontal .tx-timeline-item__content {
  text-align: center;
}

.tx-timeline-item__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.tx-timeline-item--horizontal .tx-timeline-item__header {
  flex-direction: column;
  gap: 4px;
}

.tx-timeline-item__title {
  font-weight: 600;
  color: var(--tx-timeline-title, #111827);
  font-size: 14px;
}

.tx-timeline-item__time {
  font-size: 12px;
  color: var(--tx-timeline-time, #6b7280);
}

.tx-timeline-item__description {
  color: var(--tx-timeline-description, #6b7280);
  font-size: 14px;
  line-height: 1.5;
}
</style>
