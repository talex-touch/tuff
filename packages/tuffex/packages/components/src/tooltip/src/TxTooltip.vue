<script setup lang="ts">
import type { BaseAnchorProps } from '../../base-anchor/src/types'
import type { TooltipProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'

defineOptions({ name: 'TxTooltip' })

const props = withDefaults(defineProps<TooltipProps>(), {
  modelValue: undefined,
  content: '',
  disabled: false,
  trigger: 'hover',
  openDelay: 200,
  closeDelay: 120,
  maxHeight: 320,
  referenceFullWidth: false,
  interactive: false,
  anchor: () => ({}),
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

const resolvedAnchorProps = computed<BaseAnchorProps>(() => {
  const anchor = props.anchor ?? {}

  const closeOnClickOutside = typeof anchor.closeOnClickOutside === 'boolean'
    ? anchor.closeOnClickOutside
    : props.trigger === 'click'

  const toggleOnReferenceClick = typeof anchor.toggleOnReferenceClick === 'boolean'
    ? anchor.toggleOnReferenceClick
    : props.trigger === 'click'

  return {
    placement: 'top',
    offset: 8,
    width: 0,
    minWidth: 0,
    maxWidth: 280,
    matchReferenceWidth: false,
    duration: 432,
    ease: 'back.out(2)',
    useCard: true,
    panelVariant: 'solid',
    panelBackground: 'refraction',
    panelShadow: 'soft',
    panelRadius: 10,
    panelPadding: 8,
    showArrow: true,
    arrowSize: 10,
    keepAliveContent: false,
    closeOnEsc: true,
    ...anchor,
    closeOnClickOutside,
    toggleOnReferenceClick,
  }
})

const tooltipVars = computed<Record<string, string>>(() => {
  return {
    '--tx-tooltip-max-height': `${props.maxHeight}px`,
  }
})

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
    v-bind="resolvedAnchorProps"
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
      </span>
    </template>

    <template #default="{ side }">
      <div
        class="tx-tooltip"
        :data-side="side"
        role="tooltip"
        :style="tooltipVars"
        @mouseenter="onFloatingEnter"
        @mouseleave="onFloatingLeave"
      >
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
  width: 100%;
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
  line-height: 1.35;
  max-height: var(--tx-tooltip-max-height, 320px);
  overflow: auto;
}

.tx-tooltip__content {
  position: relative;
  z-index: 1;
}
</style>
