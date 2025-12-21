<script setup lang="ts">
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PopoverProps } from './types'

defineOptions({ name: 'TxPopover' })

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: false,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  maxWidth: 360,
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
  open.value = !open.value
}

function close() {
  open.value = false
}

function handleOutside(e: MouseEvent) {
  if (!props.closeOnClickOutside) return
  if (!open.value) return

  const t = e.target as Node | null
  const inRef = !!referenceRef.value && !!t && referenceRef.value.contains(t)
  const inFloat = !!floatingRef.value && !!t && floatingRef.value.contains(t)
  if (!inRef && !inFloat) close()
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
  document.addEventListener('click', handleOutside)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutside)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <span ref="referenceRef" class="tx-popover__reference" @click="toggle">
    <slot name="reference" />
  </span>

  <Teleport to="body">
    <Transition name="tx-popover">
      <div v-show="open && !disabled" ref="floatingRef" class="tx-popover" :style="floatingStyles">
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-popover__reference {
  display: inline-flex;
  align-items: center;
}

.tx-popover {
  z-index: var(--tx-index-popper, 2000);
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 90%, transparent);
  box-shadow: var(--tx-box-shadow-light, 0 2px 12px rgba(0, 0, 0, 0.1));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
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
