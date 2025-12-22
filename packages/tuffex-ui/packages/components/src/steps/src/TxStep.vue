<template>
  <div
    :class="[
      'tx-step',
      `tx-step--${direction}`,
      `tx-step--${size}`,
      {
        'tx-step--active': isActive,
        'tx-step--completed': isCompleted,
        'tx-step--clickable': clickable && !disabled
      }
    ]"
    @click="handleClick"
  >
    <div class="tx-step__head">
      <div class="tx-step__icon" :class="`tx-step__icon--${status}`">
        <TxIcon v-if="status === 'completed'" :name="completedIcon" />
        <TxIcon v-else-if="icon" :name="icon" />
        <span v-else class="tx-step__number">{{ stepNumber }}</span>
      </div>
      
      <div class="tx-step__line" v-if="showLine && !isLast"></div>
    </div>
    
    <div class="tx-step__content">
      <div class="tx-step__title">{{ title }}</div>
      <div v-if="description" class="tx-step__description">{{ description }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { TxIcon } from '../../icon'
import type { StepsDirection, StepsSize, StepsContext, StepStatus } from './types'

interface Props {
  title?: string
  description?: string
  icon?: string
  status?: StepStatus
  step?: number | string
  clickable?: boolean
  disabled?: boolean
  showLine?: boolean
  completedIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  status: 'wait',
  clickable: true,
  showLine: true,
  completedIcon: 'check'
})

const steps = inject<StepsContext>('steps')

const direction = computed(() => steps?.direction || 'horizontal')
const size = computed(() => steps?.size || 'medium')

const isActive = computed(() => {
  return steps?.activeStep.value === props.step
})

const isCompleted = computed(() => {
  return props.status === 'completed' || (steps?.activeStep.value !== undefined && 
    typeof props.step === 'number' && 
    typeof steps.activeStep.value === 'number' && 
    props.step < steps.activeStep.value)
})

const status = computed(() => {
  if (isActive.value) return 'active'
  if (isCompleted.value) return 'completed'
  return props.status
})

const stepNumber = computed(() => {
  if (typeof props.step === 'number') {
    return props.step + 1
  }
  return 1
})

const isLast = computed(() => {
  return false
})

const handleClick = () => {
  if (props.clickable && !props.disabled && steps) {
    steps.setActiveStep(props.step)
  }
}
</script>

<style scoped>
.tx-step {
  display: flex;
  align-items: center;
  position: relative;
}

.tx-step--horizontal {
  flex: 1;
  flex-direction: column;
}

.tx-step--vertical {
  flex-direction: row;
  margin-bottom: 16px;
}

.tx-step--vertical:last-child {
  margin-bottom: 0;
}

.tx-step--clickable {
  cursor: pointer;
}

.tx-step--clickable:hover .tx-step__title {
  color: var(--tx-step-title-hover, #3b82f6);
}

.tx-step__head {
  display: flex;
  align-items: center;
  position: relative;
}

.tx-step--horizontal .tx-step__head {
  width: 100%;
  justify-content: center;
}

.tx-step--vertical .tx-step__head {
  margin-right: 16px;
}

.tx-step__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  position: relative;
  z-index: 2;
  transition: all 0.3s;
}

.tx-step--small .tx-step__icon {
  width: 20px;
  height: 20px;
  font-size: 10px;
}

.tx-step--large .tx-step__icon {
  width: 28px;
  height: 28px;
  font-size: 14px;
}

.tx-step__icon--wait {
  background: var(--tx-step-icon-wait-bg, #f3f4f6);
  color: var(--tx-step-icon-wait-text, #6b7280);
  border: 2px solid var(--tx-step-icon-wait-border, #d1d5db);
}

.tx-step__icon--active {
  background: var(--tx-step-icon-active-bg, #3b82f6);
  color: var(--tx-step-icon-active-text, #ffffff);
  border: 2px solid var(--tx-step-icon-active-border, #3b82f6);
  box-shadow: 0 0 0 4px var(--tx-step-icon-active-shadow, #dbeafe);
}

.tx-step__icon--completed {
  background: var(--tx-step-icon-completed-bg, #22c55e);
  color: var(--tx-step-icon-completed-text, #ffffff);
  border: 2px solid var(--tx-step-icon-completed-border, #22c55e);
}

.tx-step__number {
  line-height: 1;
}

.tx-step__line {
  flex: 1;
  height: 2px;
  background: var(--tx-step-line, #d1d5db);
  position: relative;
  top: -1px;
}

.tx-step--horizontal .tx-step__line {
  margin-left: 8px;
}

.tx-step--vertical .tx-step__line {
  width: 2px;
  height: 24px;
  position: absolute;
  left: 11px;
  top: 24px;
  margin-left: 0;
}

.tx-step--small .tx-step--vertical .tx-step__line {
  left: 9px;
  top: 20px;
  height: 20px;
}

.tx-step--large .tx-step--vertical .tx-step__line {
  left: 13px;
  top: 28px;
  height: 28px;
}

.tx-step__content {
  text-align: center;
  margin-top: 8px;
}

.tx-step--vertical .tx-step__content {
  text-align: left;
  margin-top: 0;
  flex: 1;
}

.tx-step__title {
  font-weight: 500;
  color: var(--tx-step-title, #374151);
  font-size: 14px;
  line-height: 1.4;
  transition: color 0.3s;
}

.tx-step--small .tx-step__title {
  font-size: 12px;
}

.tx-step--large .tx-step__title {
  font-size: 16px;
}

.tx-step--active .tx-step__title {
  color: var(--tx-step-title-active, #3b82f6);
  font-weight: 600;
}

.tx-step__description {
  color: var(--tx-step-description, #6b7280);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}

.tx-step--small .tx-step__description {
  font-size: 10px;
}

.tx-step--large .tx-step__description {
  font-size: 14px;
}
</style>
