<script setup lang="ts">
// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { CSSProperties } from 'vue'
import type { CardSpreadEmits, CardSpreadProps, CardSpreadSlotProps } from './types'
import { computed, ref } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { SPREAD_DEFAULTS, spreadGeometry } from './geometry'

defineOptions({ name: 'TxCardSpread' })
const props = withDefaults(defineProps<CardSpreadProps>(), {
  variant: 'card-arc-5', expanded: undefined, duration: 500, hoverIntensity: 1,
  colorful: false, blurAmount: 4, opacityAmount: 0.4, showBrackets: true,
  animated: true, disabled: false, size: 'md', ariaLabel: 'Card spread',
  expandLabel: 'Expand cards', collapseLabel: 'Collapse cards',
})
const emit = defineEmits<CardSpreadEmits>()
defineSlots<{ item?: (props: CardSpreadSlotProps) => unknown, empty?: () => unknown }>()
const root = ref<HTMLElement | null>(null)
const pointerInside = ref(false)
const focusInside = ref(false)
const pinned = ref(false)
const hoveredIndex = ref<number | null>(null)
const focusedIndex = ref<number | null>(null)
const focusIndex = computed(() => hoveredIndex.value ?? focusedIndex.value)
const localIndex = ref(0)
const { active } = useMotionActivity(root, () => props.animated)
const expanded = computed(() => props.expanded ?? (pinned.value || pointerInside.value || focusInside.value))
const selected = computed(() => Math.max(0, Math.min(props.items.length - 1, props.modelValue ?? localIndex.value)))
const ratio = computed(() => ({ xs: 0.6, sm: 0.8, md: 1, lg: 1.2 })[props.size])
const defaults = computed(() => SPREAD_DEFAULTS[props.variant])
const transition = computed(() => {
  const spring = resolveTransition(props.variant === 'card-cascade-stagger'
    ? { stiffness: 200, damping: 22, mass: 0.9 }
    : { stiffness: 180, damping: 20, mass: 0.8 }, !active.value)
  return `transform ${active.value ? props.duration : 0}ms ${spring.easing}, opacity ${active.value ? props.duration : 0}ms ${spring.easing}, filter ${active.value ? props.duration : 0}ms ${spring.easing}`
})
const palette = ['var(--tx-color-danger-light-9)', 'var(--tx-color-primary-light-9)', 'var(--tx-color-success-light-9)', 'var(--tx-color-warning-light-9)', 'var(--tx-color-info-light-9)']
const geometry = computed(() => props.items.map((_, index) => spreadGeometry(
  props.variant, index, props.items.length, expanded.value,
  props.angle ?? defaults.value.angle, props.gap ?? defaults.value.gap,
  props.yOffset ?? defaults.value.yOffset, props.hoverIntensity,
)))
const stageStyle = computed<CSSProperties>(() => {
  const extentX = geometry.value.reduce((extent, point) => Math.max(extent, Math.abs(point.x)), 0)
  const extentY = geometry.value.reduce((extent, point) => Math.max(extent, Math.abs(point.y)), 0)
  return { minWidth: `${(200 + extentX * 2) * ratio.value}px`, height: `${(270 + extentY * 2) * ratio.value}px` }
})
function cardStyle(index: number): CSSProperties {
  const point = geometry.value[index]
  const item = props.items[index]
  if (!point) return {}
  return {
    width: `${128 * ratio.value}px`, height: `${176 * ratio.value}px`,
    transform: `translate(-50%, -50%) translate(${point.x * ratio.value}px, ${point.y * ratio.value}px) rotate(${point.rotate}deg) scale(${point.scale})`,
    transformOrigin: point.origin, zIndex: point.z,
    transition: transition.value,
    backgroundColor: item?.color ?? (props.colorful ? palette[index % palette.length] : undefined),
  }
}
function blurStyle(index: number): CSSProperties {
  const inactive = focusIndex.value !== null && focusIndex.value !== index
  return { filter: inactive ? `blur(${props.blurAmount}px)` : 'none', opacity: inactive ? props.opacityAmount : 1, transition: transition.value, '--tx-focus-transition': `transform ${active.value ? props.duration : 0}ms ${resolveTransition({ stiffness: 350, damping: 20 }, !active.value).easing}, opacity ${active.value ? props.duration : 0}ms ease` }
}
function select(index: number) {
  if (props.disabled || !props.items[index]) return
  localIndex.value = index
  emit('update:modelValue', index)
  emit('select', props.items[index], index)
}
function toggle() {
  if (props.disabled) return
  pinned.value = !(props.expanded ?? pinned.value)
  emit('update:expanded', pinned.value)
}
function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (step) { event.preventDefault(); select(Math.max(0, Math.min(props.items.length - 1, selected.value + step))) }
  else if (event.key === 'Home') { event.preventDefault(); select(0) }
  else if (event.key === 'End') { event.preventDefault(); select(props.items.length - 1) }
  else if (event.key === 'Escape') { pinned.value = false; emit('update:expanded', false) }
}
function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) { focusInside.value = false; focusedIndex.value = null }
}
defineExpose({ select, toggle })
</script>

<template>
  <div ref="root" class="tx-card-spread" :class="{ 'is-expanded': expanded, 'is-disabled': disabled }" :data-variant="variant" role="group" :aria-label="ariaLabel" @keydown="onKeydown" @pointerenter="pointerInside = true" @pointerleave="pointerInside = false; hoveredIndex = null" @focusin="focusInside = true" @focusout="onFocusOut">
    <slot v-if="!items.length" name="empty" />
    <div v-else-if="variant === 'focus-blur'" class="tx-card-spread__focus-list">
      <component :is="item.href ? 'a' : 'button'" v-for="(item, index) in items" :key="item.id ?? index" :href="disabled ? undefined : item.href" :type="item.href ? undefined : 'button'" :disabled="!item.href && disabled" :aria-disabled="disabled || undefined" class="tx-card-spread__focus-item" :class="{ 'has-brackets': showBrackets && focusIndex === index }" :style="blurStyle(index)" @pointerenter="hoveredIndex = index" @pointerleave="hoveredIndex = null" @focus="focusedIndex = index" @click="disabled ? $event.preventDefault() : select(index)">
        <slot name="item" :item="item" :index="index" :selected="selected === index" :expanded="expanded">
{{ item.title }}
</slot>
      </component>
    </div>
    <template v-else-if="items.length">
      <div class="tx-card-spread__viewport">
        <div class="tx-card-spread__stage" :style="stageStyle">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-card-spread__card" :class="{ 'is-selected': selected === index, 'is-stamp': variant === 'card-stamp-arc' }" :style="cardStyle(index)" :disabled="disabled" :aria-pressed="selected === index" :aria-label="item.title || `${ariaLabel} ${index + 1}`" @click="select(index)">
            <slot name="item" :item="item" :index="index" :selected="selected === index" :expanded="expanded">
              <img v-if="item.src" class="tx-card-spread__image" :src="item.src" :alt="item.alt ?? item.title ?? ''" draggable="false">
              <span class="tx-card-spread__content"><span>{{ item.title }}</span><small v-if="item.description">{{ item.description }}</small></span>
            </slot>
          </button>
        </div>
      </div>
      <button type="button" class="tx-card-spread__toggle" :disabled="disabled" :aria-expanded="expanded" @click="toggle">
{{ (props.expanded ?? pinned) ? collapseLabel : expandLabel }}
</button>
    </template>
  </div>
</template>

<style scoped>
.tx-card-spread { width: 100%; color: var(--tx-text-color-primary); font-size: 13px; }
.tx-card-spread__viewport { overflow: auto; }
.tx-card-spread__stage { position: relative; width: 100%; }
.tx-card-spread__card { position: absolute; top: 50%; left: 50%; padding: 0; border: 0; border-radius: 16px; background: var(--tx-bg-color-overlay, var(--tx-bg-color)); color: inherit; box-shadow: inset 0 0 0 1px var(--tx-border-color), 0 4px 12px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); overflow: hidden; cursor: pointer; text-align: left; font: inherit; }
.tx-card-spread__card.is-selected { box-shadow: inset 0 0 0 2px var(--tx-color-primary), 0 4px 12px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); }
.tx-card-spread__card.is-stamp { outline: 2px dashed var(--tx-border-color-darker); outline-offset: -7px; }
.tx-card-spread__card:focus-visible, .tx-card-spread__toggle:focus-visible, .tx-card-spread__focus-item:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-card-spread__image { display: block; width: 100%; height: 68%; object-fit: cover; }
.tx-card-spread__content { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.tx-card-spread__content small { font-size: 12px; color: var(--tx-text-color-regular); }
.tx-card-spread__toggle { display: block; margin: 8px auto; padding: 6px 12px; border: 0; border-radius: 8px; background: var(--tx-fill-color-light); color: var(--tx-text-color-regular); font: inherit; cursor: pointer; }
.tx-card-spread__toggle:hover { background: var(--tx-fill-color); }
.tx-card-spread__focus-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; padding: 28px 16px; }
.tx-card-spread__focus-item { position: relative; padding: 4px 8px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; }
.tx-card-spread__focus-item.has-brackets { color: var(--tx-color-primary); }
.tx-card-spread__focus-item::after { content: ''; position: absolute; inset: -4px -8px; border: 2px dashed var(--tx-border-color-darker); border-radius: 8px; pointer-events: none; opacity: 0; transform: scale(1.3); transition: var(--tx-focus-transition); }
.tx-card-spread__focus-item.has-brackets::after { opacity: 1; transform: scale(1.1); }
.tx-card-spread button:disabled, .tx-card-spread [aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }
@media (prefers-reduced-motion: reduce) { .tx-card-spread__card, .tx-card-spread__focus-item, .tx-card-spread__focus-item::after { transition: none !important; } }
</style>
