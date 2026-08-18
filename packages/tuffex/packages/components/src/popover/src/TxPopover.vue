<script setup lang="ts">
import type { BaseAnchorClassValue, BaseAnchorProps } from '../../base-anchor/src/types'
import type { PopoverProps } from './types'
import { computed, getCurrentInstance, ref } from 'vue'
import TxTooltip from '../../tooltip/src/TxTooltip.vue'

defineOptions({ name: 'TxPopover' })

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: undefined,
  disabled: false,
  eager: false,
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
  virtualReference: undefined,
  matchReferenceWidth: undefined,
  // Left undefined so the shared `menu` preset supplies them; the preset is
  // seeded from the 120/100 this component used to hardcode.
  openDelay: undefined,
  closeDelay: undefined,
  animation: () => ({}),
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
// Stable id so the reference can advertise the popover panel it controls.
const uid = getCurrentInstance()?.uid ?? 0
const panelId = `tx-popover-${uid}`

const resolvedOffset = computed(() => {
  if (typeof props.offset === 'number')
    return props.offset
  if (props.showArrow)
    return Math.max(8, Math.round((props.arrowSize ?? 12) * 0.5) + 2)
  return 2
})

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

const anchorCloseOnClickOutside = computed(() => {
  // hover panels dismiss by leaving; click and manual ones by clicking away.
  if (props.trigger === 'hover')
    return false
  return props.closeOnClickOutside
})

// The animation object passes straight through; every type resolves its own
// timing table in the anchor.
const anchorAnimation = computed(() => props.animation ?? {})

const anchorToggleOnReferenceClick = computed(() => {
  if (typeof props.toggleOnReferenceClick === 'boolean')
    return props.toggleOnReferenceClick
  return props.trigger === 'click'
})

const anchorMatchReferenceWidth = computed(() => {
  if (typeof props.matchReferenceWidth === 'boolean')
    return props.matchReferenceWidth
  return props.width <= 0
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

/**
 * Everything the anchor needs, funnelled through the tooltip's `anchor`
 * passthrough. Scheduling, triggers, and mutual exclusion (`menu` layer) live
 * in the tooltip — the popover only decides menu-flavoured defaults and aria.
 */
const tooltipAnchorProps = computed<Partial<BaseAnchorProps>>(() => ({
  eager: props.eager,
  placement: props.placement,
  offset: resolvedOffset.value,
  width: props.width,
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
  maxHeight: props.maxHeight,
  unlimitedHeight: props.unlimitedHeight,
  matchReferenceWidth: anchorMatchReferenceWidth.value,
  virtualReference: props.virtualReference,
  animation: anchorAnimation.value,
  panelVariant: props.panelVariant,
  panelBackground: props.panelBackground,
  panelShadow: props.panelShadow,
  panelRadius: props.panelRadius,
  panelPadding: props.panelPadding,
  panelCard: props.panelCard,
  showArrow: props.showArrow,
  arrowSize: props.arrowSize,
  closeOnEsc: props.closeOnEsc,
  referenceClass: anchorReferenceClass.value,
}))

const tooltipRef = ref<InstanceType<typeof TxTooltip> | null>(null)

defineExpose({
  updatePosition: () => tooltipRef.value?.updatePosition?.(),
})
</script>

<template>
  <TxTooltip
    ref="tooltipRef"
    v-model="open"
    layer="menu"
    role="none"
    unstyled
    interactive
    :trigger="props.trigger"
    :disabled="props.disabled"
    :reference-full-width="props.referenceFullWidth"
    :open-delay="props.openDelay"
    :close-delay="props.closeDelay"
    :keep-alive-content="props.keepAliveContent"
    :close-on-click-outside="anchorCloseOnClickOutside"
    :toggle-on-reference-click="anchorToggleOnReferenceClick"
    :anchor="tooltipAnchorProps"
  >
    <div
      class="tx-popover__reference"
      :class="{ 'is-full-width': props.referenceFullWidth }"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="panelId"
    >
      <slot name="reference" />
    </div>

    <template #content="{ side }">
      <div
        :id="panelId"
        class="tx-popover__content"
        role="dialog"
        :data-side="side"
      >
        <slot :side="side" />
      </div>
    </template>
  </TxTooltip>
</template>

<style scoped>
:deep(.tx-context-menu-panel) .tx-popover__reference,
:deep(.tx-context-menu-panel) .tx-base-anchor__reference {
  display: flex;
  width: 100%;
}

.tx-popover__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.tx-popover__reference.is-full-width {
  display: flex;
  width: 100%;
}

.tx-popover__content {
  position: relative;
  width: 100%;
}
</style>
