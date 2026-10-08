<script setup lang="ts">
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { MotionToggleActivation, MotionToggleProps, MotionToggleValue } from './types'
import type { MotionHapticResult } from '../../motion/src/types'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { useMotionResources, useWebHaptics } from '../../motion/src/composables'
import IconSwap from '../../motion/src/IconSwap.vue'

defineOptions({ name: 'TxMotionToggle' })
const props = withDefaults(defineProps<MotionToggleProps>(), {
  modelValue: false, variant: 't-bounce', size: 'md', disabled: false,
  enabled: true, haptic: false, options: () => [],
})
const emit = defineEmits<{
  'update:modelValue': [value: MotionToggleValue]
  'update:count': [value: number]
  change: [value: MotionToggleValue]
  activate: [value: MotionToggleActivation]
  haptic: [result: MotionHapticResult]
}>()
const root = ref<HTMLElement | null>(null)
const icon = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)
const check = ref<SVGPathElement | null>(null)
const tabButtons = ref<HTMLButtonElement[]>([])
const activity = useMotionActivity(root, () => props.enabled && !props.disabled)
const haptics = useWebHaptics(() => props.haptic !== false && !props.disabled)
const on = computed(() => props.modelValue === true)
const isAction = computed(() => ['t-bookmark', 't-like', 't-dislike', 't-repost'].includes(props.variant))
const hasCount = computed(() => (props.variant === 't-like' || props.variant === 't-repost') && props.count !== undefined)
const selected = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const focusIndex = computed(() => selected.value >= 0 && !props.options[selected.value]?.disabled ? selected.value : props.options.findIndex(option => !option.disabled))
const springs = {
  't-bounce': { stiffness: 320, damping: 13, mass: 1 },
  't-rect': { stiffness: 500, damping: 30 },
  't-circle': { stiffness: 450, damping: 25 },
  't-morph': { stiffness: 400, damping: 25 },
  't-check': { stiffness: 500, damping: 28 },
  't-theme': { stiffness: 350, damping: 22 },
  't-pill': { stiffness: 500, damping: 30 },
  'classic-toggle': { stiffness: 500, damping: 30 },
}
const transition = computed(() => resolveTransition(props.transition ?? (props.variant === 't-solid' ? { duration: 150, ease: 'ease-out' } : springs[props.variant as keyof typeof springs] ?? 'snappy'), !activity.active.value))
const style = computed<CSSProperties>(() => ({ '--tx-mt-duration': `${transition.value.duration}ms`, '--tx-mt-ease': transition.value.easing }))
const indicator = shallowRef<CSSProperties>({ opacity: 0 })
let animations: Animation[] = []
function stopAnimations() { for (const animation of animations) animation.cancel(); animations = [] }
function animate(element: Element | null, frames: Keyframe[], duration: number, easing = transition.value.easing) {
  if (!element || !activity.active.value || !element.animate) return
  const animation = element.animate(frames, { duration, easing })
  animations.push(animation)
  animation.onfinish = () => { animation.cancel(); animations = animations.filter(item => item !== animation) }
}
function feedback(value: boolean) {
  stopAnimations()
  if (props.variant === 't-bookmark') animate(icon.value, [{ transform: 'scale(1)' }, { transform: `scale(${value ? 1.3 : .9})` }, { transform: 'scale(1)' }], 360)
  if (props.variant === 't-like') {
    animate(icon.value, [{ transform: 'scale(1)' }, { transform: `scale(${value ? 1.4 : .85})` }, { transform: 'scale(1)' }], 420)
    if (value && root.value) {
      for (const particle of root.value.querySelectorAll<HTMLElement>('.tx-motion-toggle__particle')) {
        const angle = Number(particle.dataset.angle) * Math.PI / 180
        animate(particle, [{ transform: 'translate(0, 0) scale(.25)', opacity: 0 }, { transform: `translate(${Math.cos(angle) * 18}px, ${Math.sin(angle) * 18}px) scale(1)`, opacity: 1, offset: .3 }, { transform: `translate(${Math.cos(angle) * 26}px, ${Math.sin(angle) * 26}px) scale(.25)`, opacity: 0 }], 500, 'ease-out')
      }
    }
  }
  if (props.variant === 't-dislike') animate(icon.value, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${value ? -15 : 15}deg)` }, { transform: 'rotate(0deg)' }], 300)
  if (props.variant === 't-check' && value) animate(check.value, [{ strokeDashoffset: 32 }, { strokeDashoffset: 0 }], 250, 'ease-out')
  // Explicit two rebounds: the upstream class has no supplied stylesheet. The
  // shared spring controls the thumb; this leg retains the catalog's two bounces.
  if (props.variant === 't-bounce' && thumb.value) {
    const end = value ? root.value!.clientWidth - thumb.value.offsetWidth - 8 : 0
    const start = value ? 0 : root.value!.clientWidth - thumb.value.offsetWidth - 8
    const delta = end - start
    animate(thumb.value, [
      { transform: `translateX(${start}px)` },
      { transform: `translateX(${end + delta * .14}px)`, offset: .45 },
      { transform: `translateX(${end - delta * .08}px)`, offset: .68 },
      { transform: `translateX(${end + delta * .025}px)`, offset: .84 },
      { transform: `translateX(${end}px)` },
    ], props.transition ? transition.value.duration : 520, 'linear')
  }
}
function commit(value: MotionToggleValue) {
  if (props.disabled || value === props.modelValue) return
  const count = hasCount.value ? props.count! + (value === true ? 1 : -1) : undefined
  if (count !== undefined) emit('update:count', count)
  emit('update:modelValue', value)
  emit('change', value)
  emit('activate', { value, previous: props.modelValue, variant: props.variant, count })
  if (props.haptic !== false) emit('haptic', haptics.trigger(props.haptic))
}
function toggle() { commit(!on.value) }
function tabKey(event: KeyboardEvent, index: number) {
  if (props.disabled) return
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const available = props.options.map((option, i) => option.disabled ? -1 : i).filter(i => i >= 0)
  if (!available.length) return
  const current = available.indexOf(index)
  const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available[available.length - 1] : available[(current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length]
  if (next === undefined) return
  commit(props.options[next]!.value)
  tabButtons.value[next]?.focus()
}
function syncIndicator() {
  const button = tabButtons.value[selected.value]
  indicator.value = button ? { opacity: 1, width: `${button.offsetWidth}px`, height: `${button.offsetHeight}px`, transform: `translate(${button.offsetLeft}px, ${button.offsetTop}px)` } : { opacity: 0 }
}
watch(() => [props.modelValue, props.variant] as const, async (value, old) => {
  if (old && value[1] !== old[1]) stopAnimations()
  const previousColor = root.value && activity.active.value ? getComputedStyle(root.value).backgroundColor : undefined
  await nextTick()
  syncIndicator()
  if (old && value[0] !== old[0] && typeof value[0] === 'boolean') {
    feedback(value[0])
    if (previousColor && root.value) animate(root.value, [{ backgroundColor: previousColor }, { backgroundColor: getComputedStyle(root.value).backgroundColor }], props.variant === 't-solid' ? 200 : 300, 'ease-out')
  }
}, { flush: 'pre' })
watch(() => props.options, async () => { await nextTick(); syncIndicator() }, { deep: true })
useMotionResources(() => !!root.value && props.variant === 't-pill', () => {
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncIndicator)
  observer?.observe(root.value!)
  for (const button of tabButtons.value) observer?.observe(button)
  syncIndicator()
  window.addEventListener('resize', syncIndicator, { passive: true })
  return () => { observer?.disconnect(); window.removeEventListener('resize', syncIndicator) }
}, () => [props.options, props.size])
useMotionResources(() => activity.active.value, () => stopAnimations)
</script>

<template>
  <div v-if="variant === 't-pill'" ref="root" class="tx-motion-toggle tx-motion-toggle--t-pill" :class="[`tx-motion-toggle--${size}`, { 'is-active': activity.active.value }]" :style="style" role="tablist" :aria-label="label">
    <span aria-hidden="true" class="tx-motion-toggle__indicator" :style="indicator" />
    <button v-for="(option, index) in options" :key="option.value" :ref="el => { if (el) tabButtons[index] = el as HTMLButtonElement }" type="button" role="tab" class="tx-motion-toggle__tab" :disabled="disabled || option.disabled" :aria-selected="option.value === modelValue" :aria-controls="option.panelId" :tabindex="index === focusIndex ? 0 : -1" @click="commit(option.value)" @keydown="tabKey($event, index)">
<slot name="option" :option="option" :index="index" :active="option.value === modelValue">
{{ option.label }}
</slot>
</button>
  </div>
  <button v-else ref="root" type="button" class="tx-motion-toggle" :class="[`tx-motion-toggle--${variant}`, `tx-motion-toggle--${size}`, { 'is-on': on, 'is-action': isAction, 'is-active': activity.active.value }]" :style="style" :role="isAction ? undefined : 'switch'" :aria-checked="isAction ? undefined : on" :aria-pressed="isAction ? on : undefined" :aria-label="label" :disabled="disabled" @click="toggle">
    <span v-if="!isAction" ref="thumb" class="tx-motion-toggle__thumb">
      <IconSwap v-if="variant === 't-morph' || variant === 't-theme'" :state-key="on" :enabled="enabled">
        <slot name="icon" :active="on">
          <svg v-if="variant === 't-morph'" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path :d="on ? 'M9 10V6a4 4 0 0 1 8 0' : 'M8 10V6a4 4 0 0 1 8 0v4'" /></svg>
          <svg v-else-if="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19" /></svg>
        </slot>
      </IconSwap>
      <svg v-else-if="variant === 't-check'" class="tx-motion-toggle__check" :class="{ 'is-drawn': on }" viewBox="0 0 24 24" aria-hidden="true"><path ref="check" d="M20 6L9 17l-5-5" pathLength="32" /></svg>
      <slot v-else name="thumb" :active="on" />
    </span>
    <span v-else ref="icon" class="tx-motion-toggle__icon">
      <slot name="icon" :active="on">
        <svg v-if="variant === 't-bookmark'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z" /></svg>
        <svg v-else-if="variant === 't-like'" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
        <svg v-else-if="variant === 't-dislike'" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7a2 2 0 0 0-2 1.6L3 12a2 2 0 0 0 2 2h5v5a2 2 0 0 0 4 1l3-6V3Zm0 0h4v11h-4" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3" /></svg>
      </slot>
      <span v-if="variant === 't-like'" aria-hidden="true" class="tx-motion-toggle__particles"><i v-for="index in 8" :key="index" class="tx-motion-toggle__particle" :data-angle="index * 45" /></span>
    </span>
    <span v-if="isAction" class="tx-motion-toggle__label"><slot :active="on" :count="count">{{ hasCount ? count : on ? (onLabel ?? label) : (offLabel ?? label) }}</slot></span>
  </button>
</template>

<style scoped>
.tx-motion-toggle { --tx-mt-height: 32px; --tx-mt-width: 56px; position: relative; display: inline-flex; align-items: center; justify-content: flex-start; box-sizing: border-box; width: var(--tx-mt-width); height: var(--tx-mt-height); padding: 4px; appearance: none; border: 0; border-radius: 999px; background: var(--tx-fill-color); color: var(--tx-text-color-primary); box-shadow: inset 0 0 0 1px var(--tx-border-color); cursor: pointer; font: inherit; font-size: 13px; vertical-align: middle; }
.tx-motion-toggle--xs { --tx-mt-height: 24px; --tx-mt-width: 40px; font-size: 12px; }
.tx-motion-toggle--sm { --tx-mt-height: 28px; --tx-mt-width: 48px; }
.tx-motion-toggle--lg { --tx-mt-height: 36px; --tx-mt-width: 64px; font-size: 14px; }
.tx-motion-toggle.is-on { background: var(--tx-color-primary-light-9); box-shadow: inset 0 0 0 1px var(--tx-color-primary); }
.tx-motion-toggle__thumb { position: relative; display: inline-flex; align-items: center; justify-content: center; width: calc(var(--tx-mt-height) - 8px); height: calc(var(--tx-mt-height) - 8px); border-radius: 50%; background: var(--tx-bg-color); color: var(--tx-text-color-primary); box-shadow: 0 1px 3px var(--tx-box-shadow-color, rgb(0 0 0 / .12)); transform: translateX(0); transition: transform var(--tx-mt-duration) var(--tx-mt-ease); }
.tx-motion-toggle.is-on .tx-motion-toggle__thumb { transform: translateX(calc(var(--tx-mt-width) - var(--tx-mt-height))); }
.tx-motion-toggle--t-solid { background: var(--tx-fill-color-dark); }
.tx-motion-toggle--t-solid.is-on { background: var(--tx-text-color-primary); }
.tx-motion-toggle--t-solid.is-on .tx-motion-toggle__thumb { background: var(--tx-bg-color); }
.tx-motion-toggle--t-rect { border-radius: 6px; }
.tx-motion-toggle--t-rect .tx-motion-toggle__thumb { border-radius: 3px; }
.tx-motion-toggle--md:is(.tx-motion-toggle--t-circle, .tx-motion-toggle--t-morph, .tx-motion-toggle--t-check, .tx-motion-toggle--t-theme, .tx-motion-toggle--classic-toggle) { --tx-mt-height: 36px; --tx-mt-width: 64px; }
.tx-motion-toggle--t-morph.is-on .tx-motion-toggle__thumb { transform: translateX(calc(var(--tx-mt-width) - var(--tx-mt-height))) rotate(180deg); }
.tx-motion-toggle--t-theme .tx-motion-toggle__thumb { background: var(--tx-color-warning-light-9); }
.tx-motion-toggle--t-theme.is-on .tx-motion-toggle__thumb { transform: translateX(calc(var(--tx-mt-width) - var(--tx-mt-height))) rotate(360deg); background: var(--tx-color-primary-light-9); }
.tx-motion-toggle svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tx-motion-toggle__check { opacity: 0; transform: scale(.25); transition: opacity 250ms, transform 250ms; }
.tx-motion-toggle__check.is-drawn { opacity: 1; transform: scale(1); }
.tx-motion-toggle__check path { stroke-width: 3.5; stroke-dasharray: 32; stroke-dashoffset: 0; }
.tx-motion-toggle.is-action { width: auto; padding: 0 12px; gap: 8px; border-radius: 12px; }
.tx-motion-toggle__icon { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.tx-motion-toggle.is-action.is-on svg { fill: color-mix(in srgb, var(--tx-color-primary) 25%, transparent); }
.tx-motion-toggle--t-like.is-on { background: var(--tx-color-danger-light-9); box-shadow: inset 0 0 0 1px var(--tx-color-danger); }
.tx-motion-toggle--t-like.is-on svg { fill: var(--tx-color-danger); }
.tx-motion-toggle--t-dislike.is-on { background: var(--tx-color-warning-light-9); box-shadow: inset 0 0 0 1px var(--tx-color-warning); }
.tx-motion-toggle--t-repost .tx-motion-toggle__icon { transition: transform 300ms var(--tx-mt-ease); }
.tx-motion-toggle--t-repost.is-on .tx-motion-toggle__icon { transform: rotate(180deg); }
.tx-motion-toggle__particles { position: absolute; left: 50%; top: 50%; pointer-events: none; }
.tx-motion-toggle__particle { position: absolute; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: var(--tx-color-danger); opacity: 0; }
.tx-motion-toggle--t-pill { width: auto; gap: 2px; background: var(--tx-fill-color-light); }
.tx-motion-toggle__indicator { position: absolute; left: 0; top: 0; background: var(--tx-bg-color); border-radius: 999px; box-shadow: inset 0 0 0 1px var(--tx-border-color); transition: transform var(--tx-mt-duration) var(--tx-mt-ease), width var(--tx-mt-duration) var(--tx-mt-ease); }
.tx-motion-toggle__tab { position: relative; z-index: 1; appearance: none; border: 0; border-radius: 999px; background: transparent; color: var(--tx-text-color-regular); padding: 3px 12px; font: inherit; cursor: pointer; white-space: nowrap; }
.tx-motion-toggle__tab[aria-selected='true'] { color: var(--tx-text-color-primary); font-weight: 500; }
.tx-motion-toggle:disabled, .tx-motion-toggle__tab:disabled { opacity: .5; cursor: not-allowed; }
.tx-motion-toggle:focus-visible, .tx-motion-toggle__tab:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.tx-motion-toggle:not(.is-active) * { transition: none; }
@media (prefers-reduced-motion: reduce) { .tx-motion-toggle * { transition: none; } }
</style>
