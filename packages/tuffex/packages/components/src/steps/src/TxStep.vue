<script setup lang="ts">
import type { StepsContext, StepStatus } from './types'
import { computed, getCurrentInstance, inject, onBeforeUnmount, useId } from 'vue'
import { TxIcon } from '../../icon'

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
  completedIcon: 'check',
})

const steps = inject<StepsContext>('steps')
const instance = getCurrentInstance()
const stepKey = `tx-step-${instance?.uid ?? props.step ?? props.title ?? 'item'}`
// The clickable head wraps only the number/icon; point its accessible name at the
// sibling title (and description) so screen readers hear "Start" rather than "1".
const titleId = useId()
const descId = useId()

steps?.registerStep(stepKey)

onBeforeUnmount(() => {
  steps?.unregisterStep(stepKey)
})

const direction = computed(() => steps?.direction.value || 'horizontal')
const size = computed(() => steps?.size.value || 'medium')
const orderIndex = computed(() => steps?.stepKeys.value.indexOf(stepKey) ?? 0)
const effectiveStep = computed(() => props.step ?? orderIndex.value)

const isActive = computed(() => {
  return steps?.activeStep.value === effectiveStep.value
})

const isCompleted = computed(() => {
  return props.status === 'completed' || (steps?.activeStep.value !== undefined
    && typeof effectiveStep.value === 'number'
    && typeof steps.activeStep.value === 'number'
    && effectiveStep.value < steps.activeStep.value)
})

const status = computed(() => {
  if (isActive.value)
    return 'active'
  if (isCompleted.value)
    return 'completed'
  return props.status
})

const stepNumber = computed(() => {
  if (typeof effectiveStep.value === 'number') {
    return effectiveStep.value + 1
  }
  return 1
})

const isLast = computed(() => {
  return orderIndex.value === (steps?.stepKeys.value.length ?? 1) - 1
})

function handleClick() {
  if (props.clickable && !props.disabled && steps) {
    steps.setActiveStep(effectiveStep.value)
  }
}
</script>

<template>
  <div
    class="tx-step" :class="[
      `tx-step--${direction}`,
      `tx-step--${size}`,
      {
        'tx-step--active': isActive,
        'tx-step--completed': isCompleted,
        'tx-step--clickable': clickable && !disabled,
        'tx-step--disabled': disabled,
      },
    ]"
    role="listitem"
  >
    <component
      :is="clickable ? 'button' : 'div'"
      class="tx-step__head"
      :type="clickable ? 'button' : undefined"
      :disabled="clickable ? disabled : undefined"
      :aria-current="isActive ? 'step' : undefined"
      :aria-labelledby="title ? titleId : undefined"
      :aria-describedby="description ? descId : undefined"
      @click="handleClick"
    >
      <div class="tx-step__icon" :class="`tx-step__icon--${status}`">
        <TxIcon v-if="status === 'completed'" :name="completedIcon" />
        <TxIcon v-else-if="icon" :name="icon" />
        <span v-else class="tx-step__number">{{ stepNumber }}</span>
      </div>
    </component>

    <!--
      The connector is a sibling of the head, not a child: it is positioned
      against the whole step so it can run from this marker's edge to the next
      marker's edge, and it must not sit inside the button's hit area.
    -->
    <div
      v-if="showLine && !isLast"
      class="tx-step__line"
      :class="{ 'tx-step__line--completed': isCompleted }"
      aria-hidden="true"
    />

    <div class="tx-step__content">
      <div :id="titleId" class="tx-step__title">
        {{ title }}
      </div>
      <div v-if="description" :id="descId" class="tx-step__description">
        {{ description }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * One geometry, three sizes. The marker diameter drives everything that has to
 * line up with it — the connector's offset from the marker, its vertical
 * position, the label size — so a size change is one variable, not a set of
 * hand-kept offsets. Both size and direction modifiers sit on this node.
 */
.tx-step {
  --tx-step-icon-size: 24px;
  --tx-step-line-gap: 6px;
  --tx-step-line-thickness: 2px;
  --tx-step-title-size: 14px;
  --tx-step-description-size: 12px;

  position: relative;
  display: flex;
}

.tx-step--small {
  --tx-step-icon-size: 20px;
  --tx-step-title-size: 12px;
  --tx-step-description-size: 11px;
}

.tx-step--large {
  --tx-step-icon-size: 28px;
  --tx-step-title-size: 16px;
  --tx-step-description-size: 13px;
}

.tx-step--horizontal {
  flex: 1;
  flex-direction: column;
  align-items: center;
}

.tx-step--vertical {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.tx-step--vertical:last-child {
  margin-bottom: 0;
}

.tx-step--clickable {
  cursor: pointer;
}

.tx-step--clickable:hover .tx-step__title {
  color: var(--tx-step-title-hover, var(--tx-color-primary));
}

.tx-step--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tx-step__head {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}

.tx-step__head:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
}

/*
 * The marker. Wait is hollow — a ring of the border colour around a secondary
 * number — so only the reached steps carry fill, and the row reads as "here is
 * how far you are" at a glance. Completed and active share the primary hue:
 * finished steps in green next to the current one in blue put two accents on
 * one control and made the row look like a status legend.
 */
.tx-step__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tx-step-icon-size);
  height: var(--tx-step-icon-size);
  border-radius: 50%;
  font-size: calc(var(--tx-step-icon-size) * 0.5);
  font-weight: 600;
  position: relative;
  z-index: 2;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.tx-step__icon--wait {
  background: var(--tx-step-icon-wait-bg, transparent);
  color: var(--tx-step-icon-wait-text, var(--tx-text-color-secondary));
  box-shadow: inset 0 0 0 1.5px var(--tx-step-icon-wait-border, var(--tx-border-color));
}

.tx-step__icon--active {
  background: var(--tx-step-icon-active-bg, var(--tx-color-primary));
  color: var(--tx-step-icon-active-text, var(--tx-color-on-primary));
  box-shadow: 0 0 0 4px var(--tx-step-icon-active-shadow, color-mix(in srgb, var(--tx-color-primary) 18%, transparent));
}

.tx-step__icon--completed {
  background: var(--tx-step-icon-completed-bg, var(--tx-color-primary));
  color: var(--tx-step-icon-completed-text, var(--tx-color-on-primary));
}

.tx-step__icon--error {
  background: var(--tx-step-icon-error-bg, var(--tx-color-danger));
  color: var(--tx-step-icon-error-text, var(--tx-color-on-primary));
}

.tx-step__number {
  line-height: 1;
}

/*
 * The connector runs from this marker's edge to the next marker's edge. The
 * steps are equal flex columns, so the next marker's centre is one step width
 * to the right of this one's: a line from `50% + r + gap` to `-50% + r + gap`
 * lands exactly between the two, whatever the column width. It used to be a
 * flex sibling of the marker inside the head, which pushed the marker off the
 * column's centre — every icon sat left of its own title.
 */
.tx-step__line {
  position: absolute;
  background: var(--tx-step-line, var(--tx-border-color-lighter));
  border-radius: calc(var(--tx-step-line-thickness) / 2);
  transition: background-color 0.2s ease;
}

.tx-step__line--completed {
  background: var(--tx-step-line-completed, var(--tx-color-primary));
}

.tx-step--horizontal .tx-step__line {
  top: calc(var(--tx-step-icon-size) / 2 - var(--tx-step-line-thickness) / 2);
  left: calc(50% + var(--tx-step-icon-size) / 2 + var(--tx-step-line-gap));
  right: calc(-50% + var(--tx-step-icon-size) / 2 + var(--tx-step-line-gap));
  height: var(--tx-step-line-thickness);
}

/* Vertically the line drops from under the marker into the 16px gap below, up to the next marker. */
.tx-step--vertical .tx-step__line {
  left: calc(var(--tx-step-icon-size) / 2 - var(--tx-step-line-thickness) / 2);
  top: calc(var(--tx-step-icon-size) + var(--tx-step-line-gap));
  bottom: calc(var(--tx-step-line-gap) - 16px);
  width: var(--tx-step-line-thickness);
}

.tx-step__content {
  text-align: center;
  margin-top: 8px;
  min-width: 0;
}

.tx-step--vertical .tx-step__content {
  text-align: left;
  margin-top: 0;
  flex: 1;
  /* Keep the title's first line on the marker's centre line. */
  padding-top: calc((var(--tx-step-icon-size) - var(--tx-step-title-size) * 1.4) / 2);
}

/* Labels: the reached steps in the primary ink, the ones ahead in the secondary. */
.tx-step__title {
  font-weight: 500;
  color: var(--tx-step-title, var(--tx-text-color-secondary));
  font-size: var(--tx-step-title-size);
  line-height: 1.4;
  transition: color 0.2s ease;
}

.tx-step--completed .tx-step__title {
  color: var(--tx-step-title-completed, var(--tx-text-color-primary));
}

.tx-step--active .tx-step__title {
  color: var(--tx-step-title-active, var(--tx-color-primary));
  font-weight: 600;
}

.tx-step__description {
  color: var(--tx-step-description, var(--tx-text-color-secondary));
  font-size: var(--tx-step-description-size);
  line-height: 1.4;
  margin-top: 4px;
}
</style>
