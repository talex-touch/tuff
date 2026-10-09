<script setup lang="ts">
// Adapted from Amicro CardCarousel, CardCoverFlow, CardTimeMachine.
// MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { CSSProperties } from 'vue'
import type { Carousel3DEmits, Carousel3DProps, Carousel3DSlotProps } from './types'
import { computed, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { TxTextMorph } from '../../text-morph'

defineOptions({ name: 'TxCarousel3D' })
const props = withDefaults(defineProps<Carousel3DProps>(), {
  variant: 'card-carousel', expanded: undefined, loop: false, animated: true,
  disabled: false, controls: true, dots: true, timeline: true, timelineHover: true,
  duration: 800, size: 'md', ariaLabel: 'Card carousel', previousLabel: 'Previous',
  nextLabel: 'Next', itemLabel: 'Item', timelineLabel: 'Timeline',
})
const emit = defineEmits<Carousel3DEmits>()
defineSlots<{
  item?: (props: Carousel3DSlotProps) => unknown
  caption?: (props: Carousel3DSlotProps) => unknown
  empty?: () => unknown
}>()
const root = ref<HTMLElement | null>(null)
const hovered = ref(false)
const focused = ref(false)
const hoverPosition = ref<number | null>(null)
const localIndex = ref(props.variant.includes('time-machine') ? 0 : Math.min(2, props.items.length - 1))
const { active } = useMotionActivity(root, () => props.animated)
const filterId = `tx-carousel-${useId().replace(/[^\w-]/g, '')}`
const mode = computed(() => props.variant.includes('time-machine') ? 'time-machine' : props.variant.includes('cover-flow') ? 'cover-flow' : 'carousel')
const mono = computed(() => props.variant.endsWith('-mono'))
const ratio = computed(() => ({ xs: 0.6, sm: 0.8, md: 1, lg: 1.2 })[props.size])
const current = computed(() => Math.max(0, Math.min(props.items.length - 1, props.modelValue ?? localIndex.value)))
const expanded = computed(() => props.expanded ?? (hovered.value || focused.value))
const motion = computed(() => resolveTransition(mode.value === 'time-machine'
  ? { stiffness: 250, damping: 25, mass: 0.8 }
  : mode.value === 'cover-flow' ? { stiffness: 200, damping: 25 } : 'smooth', !active.value))
const transition = computed(() => `transform ${active.value ? props.duration : 0}ms ${motion.value.easing}, opacity ${active.value ? props.duration : 0}ms ${motion.value.easing}`)
const nodes = computed(() => {
  const result: { position: number, index: number, main: boolean }[] = []
  props.items.forEach((_, index) => {
    result.push({ position: index, index, main: true })
    if (index < props.items.length - 1) {
      result.push({ position: index + 0.33, index, main: false })
      result.push({ position: index + 0.66, index: index + 1, main: false })
    }
  })
  return result
})
watch(() => props.items.length, length => { localIndex.value = Math.max(0, Math.min(length - 1, localIndex.value)) })
function select(index: number) {
  if (props.disabled || !props.items.length || !Number.isFinite(index)) return
  const count = props.items.length
  const next = props.loop ? ((Math.round(index) % count) + count) % count : Math.max(0, Math.min(count - 1, Math.round(index)))
  if (next === current.value) return
  localIndex.value = next
  emit('update:modelValue', next)
  const item = props.items[next]
  if (item) emit('change', item, next)
}
function previous() { select(current.value - 1) }
function next() { select(current.value + 1) }
function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); next() }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); previous() }
  else if (event.key === 'Home') { event.preventDefault(); select(0) }
  else if (event.key === 'End') { event.preventDefault(); select(props.items.length - 1) }
}
function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) { focused.value = false; hoverPosition.value = null }
}
function slideStyle(index: number): CSSProperties {
  const offset = index - current.value
  const distance = Math.abs(offset)
  const r = ratio.value
  let transform: string
  let opacity = 1
  let width: number
  let height: number
  if (mode.value === 'cover-flow') {
    width = 80; height = 80 * 4 / 3
    transform = `translate(-50%, -50%) translate3d(${offset * 32 * r}px, 0, ${(offset === 0 ? 50 : -distance * 50) * r}px) rotateY(${offset === 0 ? 0 : offset < 0 ? 38 : -38}deg) scale(${offset === 0 ? 1.1 : Math.max(0, 1 - distance * 0.08)})`
    opacity = distance > 2 ? 0 : 1 - distance * 0.25
  }
  else if (mode.value === 'time-machine') {
    width = 220; height = 135
    transform = `translate(-50%, -50%) translate3d(0, ${(offset < 0 ? 300 : -offset * 12) * r}px, ${(offset < 0 ? 200 : -offset * 60) * r}px) rotateX(${offset < 0 ? -20 : offset * 2}deg) scale(${offset < 0 ? 1.3 : 1})`
    opacity = offset < 0 ? 0 : Math.max(0, 1 - distance * 0.2)
  }
  else {
    width = 110; height = 110
    transform = `translate(-50%, -50%) translate(${offset * 160 * r}px, ${(expanded.value ? offset * 24 : 0) * r}px) rotate(${offset * (expanded.value ? 20 : 5)}deg) scale(${offset === 0 ? 1.05 : expanded.value ? 0.65 : 0.8})`
  }
  return {
    width: `${width * r}px`, height: `${height * r}px`, transform, opacity,
    transition: transition.value, zIndex: mode.value === 'time-machine' ? props.items.length - index : 100 - distance,
    pointerEvents: opacity === 0 ? 'none' : undefined,
    filter: mode.value === 'time-machine' ? `url(#${filterId})` : undefined,
  }
}
function nodeStyle(position: number, main: boolean): CSSProperties {
  const near = hoverPosition.value !== null && Math.abs(position - hoverPosition.value) <= 0.5
  const selected = Math.round(position) === current.value
  const scale = hoverPosition.value === null ? 1 : main ? selected ? 1.4 : near ? 1.25 : 1 : near ? 1.15 : 1
  return { transform: `scaleX(${scale})`, opacity: main ? 1 : near ? 0.5 : 0.3, transition: transition.value }
}
function preview(position: number) {
  hoverPosition.value = position
  if (props.timelineHover) select(position)
}
defineExpose({ previous, next, select })
</script>

<template>
  <div ref="root" class="tx-carousel-3d" :class="[`is-${mode}`, { 'is-mono': mono }]" :data-variant="variant" role="region" aria-roledescription="carousel" :aria-label="ariaLabel" @pointerenter="hovered = true" @pointerleave="hovered = false; hoverPosition = null" @focusin="focused = true" @focusout="onFocusOut" @keydown="onKeydown">
    <slot v-if="!items.length" name="empty" />
    <template v-else>
      <svg v-if="mode === 'time-machine'" class="tx-carousel-3d__defs" aria-hidden="true"><defs><filter :id="filterId"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6" result="goo" /><feBlend in="SourceGraphic" in2="goo" /></filter></defs></svg>
      <div class="tx-carousel-3d__spatial" :style="{ minHeight: `${240 * ratio}px` }">
        <div class="tx-carousel-3d__stage" :style="{ height: `${220 * ratio}px`, perspective: `${(mode === 'time-machine' ? 800 : 1000) * ratio}px` }">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-carousel-3d__slide" :class="{ 'is-active': current === index }" :style="slideStyle(index)" :disabled="disabled" :aria-label="item.title || `${itemLabel} ${index + 1}`" :aria-current="current === index ? 'true' : undefined" :tabindex="current === index ? 0 : -1" @click="select(index)">
            <slot name="item" :item="item" :index="index" :active="current === index">
              <img v-if="item.src && !mono" :src="item.src" :alt="item.alt ?? item.title ?? ''" draggable="false">
              <span v-else class="tx-carousel-3d__content"><span>{{ item.title || `${itemLabel} ${index + 1}` }}</span><small v-if="item.description">{{ item.description }}</small></span>
            </slot>
          </button>
        </div>
        <div v-if="mode === 'time-machine' && timeline" class="tx-carousel-3d__timeline" :aria-label="timelineLabel" @pointerleave="hoverPosition = null">
          <button v-for="node in nodes" :key="node.position" type="button" class="tx-carousel-3d__tick" :class="{ 'is-main': node.main, 'is-selected': node.index === current }" :disabled="disabled" :aria-label="`${timelineLabel}: ${items[node.index]?.date || items[node.index]?.title || `${itemLabel} ${node.index + 1}`}`" :aria-current="node.main && node.index === current ? 'true' : undefined" @pointerenter="preview(node.position)" @focus="preview(node.position)" @click="select(node.position)">
            <span v-if="node.main" class="tx-carousel-3d__date" :style="{ opacity: hoverPosition === node.position ? 1 : 0, transform: hoverPosition === node.position ? 'translateY(0) scale(1)' : 'translateY(-2px) scale(0.8)', transition }">{{ items[node.index]?.date || items[node.index]?.title }}</span>
            <span class="tx-carousel-3d__line" :style="nodeStyle(node.position, node.main)" />
          </button>
          <input class="tx-carousel-3d__scrubber" type="range" min="0" :max="items.length - 1" step="1" :value="current" :disabled="disabled" :aria-label="timelineLabel" @input="select(Number(($event.target as HTMLInputElement).value))">
        </div>
      </div>
      <div class="tx-carousel-3d__caption" aria-live="polite" aria-atomic="true">
<slot name="caption" :item="items[current]!" :index="current" :active="true">
<TxTextMorph :text="items[current]?.title ?? ''" :duration-ms="300" :disabled="!active" />
</slot>
</div>
      <div v-if="controls || dots" class="tx-carousel-3d__controls">
        <button v-if="controls" type="button" :disabled="disabled || (!loop && current === 0)" @click="previous">
{{ previousLabel }}
</button>
        <div v-if="dots" class="tx-carousel-3d__dots">
          <button v-for="(item, index) in items" :key="item.id ?? index" type="button" class="tx-carousel-3d__dot" :class="{ 'is-active': current === index }" :disabled="disabled" :aria-label="`${itemLabel} ${index + 1}: ${item.title || ''}`" :aria-current="current === index ? 'true' : undefined" @click="select(index)">
<span :style="{ transition: `width ${active ? 300 : 0}ms ${motion.easing}` }" />
</button>
        </div>
        <button v-if="controls" type="button" :disabled="disabled || (!loop && current === items.length - 1)" @click="next">
{{ nextLabel }}
</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tx-carousel-3d { position: relative; width: 100%; overflow: hidden; border-radius: 16px; background: var(--tx-bg-color); color: var(--tx-text-color-primary); font-size: 13px; padding: 12px 0; }
.tx-carousel-3d__spatial { display: flex; align-items: center; justify-content: center; gap: 12px; }
.tx-carousel-3d__stage { position: relative; flex: 1; min-width: 0; transform-style: preserve-3d; }
.tx-carousel-3d__slide { position: absolute; left: 50%; top: 50%; padding: 0; border: 0; border-radius: 12px; color: inherit; font: inherit; background: var(--tx-bg-color-overlay, var(--tx-bg-color)); box-shadow: inset 0 0 0 1px var(--tx-border-color), 3px 6px 20px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); cursor: pointer; overflow: hidden; }
.tx-carousel-3d__slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tx-carousel-3d__content { display: flex; height: 100%; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px; }
.tx-carousel-3d__content small { color: var(--tx-text-color-regular); font-size: 12px; }
.tx-carousel-3d__slide.is-active { box-shadow: inset 0 0 0 2px var(--tx-color-primary), 3px 6px 20px color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); }
.tx-carousel-3d__caption { min-height: 20px; text-align: center; padding: 6px 12px; font-weight: 500; }
.tx-carousel-3d__controls, .tx-carousel-3d__dots { display: flex; justify-content: center; align-items: center; gap: 4px; }
.tx-carousel-3d__controls button { padding: 6px 8px; border: 0; border-radius: 8px; color: var(--tx-text-color-regular); background: var(--tx-fill-color-light); font: inherit; cursor: pointer; }
.tx-carousel-3d__controls button:hover { background: var(--tx-fill-color); }
.tx-carousel-3d__controls .tx-carousel-3d__dot { width: 28px; height: 28px; padding: 8px 4px; background: transparent; }
.tx-carousel-3d__dot span { display: block; width: 6px; height: 6px; margin: auto; border-radius: 6px; background: var(--tx-text-color-placeholder); }
.tx-carousel-3d__dot.is-active span { width: 18px; background: var(--tx-color-primary); }
.tx-carousel-3d button:focus-visible, .tx-carousel-3d__scrubber:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-carousel-3d button:disabled { cursor: not-allowed; }
.tx-carousel-3d__timeline { display: flex; flex-direction: column; align-items: stretch; flex: 0 0 112px; padding: 12px 8px 12px 0; }
.tx-carousel-3d__tick { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 12px; padding: 3px 0; border: 0; background: transparent; color: var(--tx-text-color-regular); cursor: pointer; font: inherit; }
.tx-carousel-3d__date { font-size: 12px; white-space: nowrap; }
.tx-carousel-3d__line { display: block; width: 24px; height: 3px; border-radius: 3px; background: var(--tx-text-color-placeholder); transform-origin: right; }
.tx-carousel-3d__tick.is-main.is-selected .tx-carousel-3d__line { background: var(--tx-color-primary); }
.tx-carousel-3d__scrubber { width: 100%; margin-top: 12px; accent-color: var(--tx-color-primary); }
.tx-carousel-3d__defs { position: absolute; width: 0; height: 0; }
@media (max-width: 400px) { .tx-carousel-3d__timeline { flex-basis: 88px; } .tx-carousel-3d__date { max-width: 52px; overflow: hidden; text-overflow: ellipsis; } }
@media (prefers-reduced-motion: reduce) { .tx-carousel-3d__slide, .tx-carousel-3d__line, .tx-carousel-3d__date, .tx-carousel-3d__dot span { transition: none !important; } }
</style>
