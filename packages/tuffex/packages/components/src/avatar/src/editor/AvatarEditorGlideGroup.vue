<script setup lang="ts">
import type { AvatarEditorIconName } from './icons'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stepSpring } from '../../../../../utils/animation/spring'
import { useJellyIndicator } from '../../../../../utils/use-jelly-indicator'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorIcon from './AvatarEditorIcon.vue'

export interface GlideOption<T extends string | number = string | number> {
  value: T
  label?: string
  ariaLabel?: string
  icon?: AvatarEditorIconName
  disabled?: boolean
}

defineOptions({ name: 'AvatarEditorGlideGroup' })

const props = withDefaults(defineProps<{
  modelValue: string | number
  options: readonly GlideOption[]
  compact?: boolean
  iconOnly?: boolean
  ariaLabel?: string
  buttonClass?: string
}>(), {
  compact: false,
  iconOnly: false,
  buttonClass: 'tx-avatar-editor__seg-btn',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const groupRef = ref<HTMLElement | null>(null)
const thumbRef = ref<HTMLElement | null>(null)
const itemEls = new Map<string | number, HTMLElement>()
let resizeObserver: ResizeObserver | null = null

function setItemRef(value: string | number, el: unknown): void {
  if (el instanceof HTMLElement)
    itemEls.set(value, el)
  else
    itemEls.delete(value)
}

const indicator = useJellyIndicator({
  axis: 'x',
  material: 'glide',
  integrate: stepSpring,
  bounds: () => {
    const el = groupRef.value
    if (!el || el.clientWidth <= 0)
      return null
    return { start: 2, end: Math.max(2, el.clientWidth - 2) }
  },
  onFrame: (frame) => {
    const thumb = thumbRef.value
    if (!thumb)
      return
    if (!frame.visible || frame.rect.width <= 0 || frame.rect.height <= 0) {
      thumb.style.opacity = '0'
      return
    }
    thumb.style.opacity = '1'
    thumb.style.width = `${frame.rect.width}px`
    thumb.style.height = `${frame.rect.height}px`
    thumb.style.transform = `translate3d(${frame.rect.x}px, ${frame.rect.y}px, 0)`
  },
})

function measureActive(): { x: number, y: number, width: number, height: number } | null {
  const container = groupRef.value
  const active = itemEls.get(props.modelValue)
  if (!container || !active)
    return null
  const cRect = container.getBoundingClientRect()
  const aRect = active.getBoundingClientRect()
  if (aRect.width > 0 && aRect.height > 0 && cRect.width > 0) {
    return {
      x: aRect.left - cRect.left,
      y: aRect.top - cRect.top,
      width: aRect.width,
      height: aRect.height,
    }
  }
  const width = active.offsetWidth
  const height = active.offsetHeight
  if (width <= 0 || height <= 0)
    return null
  return {
    x: active.offsetLeft,
    y: active.offsetTop,
    width,
    height,
  }
}

function sync(animate: boolean): void {
  const box = measureActive()
  indicator.moveTo(box, { animate })
}

function select(option: GlideOption): void {
  if (option.disabled)
    return
  emit('update:modelValue', option.value)
}

watch(() => props.modelValue, () => {
  void nextTick(() => sync(true))
})

watch(() => props.options, () => {
  void nextTick(() => sync(false))
}, { deep: true })

onMounted(() => {
  void nextTick(() => sync(false))
  if (typeof ResizeObserver !== 'undefined' && groupRef.value) {
    resizeObserver = new ResizeObserver(() => sync(false))
    resizeObserver.observe(groupRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="groupRef"
    class="tx-avatar-editor__segmented tx-ae-glide"
    :class="{ 'is-compact': compact, 'is-icon-only': iconOnly }"
    role="group"
    :aria-label="ariaLabel"
  >
    <span ref="thumbRef" class="tx-ae-glide__thumb" aria-hidden="true" />
    <template v-for="opt in options" :key="String(opt.value)">
      <TxTooltip v-if="iconOnly && (opt.ariaLabel || opt.label)" :content="opt.ariaLabel || opt.label || ''">
        <button
          :ref="el => setItemRef(opt.value, el)"
          type="button"
          class="tx-ae-glide__btn"
          :class="[buttonClass, { 'is-active': modelValue === opt.value }]"
          :disabled="opt.disabled"
          :aria-pressed="modelValue === opt.value"
          :aria-label="opt.ariaLabel || opt.label || String(opt.value)"
          @click="select(opt)"
        >
          <AvatarEditorIcon v-if="opt.icon" :name="opt.icon" :size="14" />
        </button>
      </TxTooltip>
      <button
        v-else
        :ref="el => setItemRef(opt.value, el)"
        type="button"
        class="tx-ae-glide__btn"
        :class="[buttonClass, { 'is-active': modelValue === opt.value }]"
        :disabled="opt.disabled"
        :aria-pressed="modelValue === opt.value"
        :aria-label="opt.ariaLabel || opt.label || String(opt.value)"
        @click="select(opt)"
      >
        <AvatarEditorIcon v-if="opt.icon" :name="opt.icon" :size="13" />
        <span v-if="opt.label">{{ opt.label }}</span>
      </button>
    </template>
  </div>
</template>

<style lang="scss">
.tx-ae-glide {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 9px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
  overflow: hidden;
}

.tx-ae-glide__thumb {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 7px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--tx-color-black, #000000) 10%, transparent);
  opacity: 0;
  pointer-events: none;
  z-index: 0;
  transition: opacity 140ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-ae-glide__btn {
  position: relative;
  z-index: 1;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 9px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(:disabled) {
    color: var(--tx-text-color-primary, #303133);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &.is-active {
    color: var(--tx-text-color-primary, #303133);
    font-weight: 500;
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: -1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-ae-glide.is-compact .tx-ae-glide__btn {
  padding: 3px 7px;
  font-size: 11px;
}

.tx-ae-glide.is-icon-only .tx-ae-glide__btn {
  width: 28px;
  height: 26px;
  padding: 0;
}
</style>
