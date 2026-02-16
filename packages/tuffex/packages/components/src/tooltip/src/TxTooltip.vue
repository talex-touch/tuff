<script setup lang="ts">
import type { TooltipProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'

defineOptions({ name: 'TxTooltip' })

const props = withDefaults(defineProps<TooltipProps>(), {
  modelValue: undefined,
  content: '',
  disabled: false,
  trigger: 'hover',
  placement: 'top',
  offset: 8,
  width: 0,
  minWidth: 0,
  openDelay: 200,
  closeDelay: 120,
  maxWidth: 280,
  maxHeight: 320,
  matchReferenceWidth: false,
  referenceFullWidth: false,
  showArrow: false,
  arrowSize: 10,
  interactive: false,
  closeOnClickOutside: true,
  closeOnEsc: true,
  motion: 'split',
  fusion: false,
  panelVariant: 'plain',
  panelBackground: 'blur',
  panelShadow: 'soft',
  panelRadius: 10,
  panelPadding: 8,
  indicator: false,
  indicatorPlacement: 'panel',
  indicatorVariant: 'dot',
  indicatorSize: 8,
  indicatorColor: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const internalOpen = ref(false)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v: boolean) => {
    if (props.disabled && v)
      return

    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === v)
      return

    internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

let openTimer: number | null = null
let closeTimer: number | null = null

function clearTimers() {
  if (openTimer != null)
    window.clearTimeout(openTimer)
  if (closeTimer != null)
    window.clearTimeout(closeTimer)
  openTimer = null
  closeTimer = null
}

function scheduleOpen() {
  if (props.disabled)
    return
  clearTimers()
  openTimer = window.setTimeout(() => {
    open.value = true
  }, Math.max(0, props.openDelay))
}

function scheduleClose() {
  clearTimers()
  closeTimer = window.setTimeout(() => {
    open.value = false
  }, Math.max(0, props.closeDelay))
}

function onEnter() {
  if (props.trigger !== 'hover')
    return
  scheduleOpen()
}

function onLeave() {
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

function onFocusIn() {
  if (props.trigger !== 'focus')
    return
  scheduleOpen()
}

function onFocusOut() {
  if (props.trigger !== 'focus')
    return
  scheduleClose()
}

function onFloatingEnter() {
  if (!props.interactive)
    return
  if (props.trigger !== 'hover')
    return
  clearTimers()
}

function onFloatingLeave() {
  if (!props.interactive)
    return
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

const anchorCloseOnClickOutside = computed(() => {
  if (props.trigger !== 'click')
    return false
  return props.closeOnClickOutside
})

const anchorDuration = computed(() => (props.motion === 'fade' ? 220 : 432))
const anchorEase = computed(() => (props.motion === 'fade' ? 'power2.out' : 'back.out(2)'))

const tooltipClass = computed(() => {
  return [
    'tx-tooltip',
    props.classPrefix ? `${props.classPrefix}-tooltip` : '',
    `is-variant-${props.panelVariant}`,
    `is-bg-${props.panelBackground}`,
    `is-shadow-${props.panelShadow}`,
    `is-motion-${props.motion}`,
    {
      'is-fusion': !!props.fusion,
      'is-indicator': !!props.indicator,
    },
  ]
})

const tooltipVars = computed<Record<string, string>>(() => {
  return {
    '--tx-tooltip-padding': `${props.panelPadding}px`,
    '--tx-tooltip-arrow-size': `${props.arrowSize}px`,
    '--tx-tooltip-max-height': `${props.maxHeight}px`,
    '--tx-tooltip-indicator-size': `${props.indicatorSize}px`,
    '--tx-tooltip-indicator-color': props.indicatorColor || 'var(--tx-color-primary, #409eff)',
  }
})

const showReferenceIndicator = computed(() => props.indicator && props.indicatorPlacement === 'reference')
const showPanelIndicator = computed(() => props.indicator && props.indicatorPlacement === 'panel')

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled)
      return
    clearTimers()
    open.value = false
  },
)

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <TxBaseAnchor
    v-model="open"
    :disabled="props.disabled"
    :placement="props.placement"
    :offset="props.offset"
    :width="props.width"
    :min-width="props.minWidth"
    :max-width="props.maxWidth"
    :match-reference-width="props.matchReferenceWidth"
    :duration="anchorDuration"
    :ease="anchorEase"
    :use-card="false"
    :close-on-click-outside="anchorCloseOnClickOutside"
    :close-on-esc="props.closeOnEsc"
    :toggle-on-reference-click="props.trigger === 'click'"
  >
    <template #reference>
      <span
        class="tx-tooltip__reference"
        :class="{ 'is-full-width': props.referenceFullWidth }"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
      >
        <slot />
        <span
          v-if="showReferenceIndicator"
          class="tx-tooltip__indicator tx-tooltip__indicator--reference"
          :class="`is-${props.indicatorVariant}`"
          aria-hidden="true"
        />
      </span>
    </template>

    <template #default="{ side }">
      <div
        :class="tooltipClass"
        :data-side="side"
        role="tooltip"
        :style="tooltipVars"
        @mouseenter="onFloatingEnter"
        @mouseleave="onFloatingLeave"
      >
        <span
          v-if="props.showArrow"
          class="tx-tooltip__arrow"
          :data-side="side"
          aria-hidden="true"
        />

        <span
          v-if="showPanelIndicator"
          class="tx-tooltip__indicator tx-tooltip__indicator--panel"
          :class="`is-${props.indicatorVariant}`"
          aria-hidden="true"
        />

        <div class="tx-tooltip__content">
          <slot name="content">
            {{ props.content }}
          </slot>
        </div>
      </div>
    </template>
  </TxBaseAnchor>
</template>

<style scoped>
.tx-tooltip__reference {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tx-tooltip__reference.is-full-width {
  width: 100%;
}

.tx-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: var(--tx-tooltip-padding, 8px);
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
  line-height: 1.35;
  max-height: var(--tx-tooltip-max-height, 320px);
  overflow: auto;
}

.tx-tooltip.is-variant-solid {
  border-bottom: 1px dashed color-mix(in srgb, var(--tx-text-color-primary, #303133) 35%, transparent);
}

.tx-tooltip.is-variant-dashed {
  border-bottom: 1px dashed color-mix(in srgb, var(--tx-text-color-primary, #303133) 50%, transparent);
}

.tx-tooltip.is-fusion {
  filter: saturate(1.18) contrast(1.05);
}

.tx-tooltip.is-motion-fade {
  animation: tx-tooltip-fade-in 0.18s ease;
}

.tx-tooltip__content {
  position: relative;
  z-index: 1;
}

.tx-tooltip__arrow {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 0;
}

.tx-tooltip__arrow[data-side='top'] {
  border-left: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-right: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-top: calc(var(--tx-tooltip-arrow-size, 10px) * 0.6) solid color-mix(in srgb, var(--tx-text-color-primary, #303133) 55%, transparent);
  left: 50%;
  bottom: calc(var(--tx-tooltip-arrow-size, 10px) * -0.55);
  transform: translateX(-50%);
}

.tx-tooltip__arrow[data-side='bottom'] {
  border-left: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-right: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-bottom: calc(var(--tx-tooltip-arrow-size, 10px) * 0.6) solid color-mix(in srgb, var(--tx-text-color-primary, #303133) 55%, transparent);
  left: 50%;
  top: calc(var(--tx-tooltip-arrow-size, 10px) * -0.55);
  transform: translateX(-50%);
}

.tx-tooltip__arrow[data-side='left'] {
  border-top: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-bottom: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-left: calc(var(--tx-tooltip-arrow-size, 10px) * 0.6) solid color-mix(in srgb, var(--tx-text-color-primary, #303133) 55%, transparent);
  right: calc(var(--tx-tooltip-arrow-size, 10px) * -0.55);
  top: 50%;
  transform: translateY(-50%);
}

.tx-tooltip__arrow[data-side='right'] {
  border-top: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-bottom: calc(var(--tx-tooltip-arrow-size, 10px) * 0.5) solid transparent;
  border-right: calc(var(--tx-tooltip-arrow-size, 10px) * 0.6) solid color-mix(in srgb, var(--tx-text-color-primary, #303133) 55%, transparent);
  left: calc(var(--tx-tooltip-arrow-size, 10px) * -0.55);
  top: 50%;
  transform: translateY(-50%);
}

.tx-tooltip__indicator {
  position: absolute;
  width: var(--tx-tooltip-indicator-size, 8px);
  height: var(--tx-tooltip-indicator-size, 8px);
  border-radius: 999px;
  background: var(--tx-tooltip-indicator-color, var(--tx-color-primary, #409eff));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 88%, transparent),
    0 0 12px color-mix(in srgb, var(--tx-tooltip-indicator-color, var(--tx-color-primary, #409eff)) 55%, transparent);
}

.tx-tooltip__indicator--panel {
  right: 6px;
  top: 6px;
  z-index: 2;
}

.tx-tooltip__indicator--reference {
  right: -2px;
  top: -2px;
}

.tx-tooltip__indicator.is-pulse::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 1px solid color-mix(in srgb, var(--tx-tooltip-indicator-color, var(--tx-color-primary, #409eff)) 70%, transparent);
  animation: tx-tooltip-indicator-pulse 1.2s ease-out infinite;
}

@keyframes tx-tooltip-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes tx-tooltip-indicator-pulse {
  from {
    opacity: 0.75;
    transform: scale(0.65);
  }
  to {
    opacity: 0;
    transform: scale(1.5);
  }
}
</style>
