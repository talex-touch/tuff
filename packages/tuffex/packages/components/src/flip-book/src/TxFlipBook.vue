<script setup lang="ts">
// SPDX-License-Identifier: Apache-2.0
// Modified: Vue/TuffEx port of Amicro dither-charts/DitherBook.tsx and simple-comp/SimpleCompExtracted.tsx.
// Source commit: 43c29ce9cdd16459e3eab4992381b8d35b38776a.
// Changes: caller-owned pages/slots, semantic controls, shared motion lifecycle, no external assets.
import type { CSSProperties } from 'vue'
import type { FlipBookEmits, FlipBookProps, FlipBookSettings, FlipBookSlotProps } from './types'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { TxTextMorph } from '../../text-morph'

defineOptions({ name: 'TxFlipBook' })
const props = withDefaults(defineProps<FlipBookProps>(), {
  mode: 'dither-book', compact: false, loop: true, controls: true, settingsPanel: true,
  intro: false, introFlips: 10, animated: true, disabled: false, duration: 450,
  size: 'md', ariaLabel: 'Flip book',
})
const emit = defineEmits<FlipBookEmits>()
defineSlots<{ page?: (props: FlipBookSlotProps) => unknown, empty?: () => unknown }>()
const root = ref<HTMLElement | null>(null)
const leaf = ref<HTMLElement | null>(null)
const binding = ref<HTMLElement | null>(null)
const { active, reduced } = useMotionActivity(root, () => props.animated)
const localIndex = ref(props.modelValue ?? 0)
const displayedIndex = ref(0)
const direction = ref<1 | -1>(1)
const extracted = computed(() => props.mode === 'extracted-book')
const manualIntroLocked = computed(() => extracted.value && active.value && introRemaining.value > 0)
const flip = ref<{ from: number, to: number, direction: 1 | -1 } | null>(null)
const introRemaining = ref(props.intro ? props.introFlips : 0)
const introRunning = ref(false)
const settingsOpen = ref(false)
const animations: Animation[] = []
let introTimer: ReturnType<typeof setTimeout> | undefined
let animationVersion = 0
let mounted = true
let entrance: Animation | undefined
let entrancePlayed = false
const settings = reactive<FlipBookSettings>({ padding: 10, imageRadius: 20, creaseOpacity: 11, paperColor: 'var(--tx-bg-color-overlay, var(--tx-bg-color))', shadowIntensity: 24 })
watch(() => [props.settings, props.padding, props.imageRadius, props.creaseOpacity, props.paperColor, props.shadowIntensity, props.compact, props.mode], () => {
  Object.assign(settings, {
    padding: props.padding ?? props.settings?.padding ?? (props.compact ? 6 : extracted.value ? 14 : 10),
    imageRadius: props.imageRadius ?? props.settings?.imageRadius ?? (props.compact ? 8 : extracted.value ? 32 : 20),
    creaseOpacity: props.creaseOpacity ?? props.settings?.creaseOpacity ?? 11,
    paperColor: props.paperColor ?? props.settings?.paperColor ?? 'var(--tx-bg-color-overlay, var(--tx-bg-color))',
    shadowIntensity: props.shadowIntensity ?? props.settings?.shadowIntensity ?? (props.compact ? 10 : extracted.value ? 34 : 24),
  })
}, { immediate: true, deep: true })
const copy = computed(() => ({
  previous: 'Previous', next: 'Next', settings: 'Book settings', padding: 'Image padding',
  imageRadius: 'Image radius', creaseOpacity: 'Crease opacity', paperColor: 'Paper color',
  shadowIntensity: 'Shadow intensity', intro: 'Replay opening', ...props.labels,
}))
const current = computed(() => normalize(props.modelValue ?? localIndex.value))
displayedIndex.value = current.value
const leftIndex = computed(() => flip.value ? (flip.value.direction === 1 ? flip.value.from - 1 : flip.value.to - 1) : displayedIndex.value - 1)
const rightIndex = computed(() => flip.value ? (flip.value.direction === 1 ? flip.value.to : flip.value.from) : displayedIndex.value)
const frontIndex = computed(() => flip.value?.direction === -1 ? flip.value.to : flip.value?.from ?? current.value)
const backIndex = computed(() => flip.value?.direction === -1 ? flip.value.from - 1 : (flip.value?.to ?? current.value) - 1)
const visiblePages = computed(() => [
  { index: leftIndex.value, side: 'left' as const, base: true },
  { index: rightIndex.value, side: 'right' as const, base: true },
])
const leafPages = computed(() => [
  { index: frontIndex.value, side: 'front' as const },
  { index: backIndex.value, side: 'back' as const },
])
const bookStyle = computed<CSSProperties>(() => ({
  '--tx-book-padding': `${settings.padding}px`, '--tx-book-radius': `${settings.imageRadius}px`,
  '--tx-book-crease': `${Math.max(0, Math.min(100, settings.creaseOpacity))}%`,
  '--tx-book-crease-soft': `${Math.max(0, Math.min(100, settings.creaseOpacity)) / 4}%`,
  '--tx-book-paper': settings.paperColor, '--tx-book-shadow': `${settings.shadowIntensity}px`,
  '--tx-book-crease-width': extracted.value ? '64px' : '48px',
  '--tx-book-pose': extracted.value ? 'rotateX(8deg) rotateY(-6deg)' : 'rotateX(6deg) rotateY(-4deg)',
  aspectRatio: extracted.value ? '16 / 9' : '16 / 10',
  perspective: extracted.value ? '3000px' : '2400px',
  maxWidth: `${({ xs: 300, sm: 400, md: 512, lg: 640 })[props.size]}px`,
}))
function normalize(index: number) {
  const count = props.pages.length
  if (!count || !Number.isFinite(index)) return 0
  const rounded = Math.round(index)
  return props.loop ? ((rounded % count) + count) % count : Math.max(0, Math.min(count - 1, rounded))
}
function pageAt(index: number) {
  if (!props.pages.length || (!props.loop && (index < 0 || index >= props.pages.length))) return undefined
  return props.pages[normalize(index)]
}
function clearIntroTimer() {
  if (introTimer !== undefined) { clearTimeout(introTimer); introTimer = undefined }
}
function cancelAnimations() {
  animationVersion++
  for (const animation of animations) { animation.onfinish = null; animation.cancel() }
  animations.length = 0
}
function finishFlip() {
  const state = flip.value
  if (!state) return
  cancelAnimations()
  displayedIndex.value = state.to
  flip.value = null
  emit('flip-end', state.to)
  introRunning.value = false
  scheduleIntro()
}
async function animateFlip() {
  const version = ++animationVersion
  await nextTick()
  const state = flip.value
  if (!mounted || version !== animationVersion || !state) return
  const element = leaf.value
  if (!active.value || !element?.animate) { finishFlip(); return }
  const spring = resolveTransition('smooth')
  const fastIntro = introRunning.value && (extracted.value || introRemaining.value > 0)
  const duration = fastIntro ? (extracted.value ? 120 : 140) : props.duration
  const options: KeyframeAnimationOptions = { duration, easing: fastIntro ? 'linear' : spring.easing, fill: 'both' }
  const animation = element.animate([
    { transform: `rotateY(${state.direction === 1 ? 0 : -180}deg)` },
    { transform: `rotateY(${state.direction === 1 ? -180 : 0}deg)` },
  ], options)
  animations.push(animation)
  element.querySelectorAll<HTMLElement>('.tx-flip-book__shade').forEach((shade, index) => {
    const start = (state.direction === 1) === (index === 0) ? 0 : 0.4
    animations.push(shade.animate([{ opacity: start }, { opacity: 0.4 - start }], options))
  })
  animation.onfinish = () => { if (version === animationVersion) finishFlip() }
}
watch(current, (to, from) => {
  if (to === displayedIndex.value && !flip.value) return
  if (flip.value) finishFlip()
  clearIntroTimer()
  const dir = to === normalize(from + direction.value) ? direction.value : to > from ? 1 : -1
  flip.value = { from: displayedIndex.value, to, direction: dir }
  emit('flip-start', displayedIndex.value, to, dir)
  if (!active.value) finishFlip()
  else void animateFlip()
}, { flush: 'sync' })
watch(() => props.pages, () => {
  clearIntroTimer()
  if (flip.value) finishFlip()
  localIndex.value = normalize(localIndex.value)
  displayedIndex.value = current.value
}, { deep: true })
function goTo(index: number, requestedDirection?: 1 | -1) {
  if (props.disabled || flip.value || !props.pages.length || !Number.isFinite(index)) return
  const to = normalize(index)
  if (to === current.value) return
  direction.value = requestedDirection ?? (to > current.value ? 1 : -1)
  emit('update:modelValue', to)
  localIndex.value = to
  const page = props.pages[to]
  if (page) emit('change', page, to)
}
function previous() { if (manualIntroLocked.value) return; clearIntroTimer(); introRemaining.value = 0; goTo(current.value - 1, -1) }
function next() { if (manualIntroLocked.value) return; clearIntroTimer(); introRemaining.value = 0; goTo(current.value + 1, 1) }
function scheduleIntro() {
  clearIntroTimer()
  if (!mounted || !active.value || props.disabled || flip.value || introRemaining.value <= 0 || props.pages.length < 2) return
  introTimer = setTimeout(() => {
    introTimer = undefined
    introRunning.value = true
    introRemaining.value--
    const before = current.value
    if (normalize(before + 1) === before) { introRemaining.value = 0; introRunning.value = false; return }
    goTo(before + 1, 1)
  }, introRemaining.value === props.introFlips ? (extracted.value ? 800 : 300) : (extracted.value ? 20 : 70))
}
function replayIntro() {
  if (props.disabled || !props.animated || reduced.value) return
  introRemaining.value = props.introFlips
  scheduleIntro()
}
watch([active, () => props.disabled], () => {
  if (!active.value || props.disabled) {
    clearIntroTimer()
    entrance?.cancel()
    entrance = undefined
    if (flip.value) finishFlip()
  }
  else {
    if (!entrancePlayed && binding.value?.animate) {
      entrancePlayed = true
      entrance = binding.value.animate([
        { transform: extracted.value ? 'translateY(100px) rotateX(20deg) rotateY(-15deg) rotateZ(-5deg) scale(0.8)' : 'rotateX(12deg) rotateY(-10deg) rotateZ(-2deg) scale(0.95)' },
        { transform: extracted.value ? 'translateY(0) rotateX(8deg) rotateY(-6deg) rotateZ(0) scale(1)' : 'rotateX(6deg) rotateY(-4deg) rotateZ(0) scale(1)' },
      ], { duration: extracted.value ? 1500 : 1200, easing: resolveTransition('smooth').easing })
      entrance.onfinish = () => { entrance?.cancel(); entrance = undefined }
    }
    scheduleIntro()
  }
}, { immediate: true })
watch(() => props.intro, value => { introRemaining.value = value ? props.introFlips : 0; scheduleIntro() })
watch(reduced, value => { if (value) introRemaining.value = 0 })
function updateSetting(key: keyof FlipBookSettings, value: string) {
  if (props.disabled) return
  if (key === 'paperColor') settings.paperColor = value
  else settings[key] = Number(value)
  emit('update:settings', { ...settings })
}
function onKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); next() }
  else if (event.key === 'Home') { event.preventDefault(); goTo(0) }
  else if (event.key === 'End') { event.preventDefault(); goTo(props.pages.length - 1) }
}
onBeforeUnmount(() => { mounted = false; clearIntroTimer(); cancelAnimations(); entrance?.cancel() })
defineExpose({ previous, next, goTo, replayIntro })
</script>

<template>
  <div ref="root" class="tx-flip-book" :class="{ 'is-compact': compact, 'is-flipping': flip }" :data-mode="mode" role="group" :aria-label="ariaLabel" @keydown="onKeydown">
    <slot v-if="!pages.length" name="empty" />
    <template v-else>
      <div class="tx-flip-book__perspective" :style="bookStyle">
        <button v-if="extracted && controls" type="button" class="tx-flip-book__side is-previous" :disabled="disabled || !!flip || manualIntroLocked || (!loop && current === 0)" :aria-label="copy.previous" @click="previous">
<svg viewBox="0 0 14 44" width="14" height="44" fill="none" aria-hidden="true"><polyline points="11,3 3,22 11,41" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>
        <button v-if="extracted && controls" type="button" class="tx-flip-book__side is-next" :disabled="disabled || !!flip || manualIntroLocked || (!loop && current === pages.length - 1)" :aria-label="copy.next" @click="next">
<svg viewBox="0 0 14 44" width="14" height="44" fill="none" aria-hidden="true"><polyline points="3,3 11,22 3,41" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>
        <div ref="binding" class="tx-flip-book__binding">
          <div v-for="entry in visiblePages" :key="entry.side" class="tx-flip-book__page" :class="`is-${entry.side}`">
            <div class="tx-flip-book__paper">
<div class="tx-flip-book__content">
              <slot v-if="pageAt(entry.index)" name="page" :page="pageAt(entry.index)!" :index="normalize(entry.index)" :side="entry.side">
                <img v-if="pageAt(entry.index)?.src" :src="pageAt(entry.index)?.src" :alt="pageAt(entry.index)?.alt ?? pageAt(entry.index)?.title ?? ''" draggable="false">
                <div v-else class="tx-flip-book__text">
<strong>{{ pageAt(entry.index)?.title }}</strong><p>{{ pageAt(entry.index)?.content }}</p>
</div>
              </slot>
            </div>
</div>
            <div class="tx-flip-book__crease" aria-hidden="true" />
            <button class="tx-flip-book__turn" type="button" :aria-label="entry.side === 'left' ? copy.previous : copy.next" :disabled="disabled || !!flip || manualIntroLocked || (!loop && (entry.side === 'left' ? current === 0 : current === pages.length - 1))" @click="entry.side === 'left' ? previous() : next()">
{{ entry.side === 'left' ? '‹' : '›' }}
</button>
          </div>
          <div v-if="flip" ref="leaf" class="tx-flip-book__leaf" aria-hidden="true">
            <div v-for="entry in leafPages" :key="entry.side" class="tx-flip-book__face" :class="`is-${entry.side}`">
              <div class="tx-flip-book__paper">
<div class="tx-flip-book__content">
                <slot v-if="pageAt(entry.index)" name="page" :page="pageAt(entry.index)!" :index="normalize(entry.index)" :side="entry.side">
                  <img v-if="pageAt(entry.index)?.src" :src="pageAt(entry.index)?.src" :alt="pageAt(entry.index)?.alt ?? pageAt(entry.index)?.title ?? ''" draggable="false">
                  <div v-else class="tx-flip-book__text">
<strong>{{ pageAt(entry.index)?.title }}</strong><p>{{ pageAt(entry.index)?.content }}</p>
</div>
                </slot>
              </div>
</div>
              <div class="tx-flip-book__crease" /><div class="tx-flip-book__shade" />
            </div>
          </div>
        </div>
      </div>
      <div v-if="mode !== 'book' && controls" class="tx-flip-book__controls">
        <button type="button" class="tx-flip-book__bottom-turn" :disabled="disabled || !!flip || manualIntroLocked || (!loop && current === 0)" @click="previous">
{{ copy.previous }}
</button>
        <span aria-live="polite" aria-atomic="true"><TxTextMorph :text="pages[current]?.title || `${current + 1} / ${pages.length}`" :duration-ms="300" :disabled="!active" /></span>
        <button v-if="settingsPanel" type="button" :disabled="disabled" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">
{{ copy.settings }}
</button>
        <button type="button" class="tx-flip-book__bottom-turn" :disabled="disabled || !!flip || manualIntroLocked || (!loop && current === pages.length - 1)" @click="next">
{{ copy.next }}
</button>
      </div>
      <div v-if="mode !== 'book' && settingsPanel && settingsOpen" class="tx-flip-book__settings">
        <label v-for="field in (['padding', 'imageRadius', 'creaseOpacity', 'shadowIntensity'] as const)" :key="field" class="tx-flip-book__field"><span>{{ copy[field] }} <output>{{ settings[field] }}{{ field === 'creaseOpacity' ? '%' : 'px' }}</output></span><input type="range" min="0" :max="extracted ? (field === 'imageRadius' ? 32 : field === 'shadowIntensity' ? 50 : 100) : (field === 'padding' ? 30 : field === 'shadowIntensity' ? 48 : 40)" :value="settings[field]" :disabled="disabled" @input="updateSetting(field, ($event.target as HTMLInputElement).value)"></label>
        <label class="tx-flip-book__field"><span>{{ copy.paperColor }}</span><input type="text" :value="settings.paperColor" :disabled="disabled" @change="updateSetting('paperColor', ($event.target as HTMLInputElement).value)"></label>
        <button type="button" :disabled="disabled || !animated || reduced || !!flip" @click="replayIntro">
{{ copy.intro }}
</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tx-flip-book { position: relative; width: 100%; font-size: 13px; color: var(--tx-text-color-primary); }
.tx-flip-book__perspective { position: relative; width: calc(100% - 24px); margin: 12px auto; aspect-ratio: 16 / 10; perspective: 2400px; }
.tx-flip-book__binding { position: absolute; inset: 0; transform: var(--tx-book-pose); transform-style: preserve-3d; border-radius: 6px; box-shadow: 0 12px 24px color-mix(in srgb, var(--tx-text-color-primary) 18%, transparent); }
.tx-flip-book__page { position: absolute; inset-block: 0; width: 50%; overflow: hidden; background: var(--tx-book-paper); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.tx-flip-book__page.is-left { left: 0; border-radius: 6px 0 0 6px; }
.tx-flip-book__page.is-right { right: 0; border-radius: 0 6px 6px 0; }
.tx-flip-book__paper { position: absolute; inset: 0; background-color: var(--tx-book-paper); background-image: repeating-radial-gradient(circle at 17% 31%, color-mix(in srgb, var(--tx-text-color-primary) 3%, transparent) 0 0.5px, transparent 0.5px 3px); padding: var(--tx-book-padding); box-sizing: border-box; }
.tx-flip-book__content { width: 100%; height: 100%; border-radius: var(--tx-book-radius); box-shadow: 0 4px var(--tx-book-shadow) color-mix(in srgb, var(--tx-text-color-primary) 15%, transparent); overflow: hidden; }
.tx-flip-book__content img { width: 100%; height: 100%; display: block; object-fit: cover; }
.tx-flip-book__text { display: flex; height: 100%; box-sizing: border-box; flex-direction: column; justify-content: center; gap: 8px; padding: 12px; overflow: auto; }
.tx-flip-book__text strong { font-size: 14px; font-weight: 600; }
.tx-flip-book__text p { font-size: 13px; margin: 0; line-height: 1.5; }
.tx-flip-book__crease { position: absolute; inset-block: 0; width: var(--tx-book-crease-width); pointer-events: none; background: linear-gradient(to right, color-mix(in srgb, var(--tx-text-color-primary) var(--tx-book-crease), transparent), color-mix(in srgb, var(--tx-text-color-primary) var(--tx-book-crease-soft), transparent), transparent); box-shadow: inset 4px 0 10px color-mix(in srgb, var(--tx-text-color-primary) 10%, transparent); left: 0; }
.is-left > .tx-flip-book__crease, .is-back > .tx-flip-book__crease { left: auto; right: 0; transform: scaleX(-1); }
.tx-flip-book__turn { position: absolute; inset: 0; width: 100%; padding: 0 12px; border: 0; background: transparent; color: var(--tx-text-color-regular); cursor: pointer; font-size: 24px; opacity: 0; text-align: right; }
.is-left > .tx-flip-book__turn { text-align: left; }
.tx-flip-book__page:hover .tx-flip-book__turn, .tx-flip-book__turn:focus-visible { opacity: 1; }
.tx-flip-book__leaf { position: absolute; left: 50%; top: 0; width: 50%; height: 100%; transform-origin: left; transform-style: preserve-3d; z-index: 3; }
.tx-flip-book__face { position: absolute; inset: 0; backface-visibility: hidden; overflow: hidden; background: var(--tx-book-paper); border-radius: 0 6px 6px 0; }
.tx-flip-book__face.is-back { transform: rotateY(180deg); border-radius: 6px 0 0 6px; }
.tx-flip-book__shade { position: absolute; inset: 0; background: linear-gradient(to right, transparent, var(--tx-text-color-primary)); pointer-events: none; opacity: 0; }
.is-back > .tx-flip-book__shade { transform: scaleX(-1); }
.tx-flip-book__controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 6px 12px; }
.tx-flip-book button:not(.tx-flip-book__turn) { border: 0; padding: 6px 10px; border-radius: 8px; background: var(--tx-fill-color-light); color: var(--tx-text-color-regular); font: inherit; cursor: pointer; }
.tx-flip-book button:hover:not(:disabled) { background-color: var(--tx-fill-color); }
.tx-flip-book button:focus-visible, .tx-flip-book input:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 2px; }
.tx-flip-book button:disabled { cursor: not-allowed; opacity: 0.5; }
.tx-flip-book__settings { display: grid; gap: 12px; padding: 12px; max-width: 400px; margin: 8px auto; background: var(--tx-bg-color); border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.tx-flip-book__field { display: grid; gap: 4px; font-size: 13px; }
.tx-flip-book__field > span { display: flex; justify-content: space-between; gap: 8px; }
.tx-flip-book__field input { min-width: 0; width: 100%; box-sizing: border-box; accent-color: var(--tx-color-primary); font: inherit; }
.tx-flip-book .tx-flip-book__side { position: absolute; top: 50%; transform: translateY(-50%); z-index: 4; background: transparent; padding: 6px; }
.tx-flip-book__side.is-previous { left: -24px; }
.tx-flip-book__side.is-next { right: -24px; }
.tx-flip-book[data-mode='extracted-book'] .tx-flip-book__perspective { width: calc(100% - 72px); }
.tx-flip-book[data-mode='extracted-book'] .tx-flip-book__settings { position: absolute; top: 12px; right: 12px; width: min(320px, calc(100% - 48px)); z-index: 5; }
@media (min-width: 640px) { .tx-flip-book[data-mode='extracted-book'] .tx-flip-book__bottom-turn { display: none; } }
@media (max-width: 639px) { .tx-flip-book__side { display: none; } .tx-flip-book[data-mode='extracted-book'] .tx-flip-book__perspective { width: calc(100% - 24px); } }
@media (prefers-reduced-motion: reduce) { .tx-flip-book__binding { transform: none; } }
</style>
