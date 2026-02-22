<script setup lang="ts">
import type { BaseAnchorClassValue } from '../../base-anchor/src/types'
import type { PopoverProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'

defineOptions({ name: 'TxPopover' })

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: undefined,
  disabled: false,
  placement: 'bottom-start',
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  unlimitedHeight: false,
  referenceFullWidth: false,
  showArrow: true,
  arrowSize: 12,
  trigger: 'click',
  openDelay: 120,
  closeDelay: 100,
  duration: 180,
  keepAliveContent: true,
  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  closeOnClickOutside: true,
  closeOnEsc: true,
})

const resolvedOffset = computed(() => {
  if (typeof props.offset === 'number')
    return props.offset
  if (props.showArrow)
    return Math.max(8, Math.round((props.arrowSize ?? 12) * 0.5) + 2)
  return 2
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

function onReferenceEnter() {
  if (props.trigger !== 'hover')
    return
  scheduleOpen()
}

function onReferenceLeave() {
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

function onFloatingEnter() {
  if (props.trigger !== 'hover')
    return
  clearTimers()
}

function onFloatingLeave() {
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

const anchorCloseOnClickOutside = computed(() => {
  if (props.trigger !== 'click')
    return false
  return props.closeOnClickOutside
})

const anchorDuration = computed(() => Math.max(0, props.duration))
const anchorEase = computed(() => 'power2.out')

const anchorToggleOnReferenceClick = computed(() => {
  if (typeof props.toggleOnReferenceClick === 'boolean')
    return props.toggleOnReferenceClick
  return props.trigger === 'click'
})

const anchorReferenceClass = computed<BaseAnchorClassValue | undefined>(() => {
  const classes: BaseAnchorClassValue[] = []
  if (props.referenceClass) {
    classes.push(props.referenceClass)
  }
  if (props.referenceFullWidth) {
    classes.push({ 'is-full-width': true })
  }
  return classes.length ? classes : undefined
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
    :placement="props.placement"
    :offset="resolvedOffset"
    :width="props.width"
    :min-width="props.minWidth"
    :max-width="props.maxWidth"
    :max-height="props.maxHeight"
    :unlimited-height="props.unlimitedHeight"
    :match-reference-width="props.width <= 0"
    :duration="anchorDuration"
    :ease="anchorEase"
    :panel-variant="props.panelVariant"
    :panel-background="props.panelBackground"
    :panel-shadow="props.panelShadow"
    :panel-radius="props.panelRadius"
    :panel-padding="props.panelPadding"
    :panel-card="props.panelCard"
    :show-arrow="props.showArrow"
    :arrow-size="props.arrowSize"
    :keep-alive-content="props.keepAliveContent"
    :close-on-click-outside="anchorCloseOnClickOutside"
    :close-on-esc="props.closeOnEsc"
    :toggle-on-reference-click="anchorToggleOnReferenceClick"
    :reference-class="anchorReferenceClass"
  >
    <template #reference>
      <div
        class="tx-popover__reference"
        :class="{ 'is-full-width': props.referenceFullWidth }"
        @mouseenter="onReferenceEnter"
        @mouseleave="onReferenceLeave"
        @focusin="onReferenceEnter"
        @focusout="onReferenceLeave"
      >
        <slot name="reference" />
      </div>
    </template>

    <template #default="{ side }">
      <div
        class="tx-popover__content"
        :data-side="side"
        @mouseenter="onFloatingEnter"
        @mouseleave="onFloatingLeave"
      >
        <slot :side="side" />
      </div>
    </template>
  </TxBaseAnchor>
</template>

<style scoped>
.tx-popover__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.tx-popover__reference.is-full-width {
  width: 100%;
}

.tx-popover__content {
  position: relative;
  width: 100%;
}
</style>
