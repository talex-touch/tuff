<script setup lang="ts">
// Adapted from Amicro AnimatedButton.tsx and cards/FocusBlur.tsx (43c29ce).
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionButtonEmits, MotionButtonItem, MotionButtonProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition, springSteps } from '../../liquid/src/spring'
import { TxTextMorph } from '../../text-morph'
import { MOTION_BUTTON_PRESETS } from './catalog'
import MotionButtonGlyph from './MotionButtonGlyph.vue'

defineOptions({ name: 'TxMotionButton', inheritAttrs: false })
const props = withDefaults(defineProps<MotionButtonProps>(), {
  label: '', size: 'md', disabled: false, animated: true, type: 'button',
  iconOnly: false, magneticStrength: 0.35, items: () => [],
  blurAmount: 4, opacityAmount: 0.4, showBrackets: true,
})
const emit = defineEmits<MotionButtonEmits>()
const root = ref<HTMLElement | null>(null)
const { active: motionActive } = useMotionActivity(root, () => props.animated && !props.disabled)
const preset = computed(() => props.sourceId ? MOTION_BUTTON_PRESETS[props.sourceId] : undefined)
const variant = computed(() => props.variant ?? preset.value?.variant ?? 'morph')
const icon = computed(() => props.icon ?? preset.value?.icon)
const activeIcon = computed(() => props.activeIcon ?? preset.value?.activeIcon ?? icon.value)
const hovered = ref(false)
const focused = ref(false)
const pressed = ref(false)
const linger = ref(false)
const replaying = ref(false)
const replayPhase = ref(false)
const replayReset = ref(false)
const replayIndex = ref<number | null>(null)
const morphPhase = ref<'a' | 'b'>()
const interacting = computed(() => !props.disabled && !replayReset.value && (hovered.value || focused.value || pressed.value || replaying.value))
const iconActive = computed(() => !props.disabled && !replayReset.value && (interacting.value || linger.value || props.selected === true))
const displayLabel = computed(() => props.selected && props.activeLabel !== undefined ? props.activeLabel : props.label)
const firstColor = computed(() => props.iconColor ?? preset.value?.iconColor ?? 'currentColor')
const secondColor = computed(() => props.activeIconColor ?? preset.value?.activeIconColor ?? firstColor.value)
const fillActive = computed(() => props.activeFill ?? preset.value?.activeFill ?? false)
const holdDuration = computed(() => Math.max(0, props.holdDuration ?? preset.value?.holdDuration ?? 0))
const spring = computed(() => props.spring ?? (variant.value === 'rotate' || variant.value === 'text-reveal'
  ? { stiffness: 400, damping: 25 }
  : variant.value === 'expand-ring' ? { stiffness: 400, damping: 20 }
    : variant.value === 'focus-blur' ? { stiffness: 350, damping: 20 } : { stiffness: 600, damping: 25 }))
const timing = computed(() => resolveTransition(spring.value, !motionActive.value))
const layoutTiming = computed(() => resolveTransition(props.spring ?? { stiffness: 500, damping: 25 }, !motionActive.value))
const notificationTiming = computed(() => resolveTransition(props.spring ?? { stiffness: 600, damping: 15 }, !motionActive.value))
const glyphSpring = computed(() => typeof spring.value === 'object' && !('duration' in spring.value) ? spring.value : undefined)
const styles = computed(() => ({
  '--tx-motion-button-duration': `${timing.value.duration}ms`,
  '--tx-motion-button-ease': timing.value.easing,
  '--tx-motion-button-layout-duration': `${layoutTiming.value.duration}ms`,
  '--tx-motion-button-layout-ease': layoutTiming.value.easing,
  '--tx-motion-button-dot-duration': `${notificationTiming.value.duration}ms`,
  '--tx-motion-button-dot-ease': notificationTiming.value.easing,
  '--tx-motion-button-hover-bg': props.hoverBackground ?? 'var(--tx-fill-color)',
  '--tx-motion-button-icon-color': iconActive.value ? secondColor.value : 'currentColor',
  '--tx-motion-button-blur': `${Math.max(0, props.blurAmount)}px`,
  '--tx-motion-button-dim': Math.min(1, Math.max(0, props.opacityAmount)),
}))

let holdTimer: ReturnType<typeof setTimeout> | undefined
let replayTimer: ReturnType<typeof setTimeout> | undefined
let replayFrame: number | undefined
let frame: number | undefined
let lastTime: number | undefined
let center: { x: number, y: number } | undefined
let x = 0
let y = 0
let vx = 0
let vy = 0
let targetX = 0
let targetY = 0

function clearHold(): void {
  if (holdTimer !== undefined) clearTimeout(holdTimer)
  holdTimer = undefined
  linger.value = false
}
function retainIcon(duration = holdDuration.value): void {
  clearHold()
  if (!motionActive.value || duration <= 0 || props.disabled) return
  linger.value = true
  holdTimer = setTimeout(() => {
    holdTimer = undefined
    linger.value = false
  }, duration)
}
function cancelReplay(): void {
  if (replayTimer !== undefined) clearTimeout(replayTimer)
  if (replayFrame !== undefined) cancelAnimationFrame(replayFrame)
  replayFrame = undefined
  replayTimer = undefined
  replaying.value = false
  replayReset.value = false
  replayIndex.value = null
}
function stopMagnet(): void {
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  lastTime = undefined
  center = undefined
  x = y = vx = vy = targetX = targetY = 0
  if (root.value) root.value.style.translate = '0px 0px'
}
function tick(now: number): void {
  frame = undefined
  if (!motionActive.value || variant.value !== 'magnetic') {
    stopMagnet()
    return
  }
  const dt = Math.min(0.1, lastTime === undefined ? 1 / 60 : Math.max(0, (now - lastTime) / 1000))
  lastTime = now
  const physics = props.magneticSpring ?? { stiffness: 500, damping: 25 }
  ;[x, vx] = springSteps(x, vx, targetX, physics, dt)
  ;[y, vy] = springSteps(y, vy, targetY, physics, dt)
  const settled = Math.abs(x - targetX) + Math.abs(y - targetY) + Math.abs(vx) + Math.abs(vy) < 0.02
  if (settled) {
    x = targetX
    y = targetY
    vx = vy = 0
  }
  if (root.value) root.value.style.translate = `${x}px ${y}px`
  if (!settled) frame = requestAnimationFrame(tick)
  else lastTime = undefined
}
function moveMagnet(nextX: number, nextY: number): void {
  targetX = nextX
  targetY = nextY
  if (motionActive.value && frame === undefined) frame = requestAnimationFrame(tick)
}
function enter(event: PointerEvent): void {
  if (props.disabled || event.pointerType === 'touch') return
  clearHold()
  hovered.value = true
  if (variant.value === 'magnetic' && root.value) {
    // Read once at entry, never from a moving frame. Subtract the previous pull
    // so re-entry during the return spring cannot move the magnetic origin.
    const rect = root.value.getBoundingClientRect()
    center = { x: rect.left + rect.width / 2 - x, y: rect.top + rect.height / 2 - y }
  }
}
function move(event: PointerEvent): void {
  if (props.disabled || !motionActive.value || variant.value !== 'magnetic' || !center || event.pointerType === 'touch') return
  const dx = event.clientX - center.x
  const dy = event.clientY - center.y
  const withinRange = props.magneticRange === undefined || Math.hypot(dx, dy) < Math.max(0, props.magneticRange)
  moveMagnet(withinRange ? dx * props.magneticStrength : 0, withinRange ? dy * props.magneticStrength : 0)
}
function leave(): void {
  hovered.value = false
  retainIcon()
  if (variant.value === 'magnetic') moveMagnet(0, 0)
}
function focusIn(): void {
  if (props.disabled) return
  clearHold()
  focused.value = true
}
function focusOut(): void {
  focused.value = false
  pressed.value = false
  retainIcon()
}
function pointerDown(event: PointerEvent): void {
  if (!props.disabled && event.button === 0) pressed.value = true
}
function pointerUp(event: PointerEvent): void {
  pressed.value = false
  if (event.pointerType === 'touch') retainIcon(Math.max(500, holdDuration.value))
}
function keyDown(event: KeyboardEvent): void {
  if (!props.disabled && (event.key === 'Enter' || (!props.href && event.key === ' '))) pressed.value = true
}
function keyUp(): void { pressed.value = false }
function guardDisabled(event: MouseEvent): boolean {
  if (!props.disabled) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}
function handleClick(event: MouseEvent): void {
  if (!guardDisabled(event)) emit('click', event)
}
function replay(): void {
  if (props.disabled || !motionActive.value) return
  cancelReplay()
  clearHold()
  replayPhase.value = !replayPhase.value
  replayReset.value = true
  // Paint a resting pose before re-entering the same trajectory. Both pending
  // frames belong to cancelReplay, including suspension between the two frames.
  replayFrame = requestAnimationFrame(() => {
    replayFrame = requestAnimationFrame(() => {
      replayFrame = undefined
      if (!motionActive.value || props.disabled) return
      replayReset.value = false
      replaying.value = true
      if (variant.value === 'focus-blur') {
        const index = props.items.findIndex(item => !item.disabled)
        replayIndex.value = index < 0 ? null : index
      }
      if (variant.value === 'magnetic' && root.value) {
        const rect = root.value.getBoundingClientRect()
        const reach = props.magneticRange === undefined ? Infinity : Math.max(0, props.magneticRange / 2)
        moveMagnet(Math.min(rect.width / 4, reach) * props.magneticStrength, Math.min(rect.height / 4, reach) * props.magneticStrength)
      }
      replayTimer = setTimeout(() => {
        replayTimer = undefined
        replaying.value = false
        replayIndex.value = null
        if (variant.value === 'magnetic') moveMagnet(0, 0)
      }, Math.max(600, timing.value.duration))
    })
  })
}

const pointerIndex = ref<number | null>(null)
const focusIndex = ref<number | null>(null)
const focusedItem = computed(() => props.disabled || replayReset.value ? null : pointerIndex.value ?? focusIndex.value ?? replayIndex.value)
function enterItem(index: number, item: MotionButtonItem): void {
  if (!props.disabled && !item.disabled) pointerIndex.value = index
}
function focusItem(index: number, item: MotionButtonItem): void {
  if (!props.disabled && !item.disabled) {
    focusIndex.value = index
    pointerIndex.value = null
  }
}
function selectItem(event: MouseEvent, item: MotionButtonItem, index: number): void {
  if (props.disabled || item.disabled) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('select', item, index, event)
}
function resetMotion(): void {
  clearHold()
  cancelReplay()
  stopMagnet()
  hovered.value = focused.value = pressed.value = false
  pointerIndex.value = focusIndex.value = null
}
watch(motionActive, (active) => { if (!active) resetMotion() })
watch(() => [props.sourceId, props.variant, props.disabled, props.href], resetMotion)
watch(iconActive, () => {
  if (motionActive.value && (variant.value === 'morph' || variant.value === 'color-morph'))
    morphPhase.value = morphPhase.value === 'a' ? 'b' : 'a'
})
onBeforeUnmount(resetMotion)
defineExpose({ replay, focus: () => {
  if (variant.value === 'focus-blur') root.value?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
  else root.value?.focus()
} })
</script>

<template>
  <span
    v-if="variant === 'focus-blur'"
    ref="root"
    v-bind="$attrs"
    class="tx-motion-button tx-motion-button--focus-blur"
    :class="[`tx-motion-button--${size}`, { 'is-animated': motionActive, 'is-disabled': disabled }]"
    :style="styles"
    role="group"
    :aria-label="ariaLabel || label || undefined"
    :data-source-id="sourceId"
    :data-variant="variant"
  >
    <component
      :is="item.href ? 'a' : 'button'"
      v-for="(item, index) in items"
      :key="`${index}:${item.href ?? ''}`"
      class="tx-motion-button__item"
      :class="{ 'is-focused': focusedItem === index, 'is-inactive': focusedItem !== null && focusedItem !== index, 'is-disabled': disabled || item.disabled }"
      :href="disabled || item.disabled ? undefined : item.href"
      :target="item.target"
      :rel="item.rel ?? (item.target === '_blank' ? 'noopener noreferrer' : undefined)"
      :type="item.href ? undefined : 'button'"
      :disabled="item.href ? undefined : disabled || item.disabled"
      :aria-disabled="disabled || item.disabled ? 'true' : undefined"
      :role="item.href && (disabled || item.disabled) ? 'link' : undefined"
      :tabindex="disabled || item.disabled ? -1 : undefined"
      @pointerenter="enterItem(index, item)"
      @pointerleave="pointerIndex = null"
      @focus="focusItem(index, item)"
      @blur="focusIndex = null"
      @click="selectItem($event, item, index)"
      @auxclick="(disabled || item.disabled) && $event.preventDefault()"
    >
      <span class="tx-motion-button__item-label"><slot name="item" :item="item" :index="index" :active="focusedItem === index">{{ item.label }}</slot></span>
      <span v-if="showBrackets" class="tx-motion-button__brackets" aria-hidden="true" />
    </component>
    <slot v-if="items.length === 0" :active="false" :selected="selected === true" :disabled="disabled">{{ label }}</slot>
  </span>
  <component
    :is="href ? 'a' : 'button'"
    v-else
    ref="root"
    v-bind="$attrs"
    class="tx-motion-button"
    :class="[`tx-motion-button--${size}`, `tx-motion-button--${variant}`, replayPhase ? 'is-phase-b' : 'is-phase-a', { 'is-interacting': interacting, 'is-icon-active': iconActive, 'is-pressed': pressed, 'is-disabled': disabled, 'is-animated': motionActive, 'is-icon-only': iconOnly }]"
    :style="styles"
    :href="disabled ? undefined : href"
    :target="target"
    :rel="rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)"
    :type="href ? undefined : type"
    :disabled="href ? undefined : disabled"
    :role="href && disabled ? 'link' : undefined"
    :tabindex="disabled ? -1 : $attrs.tabindex"
    :aria-label="ariaLabel || (iconOnly ? displayLabel : undefined)"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-pressed="!href && selected !== undefined ? selected : undefined"
    :data-source-id="sourceId"
    :data-variant="variant"
    @pointerenter="enter"
    @pointermove="move"
    @pointerleave="leave(); pressed = false"
    @pointerdown="pointerDown"
    @pointerup="pointerUp"
    @pointercancel="pressed = false; clearHold()"
    @focus="focusIn"
    @blur="focusOut"
    @keydown="keyDown"
    @keyup="keyUp"
    @click="handleClick"
    @auxclick="guardDisabled"
  >
    <span class="tx-motion-button__content">
      <span v-if="icon || $slots.icon" class="tx-motion-button__leading" aria-hidden="true">
        <span v-if="variant === 'morph' || variant === 'color-morph'" class="tx-motion-button__glyph tx-motion-button__morph" :class="morphPhase ? `is-morph-${morphPhase}` : undefined" :style="{ color: iconActive ? secondColor : 'currentColor' }">
          <template v-if="$slots['active-icon']">
            <span class="tx-motion-button__glyph tx-motion-button__glyph--first"><slot name="icon" :active="false" :selected="selected === true"><MotionButtonGlyph :icon="icon" :animated="motionActive" :spring="glyphSpring" /></slot></span>
            <span class="tx-motion-button__glyph tx-motion-button__glyph--second"><slot name="active-icon" :active="true" :selected="selected === true" /></span>
          </template>
          <slot v-else name="icon" :active="iconActive" :selected="selected === true">
            <MotionButtonGlyph :icon="iconActive ? activeIcon : icon" :animated="motionActive" :filled="iconActive && fillActive" :spring="glyphSpring" />
          </slot>
        </span>
        <template v-else>
          <span class="tx-motion-button__glyph tx-motion-button__glyph--first" :style="{ color: interacting && (variant === 'pulse' || variant === 'shake') ? firstColor : 'currentColor' }">
            <slot name="icon" :active="false" :selected="selected === true">
              <MotionButtonGlyph :icon="icon" :animated="motionActive" :filled="interacting && fillActive" :spring="glyphSpring" />
            </slot>
          </span>
          <span v-if="variant === 'sparkle' || variant === 'ring'" class="tx-motion-button__glyph tx-motion-button__glyph--second" :style="{ color: secondColor }">
            <slot name="active-icon" :active="true" :selected="selected === true">
              <MotionButtonGlyph :icon="activeIcon" :animated="motionActive" :spring="glyphSpring" />
            </slot>
            <template v-if="variant === 'sparkle'">
              <svg class="tx-motion-button__spark tx-motion-button__spark--one" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z" /></svg>
              <svg class="tx-motion-button__spark tx-motion-button__spark--two" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z" /></svg>
            </template>
            <span v-if="variant === 'ring'" class="tx-motion-button__notification" />
          </span>
        </template>
      </span>
      <span v-if="!iconOnly" class="tx-motion-button__label" :class="{ 'tx-motion-button__label--reveal': variant === 'text-reveal' }">
        <span v-if="variant === 'text-reveal'" class="tx-motion-button__label-track">
          <span><slot :active="iconActive" :selected="selected === true" :disabled="disabled"><TxTextMorph :key="motionActive ? 'animated' : 'static'" :text="displayLabel" :disabled="!motionActive" /></slot></span>
          <span aria-hidden="true"><slot name="reveal" :active="iconActive"><TxTextMorph :key="motionActive ? 'animated' : 'static'" :text="displayLabel" :disabled="!motionActive" /></slot></span>
        </span>
        <slot v-else :active="iconActive" :selected="selected === true" :disabled="disabled"><TxTextMorph :key="motionActive ? 'animated' : 'static'" :text="displayLabel" :disabled="!motionActive" /></slot>
      </span>
      <span v-if="variant === 'slide-arrow'" class="tx-motion-button__trailing" aria-hidden="true">
        <span class="tx-motion-button__glyph" :style="{ color: secondColor }"><slot name="active-icon" :active="true"><MotionButtonGlyph :icon="activeIcon" :animated="motionActive" :spring="glyphSpring" /></slot></span>
      </span>
    </span>
    <span v-if="variant === 'glare'" class="tx-motion-button__glare" aria-hidden="true" />
    <span v-if="variant === 'expand-ring'" class="tx-motion-button__expansion" aria-hidden="true" />
  </component>
</template>

<style lang="scss">
.tx-motion-button--morph, .tx-motion-button--color-morph {
  .tx-motion-button__morph > .tx-motion-button__glyph--second { transform: scale(0.5); }
  &.is-icon-active .tx-motion-button__morph > .tx-motion-button__glyph--first { opacity: 0; transform: scale(0.5); }
  &.is-icon-active .tx-motion-button__morph > .tx-motion-button__glyph--second { opacity: 1; transform: scale(1); }
}
.tx-motion-button {
  --tx-motion-button-height: 36px;
  --tx-motion-button-pad: 24px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--tx-motion-button-height);
  padding: 0 var(--tx-motion-button-pad);
  border: 0;
  border-radius: 40px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  &--xs { --tx-motion-button-height: 24px; --tx-motion-button-pad: 12px; }
  &--sm { --tx-motion-button-height: 30px; --tx-motion-button-pad: 16px; }
  &--lg { --tx-motion-button-height: 42px; --tx-motion-button-pad: 28px; font-size: 14px; }
  &.is-interacting { background: var(--tx-motion-button-hover-bg); padding-inline: calc(var(--tx-motion-button-pad) + 4px); scale: 1.02; }
  &.is-pressed { scale: 0.96; }
  &:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
  &.is-disabled { color: var(--tx-text-color-disabled); cursor: not-allowed; opacity: 0.6; }
  &.is-icon-only { width: var(--tx-motion-button-height); padding: 0; }
  &__content { position: relative; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  &__leading, &__trailing { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 16px; height: 16px; }
  &__leading { margin-inline-end: 10px; }
  &.is-icon-only &__leading { margin: 0; }
  &__glyph { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; transform-origin: center; }
  &__glyph--second { position: absolute; inset: 0; opacity: 0; }
  &__label { white-space: nowrap; }
  &--slide-arrow &__leading { overflow: hidden; }
  &--slide-arrow &__trailing { width: 0; margin-inline-start: 0; opacity: 0; transform: translateX(10px); }
  &--slide-arrow.is-icon-active &__leading { width: 0; margin-inline-end: 0; opacity: 0; transform: translateX(-10px); }
  &--slide-arrow.is-icon-active &__trailing { width: 16px; margin-inline-start: 10px; opacity: 1; transform: translateX(0); }
  &--slide-arrow.is-icon-only &__leading, &--slide-arrow.is-icon-only &__trailing { margin: 0; }
  &--sparkle &__glyph--second { transform: translateY(15px) scale(0.8); }
  &--sparkle.is-icon-active &__glyph--first { opacity: 0; transform: translateY(-15px) scale(0.8); }
  &--sparkle.is-icon-active &__glyph--second { opacity: 1; transform: translateY(0) scale(1); }
  &__spark { position: absolute; fill: var(--tx-color-warning); opacity: 0; }
  &__spark--one { top: -12px; right: -8px; width: 10px; height: 10px; transform: translateY(10px) rotate(-45deg) scale(0); }
  &__spark--two { top: -4px; left: -12px; width: 6px; height: 6px; transform: translateX(10px) rotate(45deg) scale(0); }
  &.is-icon-active &__spark { opacity: 1; transform: translate(0) rotate(0) scale(1); }
  &--rotate.is-interacting &__glyph, &--text-reveal.is-interacting &__glyph { transform: rotate(180deg); }
  &--text-reveal.is-interacting &__glyph { transform: rotate(45deg); }
  &--shake.is-interacting &__label { color: var(--tx-motion-button-icon-color); }
  &--ring &__glyph--second { transform: rotate(-15deg) scale(0.8); }
  &--ring.is-icon-active &__glyph--first { opacity: 0; transform: rotate(15deg) scale(0.8); }
  &--ring.is-icon-active &__glyph--second { opacity: 1; transform: rotate(0) scale(1); }
  &__notification { position: absolute; top: 0; right: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--tx-color-danger); transform: scale(0); }
  &.is-icon-active &__notification { transform: scale(1); }
  &--glare { overflow: hidden; }
  &__glare { position: absolute; inset-block: 0; left: 50%; width: 50px; pointer-events: none; opacity: 0; transform: translateX(-150%) skewX(-20deg); background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--tx-text-color-primary) 18%, transparent), transparent); }
  &__label--reveal { height: 18px; overflow: hidden; }
  &__label-track { display: flex; flex-direction: column; transform: translateY(0); > span { display: block; height: 18px; line-height: 18px; } }
  &--text-reveal.is-interacting &__label-track { transform: translateY(-18px); }
  &--expand-ring.is-interacting &__glyph { transform: scale(1.1); }
  &__expansion { position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-text-color-primary) 25%, transparent); opacity: 0; pointer-events: none; }
  &--focus-blur { flex-wrap: wrap; gap: 24px; padding: 6px 8px; min-height: 0; border-radius: 0; background: none; cursor: default; }
  &__item { position: relative; display: inline-flex; padding: 4px 8px; border: 0; background: none; font: inherit; color: inherit; text-decoration: none; cursor: pointer; outline-offset: 4px; }
  &__item.is-focused { color: var(--tx-color-primary); }
  &__item.is-inactive { filter: blur(var(--tx-motion-button-blur)); opacity: var(--tx-motion-button-dim); }
  &__item.is-disabled { color: var(--tx-text-color-disabled); cursor: not-allowed; }
  &__item:focus-visible { outline: 2px solid var(--tx-color-primary); }
  &__item-label { position: relative; z-index: 1; }
  &__brackets { position: absolute; inset: -4px -8px; border: 2px dashed var(--tx-border-color); border-radius: 8px; opacity: 0; transform: scale(1.3); pointer-events: none; }
  &__item.is-focused &__brackets { opacity: 1; transform: scale(1.1); }
  &.is-animated { transition: padding-inline var(--tx-motion-button-layout-duration) var(--tx-motion-button-layout-ease), scale var(--tx-motion-button-layout-duration) var(--tx-motion-button-layout-ease); }
  &.is-animated &__leading, &.is-animated &__trailing { transition: width var(--tx-motion-button-duration) var(--tx-motion-button-ease), margin var(--tx-motion-button-duration) var(--tx-motion-button-ease), opacity var(--tx-motion-button-duration) var(--tx-motion-button-ease), transform var(--tx-motion-button-duration) var(--tx-motion-button-ease); }
  &.is-animated &__glyph, &.is-animated &__spark, &.is-animated &__notification, &.is-animated &__label-track, &.is-animated &__brackets { transition: transform var(--tx-motion-button-duration) var(--tx-motion-button-ease), opacity var(--tx-motion-button-duration) var(--tx-motion-button-ease); }
  &.is-animated &__notification { transition-duration: var(--tx-motion-button-dot-duration); transition-timing-function: var(--tx-motion-button-dot-ease); }
  &.is-animated &__spark--one { transition-delay: 50ms; }
  &.is-animated &__spark--two, &.is-animated &__notification { transition-delay: 100ms; }
  &.is-animated &__item { transition: opacity 300ms, filter 300ms; }
}
@media (prefers-reduced-motion: no-preference) {
  @each $phase in (a, b) {
    @keyframes tx-motion-button-pulse-#{$phase} { 0%, 100% { scale: 1; } 50% { scale: 1.25; } }
    @keyframes tx-motion-button-shake-#{$phase} { 0%, 100% { translate: 0 0; rotate: 0deg; } 25%, 75% { translate: 0 -2px; rotate: -10deg; } 50% { translate: 0 0; rotate: 10deg; } }
    @keyframes tx-motion-button-expand-#{$phase} { from { scale: 1; opacity: 1; } to { scale: 1.15; opacity: 0; } }
    @keyframes tx-motion-button-morph-#{$phase} { from { scale: 0.5; opacity: 0; } to { scale: 1; opacity: 1; } }
    .tx-motion-button.is-animated .tx-motion-button__morph.is-morph-#{$phase} { animation: tx-motion-button-morph-#{$phase} var(--tx-motion-button-duration) var(--tx-motion-button-ease); }
    .tx-motion-button--pulse.is-animated.is-interacting.is-phase-#{$phase} .tx-motion-button__glyph { animation: tx-motion-button-pulse-#{$phase} 400ms ease-in-out; }
    .tx-motion-button--shake.is-animated.is-interacting.is-phase-#{$phase} .tx-motion-button__glyph { animation: tx-motion-button-shake-#{$phase} 400ms ease; }
    .tx-motion-button--expand-ring.is-animated.is-interacting.is-phase-#{$phase} .tx-motion-button__expansion { animation: tx-motion-button-expand-#{$phase} 600ms ease-out; }
  }
  @keyframes tx-motion-button-glare { 0% { transform: translateX(-150%) skewX(-20deg); } 46%, 100% { transform: translateX(150%) skewX(-20deg); } }
  .tx-motion-button--glare.is-animated.is-interacting .tx-motion-button__glare { opacity: 1; animation: tx-motion-button-glare 1850ms ease-in-out infinite; }
}
@media (prefers-reduced-motion: reduce) {
  .tx-motion-button { &, & * { transition: none !important; animation: none !important; } &.is-interacting, &.is-pressed { scale: 1; } }
}
</style>
