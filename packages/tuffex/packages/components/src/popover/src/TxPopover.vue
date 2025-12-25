<script setup lang="ts">
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TxCard from '../../card/src/TxCard.vue'
import type { PopoverProps } from './types'

defineOptions({ name: 'TxPopover' })

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: false,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  maxWidth: 360,
  referenceFullWidth: false,
  panelVariant: 'solid',
  panelBackground: 'glass',
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

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    emit(v ? 'open' : 'close')
  },
})

const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)

const { floatingStyles, update } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const w = props.width > 0 ? props.width : rects.reference.width
        Object.assign(elements.floating.style, {
          width: `${w}px`,
          maxWidth: `${props.maxWidth}px`,
          maxHeight: `${Math.min(availableHeight, 420)}px`,
          overflowY: 'auto',
        })
      },
    }),
  ],
})

function toggle() {
  if (props.disabled) return
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

function close() {
  open.value = false
}

function isEventInside(e: Event, el: HTMLElement | null): boolean {
  if (!el)
    return false
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  if (path && path.length)
    return path.includes(el)
  const t = (e.target ?? null) as Node | null
  return !!t && el.contains(t)
}

function handleOutside(e: Event) {
  if (!props.closeOnClickOutside) return
  if (!open.value) return

  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    close()
}

function handleEsc(e: KeyboardEvent) {
  if (!props.closeOnEsc) return
  if (e.key !== 'Escape') return
  if (!open.value) return
  close()
}

watch(
  open,
  async (v) => {
    if (!v) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      return
    }

    lastOpenedAt.value = performance.now()
    await nextTick()
    await update()
    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-popover__reference"
    :class="{ 'is-full-width': referenceFullWidth }"
    @click.capture="toggle"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <Transition name="tx-popover">
      <div v-show="open && !disabled" ref="floatingRef" class="tx-popover" :style="floatingStyles">
        <TxCard
          class="tx-popover__card"
          :variant="panelVariant"
          :background="panelBackground"
          :shadow="panelShadow"
          :radius="panelRadius"
          :padding="panelPadding"
        >
          <slot />
        </TxCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-popover__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;

  &.is-full-width {
    width: 100%;
  }
}

.tx-popover {
  z-index: var(--tx-index-popper, 2000);
  padding: 0;
  background: transparent;
  border: none;
  overflow: hidden;
}

.tx-popover__card {
  width: 100%;
  max-height: 100%;
  overflow: auto;
}

.tx-popover-enter-active,
.tx-popover-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tx-popover-enter-from,
.tx-popover-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
