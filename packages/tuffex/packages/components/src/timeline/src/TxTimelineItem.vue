<script setup lang="ts">
import type { TimelineContext, TimelineItemColor } from './types'
import { computed, inject } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({ name: 'TxTimelineItem' })

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
const layout = computed(() => timeline.layout)
</script>

<template>
  <div
    class="tx-timeline-item" :class="[
      `tx-timeline-item--${layout}`,
      { 'tx-timeline-item--active': active },
    ]"
    role="listitem"
  >
    <div
      class="tx-timeline-item__dot"
      :class="[
        `tx-timeline-item__dot--${color}`,
        { 'tx-timeline-item__dot--active': active },
      ]"
      aria-hidden="true"
    >
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
  background: var(--tx-timeline-line, var(--tx-border-color-lighter));
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
  box-shadow: 0 0 0 2px var(--tx-timeline-dot-border, var(--tx-bg-color));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.tx-timeline-item__dot--default {
  background: var(--tx-timeline-dot-default, var(--tx-color-info));
}

.tx-timeline-item__dot--primary {
  background: var(--tx-timeline-dot-primary, var(--tx-color-primary));
}

.tx-timeline-item__dot--success {
  background: var(--tx-timeline-dot-success, var(--tx-color-success));
}

.tx-timeline-item__dot--warning {
  background: var(--tx-timeline-dot-warning, var(--tx-color-warning));
}

.tx-timeline-item__dot--error {
  background: var(--tx-timeline-dot-error, var(--tx-color-danger));
}

.tx-timeline-item__dot--active {
  box-shadow: 0 0 0 2px var(--tx-timeline-dot-active, var(--tx-color-primary));
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
  color: var(--tx-timeline-title, var(--tx-text-color-primary));
  font-size: 14px;
}

.tx-timeline-item__time {
  font-size: 12px;
  color: var(--tx-timeline-time, var(--tx-text-color-secondary));
}

.tx-timeline-item__description {
  color: var(--tx-timeline-description, var(--tx-text-color-secondary));
  font-size: 14px;
  line-height: 1.5;
}
</style>
