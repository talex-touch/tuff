<script setup lang="ts">
import type { SplitterDirection, SplitterEmits, SplitterProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({ name: 'TxSplitter' })

const props = withDefaults(defineProps<SplitterProps>(), {
  modelValue: 0.5,
  direction: 'horizontal',
  min: 0.1,
  max: 0.9,
  disabled: false,
  barSize: 10,
  snap: 0,
})

const emit = defineEmits<SplitterEmits>()

const rootRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function snapValue(v: number) {
  const s = Math.max(0, props.snap ?? 0)
  if (!s)
    return v
  const n = Math.round(v / s) * s
  return clamp01(n)
}

const value = computed({
  get: () => clamp01(Number.isFinite(props.modelValue) ? (props.modelValue as number) : 0.5),
  set: (v: number) => {
    const next = snapValue(clamp(v, props.min ?? 0.1, props.max ?? 0.9))
    emit('update:modelValue', next)
    emit('change', next)
  },
})

const dir = computed<SplitterDirection>(() => (props.direction === 'vertical' ? 'vertical' : 'horizontal'))

const rootStyle = computed<Record<string, string>>(() => {
  return {
    '--tx-splitter-bar-size': `${Math.max(6, props.barSize ?? 10)}px`,
    '--tx-splitter-ratio': String(value.value),
  }
})

function setByPointer(e: PointerEvent) {
  const el = rootRef.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()

  if (dir.value === 'horizontal') {
    const x = e.clientX - rect.left
    const r = rect.width > 0 ? x / rect.width : 0.5
    value.value = r
    return
  }

  const y = e.clientY - rect.top
  const r = rect.height > 0 ? y / rect.height : 0.5
  value.value = r
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled)
    return
  dragging.value = true
  emit('drag-start')
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  setByPointer(e)
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
}

function onWindowPointerMove(e: PointerEvent) {
  if (!dragging.value)
    return
  setByPointer(e)
}

function endDrag() {
  if (!dragging.value)
    return
  dragging.value = false
  emit('drag-end')
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
}

function onWindowPointerUp() {
  endDrag()
}

function onKeyDown(e: KeyboardEvent) {
  if (props.disabled)
    return
  const step = 0.02

  if (dir.value === 'horizontal') {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      value.value = value.value - step
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      value.value = value.value + step
    }
  }
  else {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      value.value = value.value - step
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      value.value = value.value + step
    }
  }
}

watch(
  () => props.disabled,
  (v) => {
    if (v)
      endDrag()
  },
)

onBeforeUnmount(() => {
  endDrag()
})
</script>

<template>
  <div
    ref="rootRef"
    class="tx-splitter"
    :class="[`is-${dir}`, { 'is-disabled': disabled, 'is-dragging': dragging }]"
    :style="rootStyle"
  >
    <div class="tx-splitter__pane tx-splitter__pane--a">
      <slot name="a" />
    </div>

    <div
      class="tx-splitter__bar"
      :tabindex="disabled ? -1 : 0"
      role="separator"
      :aria-orientation="dir === 'horizontal' ? 'vertical' : 'horizontal'"
      aria-label="Resize"
      @pointerdown="onPointerDown"
      @keydown="onKeyDown"
    >
      <div class="tx-splitter__grip" aria-hidden="true" />
    </div>

    <div class="tx-splitter__pane tx-splitter__pane--b">
      <slot name="b" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-splitter {
  --tx-splitter-bar-size: 10px;
  --tx-splitter-ratio: 0.5;

  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 65%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 82%, transparent);
}

.tx-splitter.is-horizontal {
  grid-template-columns:
    minmax(0, calc(var(--tx-splitter-ratio) * 100%))
    var(--tx-splitter-bar-size)
    minmax(0, calc((1 - var(--tx-splitter-ratio)) * 100%));
}

.tx-splitter.is-vertical {
  grid-template-rows:
    minmax(0, calc(var(--tx-splitter-ratio) * 100%))
    var(--tx-splitter-bar-size)
    minmax(0, calc((1 - var(--tx-splitter-ratio)) * 100%));
}

.tx-splitter__pane {
  min-width: 0;
  min-height: 0;
}

.tx-splitter__bar {
  position: relative;
  outline: none;
  background: transparent;

  &::before {
    content: '';
    position: absolute;
    inset: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 85%, transparent);
    opacity: 0.35;
    transition: opacity 0.16s ease, background 0.16s ease;
  }

  &:focus-visible::before {
    opacity: 0.75;
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
  }
}

.tx-splitter.is-horizontal .tx-splitter__bar {
  cursor: col-resize;
}

.tx-splitter.is-vertical .tx-splitter__bar {
  cursor: row-resize;
}

.tx-splitter__grip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 74%, transparent);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.tx-splitter.is-disabled {
  opacity: 0.75;

  .tx-splitter__bar {
    cursor: not-allowed;
  }
}

.tx-splitter.is-dragging {
  user-select: none;
}
</style>
