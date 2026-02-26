<script setup lang="ts">
import type { FlipOverlayProps, TxFlipOverlayInstance } from '@talex-touch/tuffex'
import { TxFlipOverlay } from '@talex-touch/tuffex'
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useAttrs,
  useSlots,
  watch
} from 'vue'
import {
  hideFlipDialogReference,
  resolveFlipDialogCardStyleVariables,
  resolveFlipDialogHideTarget,
  resolveFlipDialogReference,
  restoreFlipDialogReference,
  shouldFlipDialogAutoOpenOnReferenceClick,
  type FlipDialogReference,
  type FlipDialogSize
} from './flip-dialog.utils'
type FlipDialogPassThroughProps = Omit<
  FlipOverlayProps,
  'modelValue' | 'source' | 'cardClass' | 'cardStyle'
>

interface FlipDialogProps extends /* @vue-ignore */ FlipDialogPassThroughProps {
  modelValue?: boolean
  reference?: FlipDialogReference
  referenceAutoOpen?: boolean
  hideReferenceOnOpen?: boolean
  size?: FlipDialogSize
  width?: string
  maxHeight?: string
  minHeight?: string
}

interface FlipDialogEmits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:expanded', value: boolean): void
  (e: 'update:animating', value: boolean): void
  (e: 'open'): void
  (e: 'opened'): void
  (e: 'close'): void
  (e: 'closed'): void
}

defineOptions({
  name: 'FlipDialog',
  inheritAttrs: false
})

const props = withDefaults(defineProps<FlipDialogProps>(), {
  modelValue: false,
  reference: undefined,
  referenceAutoOpen: true,
  hideReferenceOnOpen: true,
  size: 'lg'
})

const emit = defineEmits<FlipDialogEmits>()
const attrs = useAttrs()
const slots = useSlots()
const instance = getCurrentInstance()

const overlayRef = ref<TxFlipOverlayInstance | null>(null)
const referenceContainerRef = ref<HTMLElement | null>(null)
const slotReferenceElement = ref<HTMLElement | null>(null)
const hiddenReferenceTarget = ref<HTMLElement | null>(null)
const hiddenReferenceSnapshot = ref<{ opacity: string; pointerEvents: string } | null>(null)
const visible = ref(Boolean(props.modelValue))

const hasReferenceSlot = computed(() => Boolean(slots.reference))
const hasReferenceProp = computed(() => {
  const vnodeProps = instance?.vnode.props
  if (!vnodeProps) return false
  return Object.prototype.hasOwnProperty.call(vnodeProps, 'reference')
})

const resolvedReference = computed<FlipDialogReference>(() => {
  return resolveFlipDialogReference({
    hasReferenceProp: hasReferenceProp.value,
    propReference: props.reference,
    slotReference: slotReferenceElement.value
  })
})

const dialogCardClass = computed(() => `FlipDialog-Card FlipDialog-Card--${props.size}`)

const dialogCardStyle = computed(() =>
  resolveFlipDialogCardStyleVariables({
    size: props.size,
    width: props.width,
    maxHeight: props.maxHeight,
    minHeight: props.minHeight
  })
)

const referenceSlotProps = computed(() => ({
  open,
  close,
  toggle,
  visible: visible.value
}))

function resolveSlotReferenceElement(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null
  const child = Array.from(container.children).find((node) => node instanceof HTMLElement)
  if (child instanceof HTMLElement) return child
  return container
}

function syncSlotReferenceElement(): void {
  slotReferenceElement.value = resolveSlotReferenceElement(referenceContainerRef.value)
}

function resolveHiddenReferenceTarget(): HTMLElement | null {
  return resolveFlipDialogHideTarget({
    reference: resolvedReference.value,
    slotReference: slotReferenceElement.value
  })
}

function restoreHiddenReference(): void {
  const target = hiddenReferenceTarget.value
  const snapshot = hiddenReferenceSnapshot.value
  if (!target || !snapshot) return
  restoreFlipDialogReference(target, snapshot)
  hiddenReferenceTarget.value = null
  hiddenReferenceSnapshot.value = null
}

function hideReference(target: HTMLElement): void {
  if (hiddenReferenceTarget.value === target) return
  restoreHiddenReference()
  hiddenReferenceSnapshot.value = hideFlipDialogReference(target)
  hiddenReferenceTarget.value = target
}

function syncReferenceVisibility(): void {
  if (!props.hideReferenceOnOpen || !visible.value) {
    restoreHiddenReference()
    return
  }
  const target = resolveHiddenReferenceTarget()
  if (!target) {
    restoreHiddenReference()
    return
  }
  hideReference(target)
}

function open(): void {
  visible.value = true
}

function close(): void {
  if (overlayRef.value) {
    overlayRef.value.close()
    return
  }
  visible.value = false
}

function toggle(): void {
  if (visible.value) {
    close()
    return
  }
  open()
}

function handleReferenceClick(): void {
  if (
    !shouldFlipDialogAutoOpenOnReferenceClick({
      referenceAutoOpen: props.referenceAutoOpen,
      visible: visible.value
    })
  ) {
    return
  }
  open()
}

watch(
  () => props.modelValue,
  (value) => {
    const nextVisible = Boolean(value)
    if (visible.value === nextVisible) return
    visible.value = nextVisible
  },
  { immediate: true }
)

watch(visible, (value) => {
  if (value === Boolean(props.modelValue)) return
  emit('update:modelValue', value)
})

watch(
  [visible, () => props.hideReferenceOnOpen, resolvedReference, slotReferenceElement],
  syncReferenceVisibility,
  { immediate: true, flush: 'post' }
)

onMounted(() => {
  syncSlotReferenceElement()
})

onUpdated(() => {
  syncSlotReferenceElement()
})

onBeforeUnmount(() => {
  restoreHiddenReference()
})

defineExpose({
  close,
  open,
  toggle
})
</script>

<template>
  <span
    v-if="hasReferenceSlot"
    ref="referenceContainerRef"
    class="FlipDialog-Reference"
    @click="handleReferenceClick"
  >
    <slot name="reference" v-bind="referenceSlotProps" />
  </span>

  <Teleport to="body">
    <TxFlipOverlay
      ref="overlayRef"
      v-model="visible"
      v-bind="attrs"
      :source="resolvedReference"
      :card-class="dialogCardClass"
      :card-style="dialogCardStyle"
      @update:expanded="emit('update:expanded', $event)"
      @update:animating="emit('update:animating', $event)"
      @open="emit('open')"
      @opened="emit('opened')"
      @close="emit('close')"
      @closed="emit('closed')"
    >
      <template v-if="slots.header" #header="slotProps">
        <slot name="header" v-bind="slotProps" />
      </template>
      <template v-if="slots['header-display']" #header-display="slotProps">
        <slot name="header-display" v-bind="slotProps" />
      </template>
      <template v-if="slots['header-actions']" #header-actions="slotProps">
        <slot name="header-actions" v-bind="slotProps" />
      </template>
      <template v-if="slots['header-close']" #header-close="slotProps">
        <slot name="header-close" v-bind="slotProps" />
      </template>
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style lang="scss">
.FlipDialog-Reference {
  display: inline-flex;
  max-width: 100%;
}

.FlipDialog-Card {
  width: var(--flip-dialog-width, min(1040px, calc(100vw - 48px)));
  max-height: var(--flip-dialog-max-height, calc(82dvh - 24px));
  min-height: var(--flip-dialog-min-height, 0);
}

@media (max-width: 767px) {
  .FlipDialog-Card {
    width: calc(100vw - 20px);
    max-height: calc(92dvh - 20px);
  }
}
</style>
