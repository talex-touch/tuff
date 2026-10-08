<script setup lang="ts">
// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { MotionTextEmits, MotionTextExpose, MotionTextItem, MotionTextProps, MotionTextSlots } from './types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { segmentWords } from '../../stream-text/src/segment'
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'
import { motionTextPreset } from './presets'

defineOptions({ name: 'TxMotionText' })
const props = withDefaults(defineProps<MotionTextProps>(), {
  text: '', variant: 'txt-dia', size: 'md', tag: 'span', locale: 'en', paused: false,
  initialBlur: 8, yOffset: 15, scrambleSpeed: 40, maxIterations: 10, sequential: false,
  revealDirection: 'start', useOriginalCharsOnly: true,
  characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+',
  firstText: '', secondText: '', mediaType: 'image', mediaAlt: '', mediaPoster: '',
  mediaWidth: 70, mediaHeight: 40, mediaAutoplay: true, mediaLoop: true,
  mediaMuted: true, mediaPlaysinline: true, items: () => [],
  blurAmount: 4, opacityAmount: 0.4, showBrackets: true,
})
const emit = defineEmits<MotionTextEmits>()
defineSlots<MotionTextSlots>()
const rootRef = ref<HTMLElement | null>(null)
const overlayRef = ref<HTMLElement | null>(null)
const caretRef = ref<HTMLElement | null>(null)
const mediaRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const auraNearRef = ref<HTMLElement | null>(null)
const auraFarRef = ref<HTMLElement | null>(null)
const { active } = useMotionActivity(rootRef, () => !props.paused)
const preset = computed(() => motionTextPreset(props.variant))
const trigger = computed(() => props.trigger ?? (['hover', 'scramble', 'media', 'focus'].includes(preset.value.mode) ? 'hover' : 'in-view'))
const decorated = ref(false)
const mediaOpen = ref(false)
const pointerInside = ref(false)
const focused = ref(false)
const hoveredItem = ref<string | null>(null)
const focusedItem = ref<string | null>(null)
const selectedItem = computed(() => hoveredItem.value ?? focusedItem.value)
const scrambledText = ref(props.text)
let generation = 0
let scrambleTimer: ReturnType<typeof setTimeout> | undefined
let finiteRunning = false
let effectVariant = props.variant
let morphRunning = false
let manualRequested = false
const animations = new Set<Animation>()
const hoverAnimations = new Map<HTMLElement, Animation>()
const brackets = new Map<string, HTMLElement>()
const bracketAnimations = new Map<string, Animation>()

/** Segmentation is decorative only: value diffing stays inside TxTextMorph. */
const graphemes = computed(() => {
  if (typeof Intl.Segmenter !== 'function')
    return props.text ? [props.text] : []
  return Array.from(new Intl.Segmenter(props.locale, { granularity: 'grapheme' }).segment(props.text), part => part.segment)
})
const units = computed(() => {
  switch (preset.value.granularity) {
    case 'word': return segmentWords(props.text, props.locale)
    case 'line': return props.text.split('\n').map(text => ({ text, ws: '' }))
    case 'grapheme': return graphemes.value.map(text => ({ text, ws: '' }))
    default: return [{ text: props.text, ws: '' }]
  }
})
const isGeneric = computed(() => preset.value.mode !== 'media' && preset.value.mode !== 'focus')
const isLoop = computed(() => ['continuous', 'shimmer', 'glow'].includes(preset.value.mode))
const isHover = computed(() => preset.value.mode === 'hover')
const keyboardInteractive = computed(() => isHover.value || preset.value.mode === 'scramble'
  || (preset.value.mode === 'media' && trigger.value === 'hover') || (isGeneric.value && trigger.value === 'hover'))
const rootStyle = computed<CSSProperties>(() => ({
  '--tx-motion-text-media-width': `${Math.max(0, props.mediaWidth)}px`,
  '--tx-motion-text-media-height': `${Math.max(0, props.mediaHeight)}px`,
}))
const mediaStyle = computed<CSSProperties>(() => ({
  width: mediaOpen.value ? `${Math.max(0, props.mediaWidth)}px` : '0px',
  opacity: mediaOpen.value ? 1 : 0,
  scale: mediaOpen.value ? '1' : '0.8',
  marginInline: mediaOpen.value ? '0.4em' : '0',
}))

function timing() {
  const source = preset.value
  return resolveTransition(props.transition ?? source.spring ?? {
    duration: Math.max(1, props.durationMs ?? source.durationMs),
    ease: source.easing ?? 'ease-in-out',
  }, !active.value)
}

function ownAnimation(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (!active.value || typeof element.animate !== 'function')
    return null
  const animation = element.animate(frames, options)
  animations.add(animation)
  return animation
}

function stopWork(announce = true): void {
  generation++
  if (scrambleTimer !== undefined)
    clearTimeout(scrambleTimer)
  scrambleTimer = undefined
  for (const animation of animations) {
    animation.onfinish = null
    animation.oncancel = null
    animation.cancel()
  }
  animations.clear()
  hoverAnimations.clear()
  bracketAnimations.clear()
  mediaRef.value?.querySelectorAll<HTMLVideoElement>('video').forEach(video => video.pause())
  decorated.value = false
  scrambledText.value = props.text
  if (finiteRunning && announce)
    emit('animation-cancel', effectVariant)
  finiteRunning = false
}

function completeEffect(token: number, keepDecoration = false): void {
  if (token !== generation)
    return
  finiteRunning = false
  if (!keepDecoration)
    stopWork(false)
  emit('animation-complete', effectVariant)
}

function runScramble(): void {
  stopWork()
  if (!active.value || !graphemes.value.length)
    return
  const original = graphemes.value
  const pool = props.useOriginalCharsOnly
    ? original.filter(char => !/^\s+$/u.test(char))
    : typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(props.locale, { granularity: 'grapheme' }).segment(props.characters), part => part.segment)
      : [props.characters].filter(Boolean)
  if (!pool.length)
    return
  const token = generation
  const count = original.length
  const center = Math.floor(count / 2)
  const total = props.sequential
    ? props.revealDirection === 'center' ? Math.ceil(count / 2) : count
    : Math.max(0, Math.floor(props.maxIterations))
  let iteration = 0
  decorated.value = true
  finiteRunning = true
  effectVariant = props.variant
  emit('animation-start', effectVariant)
  const tick = () => {
    if (token !== generation || !active.value)
      return
    scrambledText.value = original.map((char, index) => {
      const revealed = props.sequential && (props.revealDirection === 'start' ? index < iteration
        : props.revealDirection === 'end' ? index >= count - iteration : Math.abs(index - center) <= iteration)
      if (/^\s+$/u.test(char) || revealed || (!props.sequential && iteration >= total))
        return char
      return pool[Math.floor(Math.random() * pool.length)] ?? char
    }).join('')
    iteration++
    if (props.sequential ? iteration >= total : iteration > total) {
      scrambleTimer = undefined
      scrambledText.value = props.text
      completeEffect(token)
      return
    }
    scrambleTimer = setTimeout(tick, Math.max(1, props.scrambleSpeed))
  }
  scrambleTimer = setTimeout(tick, Math.max(1, props.scrambleSpeed))
}

async function playEffect(): Promise<void> {
  stopWork()
  if (!active.value || !isGeneric.value || !props.text || morphRunning)
    return
  if (preset.value.mode === 'scramble') {
    runScramble()
    return
  }
  const token = generation
  decorated.value = true
  await nextTick()
  if (token !== generation || !active.value)
    return
  const elements = Array.from(overlayRef.value?.querySelectorAll<HTMLElement>('[data-motion-unit]') ?? [])
  if (!elements.length || typeof elements[0]?.animate !== 'function') {
    decorated.value = false
    return
  }
  if (isHover.value) {
    if (focused.value)
      elements.forEach(element => hoverUnit(element, true))
    return
  }
  const source = preset.value
  const resolved = timing()
  const duration = Math.max(1, resolved.duration)
  const stagger = Math.max(0, props.staggerMs ?? source.staggerMs)
  const continuous = isLoop.value
  finiteRunning = !continuous
  effectVariant = props.variant
  emit('animation-start', effectVariant)
  let remaining = elements.length
  const finish = () => {
    if (token !== generation)
      return
    remaining--
    if (remaining === 0)
      completeEffect(token, source.mode === 'typewriter')
  }
  elements.forEach((element, index) => {
    let frames = source.keyframes ?? [{ opacity: 0 }, { opacity: 1 }]
    let delay = index * stagger
    let unitDuration = duration
    let easing = resolved.easing
    if (source.mode === 'tracking-in' || source.mode === 'tracking-out') {
      // Preserve the spacing reveal without leaving tracked body text at rest.
      const spread = source.mode === 'tracking-in' ? 0.6 : -0.2
      const offset = (index - (elements.length - 1) / 2) * spread
      frames = [{ translate: `${offset}em 0`, opacity: 0 }, { translate: '0 0', opacity: 1 }]
    }
    else if (source.mode === 'typewriter') {
      unitDuration = duration / elements.length
      delay = index * unitDuration
      easing = 'steps(1, end)'
      frames = [{ opacity: 0 }, { opacity: 1 }]
    }
    else if (source.id === 'registry-blur-text') {
      frames = [{ opacity: 0, filter: `blur(${Math.max(0, props.initialBlur)}px)` }, { opacity: 1, filter: 'blur(0px)' }]
    }
    else if (source.id === 'character-stagger') {
      frames = [{ opacity: 0, translate: `0 ${props.yOffset}px`, scale: 0.8 }, { opacity: 1, translate: '0 0', scale: 1 }]
    }
    else if (source.mode === 'glow') {
      return
    }
    const animation = ownAnimation(element, frames, {
      duration: unitDuration, delay, easing, fill: 'both', iterations: continuous ? Infinity : 1,
    })
    if (animation && !continuous)
      animation.onfinish = finish
    else if (!animation && !continuous)
      finish()
  })
  if (source.mode === 'typewriter' && caretRef.value && overlayRef.value) {
    // One launch-time measurement pass; the compositor owns every subsequent frame.
    const bounds = overlayRef.value.getBoundingClientRect()
    const positions = elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.right - bounds.right, y: rect.top - bounds.top }
    })
    const caretFrames: Keyframe[] = [{ translate: `${-bounds.width}px 0`, offset: 0 }]
    positions.forEach(({ x, y }, index) => caretFrames.push({ translate: `${x}px ${y}px`, offset: (index + 1) / elements.length }))
    ownAnimation(caretRef.value, caretFrames, { duration, easing: 'steps(1, end)', fill: 'both' })
    ownAnimation(caretRef.value, [{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: 'steps(2, jump-none)', iterations: Infinity })
  }
  if (source.mode === 'glow') {
    if (auraNearRef.value)
      ownAnimation(auraNearRef.value, [{ opacity: 0.5 }, { opacity: 0 }, { opacity: 0.5 }], { duration, easing: 'ease-in-out', iterations: Infinity })
    if (auraFarRef.value)
      ownAnimation(auraFarRef.value, [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }], { duration, easing: 'ease-in-out', iterations: Infinity })
  }
}

function hoverUnit(element: HTMLElement, entering: boolean): void {
  if (!active.value || !isHover.value || morphRunning)
    return
  const frames = preset.value.hoverFrames
  if (!frames)
    return
  const previous = hoverAnimations.get(element)
  previous?.cancel()
  if (previous)
    animations.delete(previous)
  const resolved = timing()
  const animation = ownAnimation(element, frames, {
    duration: Math.max(1, resolved.duration), easing: resolved.easing, fill: 'both', direction: entering ? 'normal' : 'reverse',
  })
  if (animation)
    hoverAnimations.set(element, animation)
}

function unitPointer(event: PointerEvent, entering: boolean): void {
  if (event.currentTarget instanceof HTMLElement)
    hoverUnit(event.currentTarget, entering)
}

function syncVideo(): void {
  const videos = mediaRef.value?.querySelectorAll<HTMLVideoElement>('video')
  videos?.forEach((video) => {
    if (!active.value || !mediaOpen.value || !props.mediaAutoplay) {
      video.pause()
      return
    }
    // Autoplay rejection is browser policy, not a fabricated media failure/success.
    void video.play().catch(() => {})
  })
}

function animateMedia(): void {
  const element = mediaRef.value
  if (!element || preset.value.mode !== 'media')
    return
  const current = active.value ? getComputedStyle(element) : undefined
  for (const animation of animations) {
    animation.onfinish = null
    animation.cancel()
  }
  animations.clear()
  if (active.value) {
    const resolved = timing()
    const animation = ownAnimation(element, [
      { width: current?.width ?? '0px', opacity: current?.opacity ?? '0', scale: current?.scale ?? '0.8', marginInline: current?.marginInlineStart ?? '0px' },
      { width: mediaOpen.value ? `${Math.max(0, props.mediaWidth)}px` : '0px', opacity: mediaOpen.value ? 1 : 0,
        scale: mediaOpen.value ? '1' : '0.8', marginInline: mediaOpen.value ? '0.4em' : '0' },
    ], { duration: Math.max(1, resolved.duration), easing: resolved.easing, fill: 'both' })
    if (animation) {
      animation.onfinish = () => {
        animations.delete(animation)
        animation.cancel()
      }
    }
  }
  void nextTick().then(syncVideo)
}

function replay(): void {
  manualRequested = true
  if (preset.value.mode === 'media') {
    mediaOpen.value = true
    return
  }
  void playEffect()
}

function reset(): void {
  manualRequested = false
  mediaOpen.value = false
  hoveredItem.value = null
  focusedItem.value = null
  stopWork()
}

function pointerEnter(): void {
  pointerInside.value = true
  if (trigger.value !== 'hover')
    return
  if (preset.value.mode === 'media' && !props.paused)
    mediaOpen.value = true
  else if (!decorated.value || preset.value.mode === 'scramble')
    void playEffect()
}

function pointerLeave(): void {
  pointerInside.value = false
  if (trigger.value === 'hover' && !focused.value && preset.value.mode === 'media')
    mediaOpen.value = false
}

function focusEnter(): void {
  focused.value = true
  if (trigger.value === 'hover') {
    if (preset.value.mode === 'media' && !props.paused)
      mediaOpen.value = true
    else if (isHover.value && decorated.value)
      overlayRef.value?.querySelectorAll<HTMLElement>('[data-motion-unit]').forEach(element => hoverUnit(element, true))
    else
      void playEffect()
  }
}

function focusLeave(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && rootRef.value?.contains(event.relatedTarget))
    return
  focused.value = false
  focusedItem.value = null
  if (isHover.value)
    overlayRef.value?.querySelectorAll<HTMLElement>('[data-motion-unit]').forEach(element => hoverUnit(element, false))
  if (!pointerInside.value && trigger.value === 'hover' && preset.value.mode === 'media')
    mediaOpen.value = false
}

function itemStyle(item: MotionTextItem): CSSProperties {
  const inactive = active.value && selectedItem.value !== null && selectedItem.value !== item.id
  const resolved = active.value ? timing() : { duration: 0, easing: 'linear' }
  return {
    filter: inactive ? `blur(${Math.max(0, props.blurAmount)}px)` : 'none',
    opacity: inactive ? Math.min(1, Math.max(0, props.opacityAmount)) : 1,
    transition: active.value ? `filter ${resolved.duration}ms ${resolved.easing}, opacity ${resolved.duration}ms ${resolved.easing}` : 'none',
  }
}

function morphStart(): void {
  morphRunning = true
  stopWork()
  emit('animation-start', props.variant)
}

function morphComplete(): void {
  morphRunning = false
  emit('animation-complete', props.variant)
  if (active.value && (isLoop.value || isHover.value))
    void playEffect()
}

function morphCancel(): void {
  morphRunning = false
  emit('animation-cancel', props.variant)
}
function bracketRef(id: string, element: unknown): void {
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
    brackets.set(id, element)
    return
  }
  brackets.delete(id)
  const animation = bracketAnimations.get(id)
  if (animation) {
    animation.cancel()
    animations.delete(animation)
    bracketAnimations.delete(id)
  }
}

watch(selectedItem, (current, previous) => {
  if (!active.value || !props.showBrackets)
    return
  const resolved = resolveTransition({ stiffness: 350, damping: 20 })
  for (const [id, entering] of [[previous, false], [current, true]] as const) {
    if (id === null)
      continue
    const element = brackets.get(id)
    if (!element)
      continue
    const previousAnimation = bracketAnimations.get(id)
    previousAnimation?.cancel()
    if (previousAnimation)
      animations.delete(previousAnimation)
    const animation = ownAnimation(element, [{ opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1.1 }], {
      duration: resolved.duration, easing: resolved.easing, direction: entering ? 'normal' : 'reverse', fill: 'both',
    })
    if (animation)
      bracketAnimations.set(id, animation)
  }
}, { flush: 'post' })


watch(active, (enabled) => {
  if (!enabled) {
    stopWork()
    morphRunning = false
    pointerInside.value = false
    if (props.paused)
      mediaOpen.value = false
    return
  }
  if (preset.value.mode === 'media') {
    if (trigger.value === 'in-view')
      mediaOpen.value = true
    else if (manualRequested)
      mediaOpen.value = true
    syncVideo()
  }
  else if (trigger.value === 'in-view' || isHover.value || manualRequested)
    void playEffect()
}, { flush: 'post' })

watch(() => props.text, async () => {
  // The mounted TextMorph receives the value itself; no keyed replacement or local diff.
  stopWork()
  const token = generation
  await nextTick()
  if (token === generation && !morphRunning && active.value && (isLoop.value || isHover.value))
    void playEffect()
}, { flush: 'pre' })

watch(() => [props.variant, props.locale, props.trigger, props.durationMs, props.staggerMs, props.transition,
  props.initialBlur, props.yOffset, props.scrambleSpeed, props.maxIterations, props.sequential,
  props.revealDirection, props.useOriginalCharsOnly, props.characters] as const, () => {
  stopWork()
  if (!isGeneric.value)
    morphRunning = false
  mediaOpen.value = false
  manualRequested = false
  if (active.value && (trigger.value === 'in-view' || isHover.value || pointerInside.value || focused.value)) {
    if (preset.value.mode === 'media')
      mediaOpen.value = true
    else
      void playEffect()
  }
}, { flush: 'post', deep: true })
watch(() => props.replayKey, replay)
watch(() => [mediaOpen.value, props.mediaWidth, props.mediaHeight] as const, animateMedia, { flush: 'pre' })
watch(() => [videoRef.value, props.mediaAutoplay, props.mediaSrc, props.mediaLoop, props.mediaMuted] as const,
  () => void nextTick().then(syncVideo), { flush: 'post' })
watch(() => props.items, () => {
  if (!props.items.some(item => item.id === hoveredItem.value))
    hoveredItem.value = null
  if (!props.items.some(item => item.id === focusedItem.value))
    focusedItem.value = null
}, { deep: true })
onBeforeUnmount(() => stopWork(false))
defineExpose<MotionTextExpose>({ replay, animate: replay, reset })
</script>

<template>
  <component
    :is="tag" ref="rootRef" class="tx-motion-text"
    :class="[`tx-motion-text--${size}`, { 'is-decorated': decorated, 'is-interactive': keyboardInteractive, 'is-active': active, 'is-scramble': preset.mode === 'scramble' }]"
    :style="rootStyle" :data-variant="variant" :tabindex="keyboardInteractive ? 0 : undefined"
    @pointerenter="pointerEnter" @pointerleave="pointerLeave" @focusin="focusEnter" @focusout="focusLeave"
  >
    <template v-if="preset.mode === 'media'">
      <TxTextMorph :text="firstText" :locale="locale" :disabled="!active" />
      <span ref="mediaRef" class="tx-motion-text__media" :style="mediaStyle" :aria-hidden="!mediaOpen">
        <slot name="media" :open="mediaOpen" :active="active">
          <img v-if="mediaSrc && mediaType === 'image'" :src="mediaSrc" :alt="mediaAlt" @error="emit('media-error', $event)">
          <video
            v-else-if="mediaSrc && mediaType === 'video'" ref="videoRef" :src="mediaSrc"
            :poster="mediaPoster || undefined" :muted="mediaMuted" :loop="mediaLoop && active"
            :playsinline="mediaPlaysinline" :aria-label="mediaAlt || undefined" preload="metadata"
            @error="emit('media-error', $event)"
          />
        </slot>
      </span>
      <span class="tx-motion-text__separator"> </span>
      <TxTextMorph :text="secondText" :locale="locale" :disabled="!active" />
    </template>
    <span v-else-if="preset.mode === 'focus'" class="tx-motion-text__items" @pointerleave="hoveredItem = null">
      <component
        :is="item.href ? 'a' : 'button'" v-for="item in items" :key="item.id"
        :href="item.href" :type="item.href ? undefined : 'button'"
        class="tx-motion-text__item" :class="{ 'is-selected': selectedItem === item.id }" :style="itemStyle(item)"
        @pointerenter="hoveredItem = item.id" @pointerleave="hoveredItem = null" @focus="focusedItem = item.id; hoveredItem = null"
        @click="emit('select', item)"
      >
        <TxTextMorph :text="item.label" :locale="locale" :disabled="!active" />
        <span v-if="showBrackets" :ref="element => bracketRef(item.id, element)" class="tx-motion-text__brackets" aria-hidden="true" />
      </component>
    </span>
    <template v-else>
      <TxTextMorph
        class="tx-motion-text__original" :text="text" :locale="locale" :disabled="!active"
        @animation-start="morphStart" @animation-complete="morphComplete" @animation-cancel="morphCancel"
      />
      <span
        ref="overlayRef" class="tx-motion-text__visual" aria-hidden="true"
        :class="{ 'is-clipped': preset.clipped, 'is-lines': preset.granularity === 'line', 'is-shimmer': preset.mode === 'shimmer' }"
      >
        <span v-if="preset.mode === 'scramble'">{{ scrambledText }}</span>
        <template v-else>
          <template v-for="(unit, index) in units" :key="index">
            <br v-if="unit.text === '\n' && preset.granularity === 'grapheme'">
            <span v-else class="tx-motion-text__mask" :class="{ 'is-line': preset.granularity === 'line' }"><span
              class="tx-motion-text__unit" data-motion-unit
              @pointerenter="unitPointer($event, true)" @pointerleave="unitPointer($event, false)"
            >{{ unit.text }}</span></span>{{ unit.ws }}
          </template>
        </template>
        <span v-if="preset.mode === 'typewriter'" ref="caretRef" class="tx-motion-text__caret" />
        <template v-if="preset.mode === 'glow'">
          <span ref="auraNearRef" class="tx-motion-text__aura tx-motion-text__aura--near">{{ text }}</span>
          <span ref="auraFarRef" class="tx-motion-text__aura tx-motion-text__aura--far">{{ text }}</span>
        </template>
      </span>
    </template>
  </component>
</template>

<style lang="scss" scoped>
.tx-motion-text {
  --tx-motion-text-font-size: 14px;
  --tx-motion-text-line-height: 1.5;
  position: relative;
  display: inline-block;
  color: var(--tx-text-color-primary);
  font-size: var(--tx-motion-text-font-size);
  line-height: var(--tx-motion-text-line-height);
  vertical-align: baseline;
  white-space: pre;
  &--xs { --tx-motion-text-font-size: 12px; }
  &--sm { --tx-motion-text-font-size: 13px; }
  &--lg { --tx-motion-text-font-size: 14px; --tx-motion-text-line-height: 1.75; }
  &.is-interactive { cursor: default; }
  &:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 4px; border-radius: 3px; }
  &__original { opacity: 1; }
  &.is-decorated &__original { opacity: 0; }
  &.is-decorated:not(.is-scramble) &__original { -webkit-user-select: none; user-select: none; }
  &__visual {
    position: absolute;
    inset: 0;
    visibility: hidden;
    white-space: pre;
    perspective: 1000px;
    -webkit-user-select: text;
    user-select: text;
    pointer-events: none;
    &.is-clipped { clip-path: inset(0 -100vw); }
    &.is-shimmer {
      color: var(--tx-text-color-primary);
      @supports (background-clip: text) {
        background: linear-gradient(90deg, var(--tx-text-color-regular), var(--tx-text-color-primary), var(--tx-text-color-regular));
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
      }
    }
  }
  &.is-decorated &__visual { visibility: visible; pointer-events: auto; }
  &__mask, &__unit { display: inline-block; vertical-align: baseline; }
  &__mask.is-line { display: block; min-height: 1.5em; clip-path: inset(0 -100vw); }
  &.is-scramble &__visual { -webkit-user-select: none; user-select: none; pointer-events: none; }
  &__unit { transform-origin: center; white-space: pre; }
  &[data-variant='txt-swing-word'] &__unit { transform-origin: top center; }
  &[data-variant='txt-swing-word'] &__visual { perspective: 800px; }
  &.is-active[data-variant='txt-spring-text'] &__unit:hover,
  &.is-active[data-variant='txt-hoverlift-char'] &__unit:hover,
  &.is-active[data-variant='txt-hoverlift-word'] &__unit:hover { color: var(--tx-color-primary); }
  &__caret { position: absolute; inset-inline-end: 0; top: 0.1em; height: 1.3em; width: 2px; background: var(--tx-color-primary); }
  &__aura { position: absolute; inset: 0; color: transparent; pointer-events: none; -webkit-user-select: none; user-select: none; }
  &__aura--near { text-shadow: 0 0 10px var(--tx-color-primary); }
  &__aura--far { text-shadow: 0 0 25px var(--tx-color-primary); }
  &__media {
    display: inline-flex;
    height: var(--tx-motion-text-media-height);
    overflow: hidden;
    vertical-align: middle;
    border-radius: 8px;
    > img, > video, :slotted(*) { width: var(--tx-motion-text-media-width); height: 100%; object-fit: cover; flex-shrink: 0; }
  }
  &__items { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 1.5em; white-space: normal; }
  &__item {
    position: relative;
    display: inline-block;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    &.is-selected { color: var(--tx-color-primary); }
    &:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 6px; border-radius: 4px; }
  }
  &__brackets { position: absolute; inset: -4px -8px; border: 1px dashed var(--tx-border-color); border-radius: 6px; pointer-events: none; opacity: 0; scale: 1.3; }
  &__item.is-selected &__brackets { opacity: 1; scale: 1.1; }
  @media (prefers-reduced-motion: reduce) {
    &__original { opacity: 1 !important; -webkit-user-select: text !important; user-select: text !important; }
    &__visual { visibility: hidden !important; }
    &__item { transition: none !important; filter: none !important; opacity: 1 !important; }
  }
}
</style>
