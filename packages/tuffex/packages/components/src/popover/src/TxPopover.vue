<script setup lang="ts">
import type { TooltipAnchorProps } from '../../tooltip/src/types'
import type { PopoverProps } from './types'
import { computed, ref, watch } from 'vue'
import TxTooltip from '../../tooltip/src/TxTooltip.vue'

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
  toggleOnReferenceClick: undefined,
  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  closeOnClickOutside: true,
  closeOnEsc: true,
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

const resolvedOffset = computed(() => {
  if (typeof props.offset === 'number')
    return props.offset
  if (props.showArrow)
    return Math.max(8, Math.round((props.arrowSize ?? 12) * 0.5) + 2)
  return 2
})

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

const resolvedAnchorProps = computed<Partial<TooltipAnchorProps>>(() => {
  return {
    placement: props.placement,
    offset: resolvedOffset.value,
    width: props.width,
    minWidth: props.minWidth,
    maxWidth: props.maxWidth,
    maxHeight: props.maxHeight,
    unlimitedHeight: props.unlimitedHeight,
    matchReferenceWidth: props.width <= 0,
    duration: anchorDuration.value,
    ease: anchorEase.value,
    panelVariant: props.panelVariant,
    panelBackground: props.panelBackground,
    panelShadow: props.panelShadow,
    panelRadius: props.panelRadius,
    panelPadding: props.panelPadding,
    panelCard: props.panelCard,
    showArrow: props.showArrow,
    arrowSize: props.arrowSize,
    closeOnClickOutside: anchorCloseOnClickOutside.value,
    closeOnEsc: props.closeOnEsc,
    toggleOnReferenceClick: anchorToggleOnReferenceClick.value,
  }
})

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled)
      return
    open.value = false
  },
)
</script>

<template>
  <TxTooltip
    v-model="open"
    :disabled="props.disabled"
    :trigger="props.trigger"
    :open-delay="props.openDelay"
    :close-delay="props.closeDelay"
    :interactive="props.trigger === 'hover'"
    :reference-full-width="props.referenceFullWidth"
    :keep-alive-content="props.keepAliveContent"
    :anchor="resolvedAnchorProps"
  >
    <template #default>
      <div
        class="tx-popover__reference"
        :class="{ 'is-full-width': props.referenceFullWidth }"
      >
        <slot name="reference" />
      </div>
    </template>

    <template #content="{ side }">
      <div
        class="tx-popover__content"
        :data-side="side"
      >
        <slot :side="side" />
      </div>
    </template>
  </TxTooltip>
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
