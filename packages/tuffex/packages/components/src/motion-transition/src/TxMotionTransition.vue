<script setup lang="ts">
// Adapted from Amicro. MIT License; Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { VNode } from 'vue'
import type { MotionTransitionCompletion, MotionTransitionEmits, MotionTransitionKey, MotionTransitionPhase, MotionTransitionProps, MotionTransitionReason, MotionTransitionSlotProps, MotionTransitionStatus, MotionTransitionVariant } from './types'
import { computed, defineComponent, h, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch } from 'vue'
import { resolveCssEase } from '../../../../utils/animation/easing'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { isTopmostModalDialog, useZIndexAllocator } from '../../../../utils/z-index-manager'
import { resolveTransition } from '../../liquid/src/spring'
import { clampProgress, waveDelays, wavePath } from './geometry'

defineOptions({ name: 'TxMotionTransition', inheritAttrs: false })
const props = withDefaults(defineProps<MotionTransitionProps>(), {
  variant: 'spatial-door-portal', mode: 'inline', open: false, transition: 'smooth',
  speed: 1, disabled: false, title: '', ariaLabel: 'Content transition', closeLabel: 'Close',
  closable: true, maskClosable: true, escapeClosable: true, width: '640px', size: 'md',
})
const emit = defineEmits<MotionTransitionEmits>()
const slots = defineSlots<{
  default?: (props: MotionTransitionSlotProps) => VNode[]
  header?: (props: MotionTransitionSlotProps) => VNode[]
  footer?: (props: MotionTransitionSlotProps) => VNode[]
}>()
const stageRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const effectRef = ref<HTMLElement | null>(null)
const waveRef = ref<SVGSVGElement | null>(null)
const viewRef = ref<HTMLElement | null>(null)
const overlay = computed(() => props.mode === 'modal' || props.mode === 'overlay')
const visible = computed(() => !overlay.value || props.open)
const phase = ref<MotionTransitionPhase>('idle')
const displayKey = ref<MotionTransitionKey>(props.modelValue)
const viewRevision = ref(0)
const renderVariant = ref(props.variant)
const running = computed(() => phase.value !== 'idle')
const activity = useMotionActivity(stageRef, () => visible.value && !props.disabled)
const id = useId()
const titleId = `${id}-title`
const stageId = `${id}-stage`
const allocator = useZIndexAllocator()
const zIndex = ref(allocator.get())
const wave = computed(() => renderVariant.value === 'obsidian-liquid-wave' || renderVariant.value === 'liquid-wave')
const doors = computed(() => renderVariant.value === 'spatial-door-portal' || renderVariant.value === 'french-doors-3d')
let mounted = false
let listening = false
let previousFocus: HTMLElement | null = null
let focusAfterSwap = false
let raf: number | undefined
let panes: HTMLElement[] = []
let paths: SVGPathElement[] = []
let delays: number[][] = []
let suspended = false
let run: { from: MotionTransitionKey, to: MotionTransitionKey, variant: MotionTransitionVariant, reason: MotionTransitionReason, duration: number, ease: (value: number) => number, started: boolean, start: number, leg: 'leave' | 'enter' } | undefined

const slotProps = computed<MotionTransitionSlotProps>(() => ({ key: displayKey.value, phase: phase.value, running: running.value, close, replay }))
// Keep the outgoing VNodes, not a screenshot or a re-evaluated slot using the new model.
// The next content identity gets a fresh subtree only at the fully covered midpoint.
const ContentView = defineComponent({
  name: 'TxMotionTransitionContent',
  props: { frozen: Boolean },
  setup(viewProps) {
    let snapshot: VNode[] | undefined
    return () => {
      if (!snapshot || !viewProps.frozen)
        snapshot = slots.default?.(slotProps.value) ?? []
      return h('div', { class: 'tx-motion-transition__view', ref: viewRef }, snapshot)
    }
  },
})

function stopFrame(): void {
  if (raf !== undefined)
    cancelAnimationFrame(raf)
  raf = undefined
}

function focusNewContent(): void {
  if (!focusAfterSwap || !mounted || !visible.value)
    return
  focusAfterSwap = false
  const target = viewRef.value?.querySelector<HTMLElement>('[autofocus], button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')
  ;(target ?? stageRef.value)?.focus({ preventScroll: true })
}

function finish(status: MotionTransitionStatus = 'finished'): void {
  const current = run
  if (!current)
    return
  stopFrame()
  run = undefined
  displayKey.value = current.to
  if (current.leg === 'leave')
    viewRevision.value++
  phase.value = 'idle'
  viewRef.value?.removeAttribute('style')
  const detail: MotionTransitionCompletion = { from: current.from, to: current.to, variant: current.variant, reason: current.reason, status }
  // Completion follows the actual subtree commit, including reduced/hidden/closed exits.
  void nextTick(() => {
    if (!mounted)
      return
    if (!run)
      focusNewContent()
    if (status === 'interrupted')
      emit('interrupted', detail)
    emit('completed', detail)
  })
}

function cacheEffect(): void {
  panes = effectRef.value ? Array.from(effectRef.value.children) as HTMLElement[] : []
  paths = waveRef.value ? Array.from(waveRef.value.querySelectorAll('path')) : []
  delays = waveDelays(id, renderVariant.value === 'obsidian-liquid-wave' ? 14 : 12)
}

function paint(progress: number): void {
  const current = run
  if (!current)
    return
  const p = clampProgress(progress)
  const eased = current.ease(p)
  const cover = current.leg === 'leave' ? eased : 1 - eased
  if (current.variant === 'spatial-door-portal' || current.variant === 'french-doors-3d') {
    const french = current.variant === 'french-doors-3d'
    panes.forEach((pane, index) => {
      const sign = index === 0 ? -1 : 1
      const angle = (1 - cover) * (french ? -90 : 85) * sign
      pane.style.transform = `translateX(${french ? 0 : sign * (1 - cover) * 10}%) rotateY(${angle}deg)`
      pane.style.opacity = String(french ? clampProgress(cover) : 1)
    })
  }
  else if (current.variant === 'radial-iris-mask') {
    if (effectRef.value)
      effectRef.value.style.clipPath = `circle(${Math.max(0, cover) * 150}% at 50% 50%)`
  }
  else if (current.variant === 'perspective-flip-stage') {
    if (viewRef.value) {
      const angle = current.leg === 'leave' ? -90 * eased : 90 * (1 - eased)
      const shown = current.leg === 'leave' ? 1 - eased : eased
      viewRef.value.style.transform = `rotateX(${angle}deg) scale(${0.85 + 0.15 * shown})`
      viewRef.value.style.opacity = String(clampProgress(shown))
    }
  }
  else if (current.variant === 'staggered-glass-curtain' || current.variant === 'double-stairs') {
    panes.forEach((pane, index) => {
      const column = current.ease(clampProgress((p - index * 0.05) / 0.8))
      const stairs = current.variant === 'double-stairs'
      const direction = stairs && index % 2 === 1 ? 1 : -1
      const y = current.leg === 'leave' ? direction * (1 - column) * 105 : -direction * column * 105
      pane.style.transform = `translateY(${y}%)`
    })
  }
  else if (current.variant === 'obsidian-liquid-wave' || current.variant === 'liquid-wave') {
    paths.forEach((path, index) => path.setAttribute('d', wavePath(p, current.leg, delays[index] ?? [], current.ease)))
  }
  else if (current.variant === 'cross-fade' && viewRef.value) {
    viewRef.value.style.opacity = String(clampProgress(current.leg === 'leave' ? 1 - eased : eased))
  }
}

function frame(now: number): void {
  raf = undefined
  const current = run
  if (!current || !activity.active.value)
    return
  const progress = clampProgress((now - current.start) / (current.duration / 2))
  paint(progress)
  if (progress < 1) {
    raf = requestAnimationFrame(frame)
    return
  }
  if (current.leg === 'enter') {
    finish()
    return
  }
  current.leg = 'enter'
  displayKey.value = current.to
  viewRevision.value++
  phase.value = 'enter'
  // Hold the fully covered frame while Vue removes the outgoing content.
  void nextTick(() => {
    if (run !== current || !mounted)
      return
    current.start = performance.now()
    paint(0)
    if (activity.active.value)
      raf = requestAnimationFrame(frame)
    else
      finish(activity.reduced.value ? 'reduced' : 'inactive')
  })
}

function startPending(): void {
  const current = run
  if (!current || current.started || !mounted || !activity.active.value)
    return
  current.started = true
  cacheEffect()
  current.start = performance.now()
  paint(0)
  raf = requestAnimationFrame(frame)
}

function request(reason: MotionTransitionReason): void {
  if (run)
    finish('interrupted')
  const resolved = resolveTransition(props.transition, activity.reduced.value)
  const duration = Math.max(0, props.duration ?? resolved.duration) / Math.max(0.01, props.speed)
  const current = { from: displayKey.value, to: props.modelValue, variant: props.variant, reason, duration, ease: resolveCssEase(resolved.easing), started: false, start: 0, leg: 'leave' as const }
  run = current
  renderVariant.value = props.variant
  phase.value = 'leave'
  if (mounted && stageRef.value?.contains(document.activeElement)) {
    focusAfterSwap = true
    stageRef.value.focus({ preventScroll: true })
  }
  emit('start', { from: current.from, to: current.to, variant: current.variant, reason })
  if (!visible.value)
    finish('closed')
  else if (activity.reduced.value)
    finish('reduced')
  else if (props.disabled || duration === 0 || (mounted && document.visibilityState !== 'visible') || (reason !== 'open' && !activity.active.value))
    finish('inactive')
  else
    void nextTick(startPending)
}

function replay(): void { request('replay') }
function close(): void { requestClose('api') }
function requestClose(reason: 'button' | 'escape' | 'mask' | 'api'): void {
  if (!overlay.value || !props.open)
    return
  finish('closed')
  emit('update:open', false)
  emit('close', reason)
}

function restoreFocus(): void {
  if (previousFocus?.isConnected)
    previousFocus.focus({ preventScroll: true })
  previousFocus = null
  focusAfterSwap = false
}

function handleKeydown(event: KeyboardEvent): void {
  const root = dialogRef.value
  if (!props.open || !root || event.defaultPrevented || !isTopmostModalDialog(root))
    return
  if (event.key === 'Escape' && props.escapeClosable) {
    event.preventDefault()
    event.stopPropagation()
    requestClose('escape')
  }
  else if (event.key === 'Tab') {
    const focusable = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => !el.closest('[inert]') && el.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (!first || !last) {
      event.preventDefault()
      root.focus({ preventScroll: true })
    }
    else if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
      event.preventDefault()
      last.focus({ preventScroll: true })
    }
    else if (!event.shiftKey && (active === last || active === root || !root.contains(active))) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }
}

function listen(): void {
  if (listening || !mounted || !overlay.value || !props.open)
    return
  document.addEventListener('keydown', handleKeydown)
  listening = true
}
function unlisten(): void {
  if (listening)
    document.removeEventListener('keydown', handleKeydown)
  listening = false
}
function openDialog(): void {
  if (!mounted || !overlay.value || !props.open)
    return
  zIndex.value = allocator.next()
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  listen()
  void nextTick(() => {
    if (!mounted || !overlay.value || !props.open)
      return
    dialogRef.value?.focus({ preventScroll: true })
    request('open')
  })
}

watch(() => [props.modelValue, props.replayKey, props.variant] as const, (value, old) => {
  request(value[0] !== old[0] ? 'change' : 'replay')
}, { flush: 'post' })
watch(() => [props.open, overlay.value] as const, ([open, isOverlay], [wasOpen, wasOverlay]) => {
  if (wasOpen && wasOverlay) {
    finish('closed')
    unlisten()
    restoreFocus()
  }
  if (open && isOverlay)
    openDialog()
}, { flush: 'post' })
watch(() => [activity.active.value, activity.visible.value] as const, ([active, observedVisible]) => {
  if (active)
    void nextTick(startPending)
  else if (run?.started || (run && observedVisible))
    finish(activity.reduced.value ? 'reduced' : 'inactive')
})
watch(() => [activity.reduced.value, props.disabled] as const, ([reduced, disabled]) => {
  if (reduced || disabled)
    finish(reduced ? 'reduced' : 'inactive')
})
onMounted(() => { mounted = true; openDialog() })
onActivated(() => {
  if (suspended) {
    suspended = false
    openDialog()
  }
})
onDeactivated(() => { suspended = true; finish('inactive'); unlisten(); restoreFocus() })
onBeforeUnmount(() => {
  stopFrame()
  run = undefined
  mounted = false
  unlisten()
  restoreFocus()
})
function beforeDialogEnter(element: Element): void {
  if (!overlay.value || !(element instanceof HTMLElement))
    return
  element.inert = false
  element.removeAttribute('aria-hidden')
}

function beforeDialogLeave(element: Element): void {
  if (!overlay.value || !(element instanceof HTMLElement))
    return
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
}

defineExpose({ replay, finish: () => finish(), close })
</script>

<template>
  <Teleport to="body" :disabled="!overlay">
    <Transition name="tx-motion-transition-dialog" :css="overlay && !disabled && duration !== 0 && !activity.reduced.value" @before-enter="beforeDialogEnter" @before-leave="beforeDialogLeave" @leave-cancelled="beforeDialogEnter">
    <div
      v-if="visible"
      v-bind="$attrs"
      ref="dialogRef"
      class="tx-motion-transition"
      :class="[`tx-motion-transition--${mode}`, `tx-motion-transition--${size}`]"
      :style="overlay ? { zIndex, '--tx-motion-transition-width': width } : undefined"
      :role="overlay ? 'dialog' : undefined"
      :aria-modal="overlay ? true : undefined"
      :aria-labelledby="overlay && title && !$slots.header ? titleId : undefined"
      :aria-label="overlay && (!title || $slots.header) ? ariaLabel : undefined"
      :tabindex="overlay ? -1 : undefined"
      @click.self="overlay && maskClosable && requestClose('mask')"
    >
      <div class="tx-motion-transition__panel">
        <header v-if="title || $slots.header || (overlay && closable)" class="tx-motion-transition__header">
          <slot name="header" v-bind="slotProps">
            <h3 v-if="title" :id="titleId">
{{ title }}
</h3>
          </slot>
          <button v-if="overlay && closable" type="button" class="tx-motion-transition__close" :aria-label="closeLabel" @click="requestClose('button')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div :id="stageId" ref="stageRef" class="tx-motion-transition__stage" :class="`tx-motion-transition__stage--${renderVariant}`" :aria-busy="running" tabindex="-1" :data-phase="phase" :data-content-key="displayKey">
          <ContentView :key="viewRevision" :frozen="phase === 'leave'" :inert="running ? true : undefined" />
          <template v-if="running">
            <svg v-if="wave" ref="waveRef" class="tx-motion-transition__wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path v-for="layer in 3" :key="layer" :class="`tx-motion-transition__wave-layer--${layer}`" d="M 0 100 V 100 H 100 Z" />
            </svg>
            <div v-else-if="doors" ref="effectRef" class="tx-motion-transition__effect tx-motion-transition__doors" :class="{ 'tx-motion-transition__doors--french': renderVariant === 'french-doors-3d' }" aria-hidden="true">
              <div v-for="side in 2" :key="side" class="tx-motion-transition__door">
<span v-if="renderVariant === 'french-doors-3d'" class="tx-motion-transition__door-pane" />
</div>
            </div>
            <div v-else-if="renderVariant === 'staggered-glass-curtain' || renderVariant === 'double-stairs'" ref="effectRef" class="tx-motion-transition__effect tx-motion-transition__columns" :class="{ 'tx-motion-transition__columns--glass': renderVariant === 'staggered-glass-curtain' }" aria-hidden="true">
              <div v-for="column in 5" :key="column" class="tx-motion-transition__column" />
            </div>
            <div v-else-if="renderVariant === 'radial-iris-mask'" ref="effectRef" class="tx-motion-transition__effect tx-motion-transition__iris" aria-hidden="true" />
          </template>
        </div>
        <footer v-if="$slots.footer" class="tx-motion-transition__footer">
<slot name="footer" v-bind="slotProps" />
</footer>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.tx-motion-transition {
  --tx-motion-transition-pad: 16px;
  --tx-motion-transition-radius: 16px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  &--xs { --tx-motion-transition-pad: 8px; --tx-motion-transition-radius: 8px; }
  &--sm { --tx-motion-transition-pad: 12px; --tx-motion-transition-radius: 12px; }
  &--lg { --tx-motion-transition-pad: 24px; --tx-motion-transition-radius: 24px; }
  &--modal, &--overlay { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 40%, transparent); }
  &--overlay { padding: 0; align-items: stretch; }
}
.tx-motion-transition__panel { min-width: 0; }
.tx-motion-transition--card .tx-motion-transition__panel,
.tx-motion-transition--modal .tx-motion-transition__panel,
.tx-motion-transition--overlay .tx-motion-transition__panel { background: var(--tx-bg-color-overlay, #fff); border-radius: var(--tx-motion-transition-radius); box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); overflow: hidden; }
.tx-motion-transition--modal .tx-motion-transition__panel { width: min(var(--tx-motion-transition-width, 640px), 100%); max-height: calc(100dvh - 40px); display: flex; flex-direction: column; }
.tx-motion-transition--overlay .tx-motion-transition__panel { width: 100%; height: 100%; border-radius: 0; display: flex; flex-direction: column; }
.tx-motion-transition__header, .tx-motion-transition__footer { display: flex; align-items: center; gap: 12px; padding: calc(var(--tx-motion-transition-pad) * .75) var(--tx-motion-transition-pad); flex: none; }
.tx-motion-transition__header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.tx-motion-transition__close { margin-left: auto; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; padding: 0; color: var(--tx-text-color-regular, #606266); background: var(--tx-fill-color-light, #f5f7fa); cursor: pointer; }
.tx-motion-transition__close:hover { background: var(--tx-fill-color, #f0f2f5); }
.tx-motion-transition__close:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 2px; }
.tx-motion-transition__stage { position: relative; isolation: isolate; overflow: hidden; min-height: 160px; perspective: 1200px; background: var(--tx-bg-color, #fff); border-radius: inherit; }
.tx-motion-transition--modal .tx-motion-transition__stage,
.tx-motion-transition--overlay .tx-motion-transition__stage { flex: 1; min-height: 0; overflow: auto; }
.tx-motion-transition__stage[data-phase='leave'], .tx-motion-transition__stage[data-phase='enter'] { overflow: hidden; }
.tx-motion-transition__stage:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: -2px; }
.tx-motion-transition__stage--french-doors-3d { perspective: 1400px; }
.tx-motion-transition__stage--perspective-flip-stage { perspective: 1000px; }
.tx-motion-transition__stage :deep(.tx-motion-transition__view) { min-height: inherit; padding: var(--tx-motion-transition-pad); transform-origin: center; backface-visibility: hidden; background: var(--tx-bg-color, #fff); }
.tx-motion-transition__stage--perspective-flip-stage :deep(.tx-motion-transition__view) { box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); }
.tx-motion-transition__effect, .tx-motion-transition__wave { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: hidden; }
.tx-motion-transition__doors, .tx-motion-transition__columns { display: flex; perspective: inherit; }
.tx-motion-transition__door, .tx-motion-transition__column { flex: 1; height: 100%; background: var(--tx-motion-transition-surface, var(--tx-bg-color-overlay, #fff)); box-shadow: inset -1px 0 var(--tx-border-color, #dcdfe6); }
.tx-motion-transition__door { transform-origin: left; transform: translateX(-10%) rotateY(-85deg); }
.tx-motion-transition__door:last-child { transform-origin: right; transform: translateX(10%) rotateY(85deg); }
.tx-motion-transition__doors--french .tx-motion-transition__door { transform-origin: right; transform: rotateY(90deg); opacity: 0; }
.tx-motion-transition__doors--french .tx-motion-transition__door:last-child { transform-origin: left; transform: rotateY(-90deg); }
.tx-motion-transition__door-pane { display: block; margin: 10%; width: 80%; height: 80%; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); background: var(--tx-fill-color-light, #f5f7fa); }
.tx-motion-transition__column { transform: translateY(-105%); }
.tx-motion-transition__columns--glass .tx-motion-transition__column { background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 95%, transparent); backdrop-filter: blur(12px); }
.tx-motion-transition__iris { clip-path: circle(0% at 50% 50%); background: var(--tx-motion-transition-surface, var(--tx-bg-color-overlay, #fff)); }
.tx-motion-transition__wave-layer--1 { fill: var(--tx-fill-color-dark, #dcdfe6); opacity: .6; }
.tx-motion-transition__wave-layer--2 { fill: var(--tx-fill-color, #f0f2f5); opacity: .85; }
.tx-motion-transition__wave-layer--3 { fill: var(--tx-motion-transition-surface, var(--tx-bg-color-overlay, #fff)); }
@supports (height: 100dvh) { .tx-motion-transition--overlay { bottom: auto; height: 100dvh; } }
@media (prefers-reduced-motion: no-preference) {
  .tx-motion-transition-dialog-enter-active, .tx-motion-transition-dialog-leave-active { transition: opacity 180ms ease-out; }
  .tx-motion-transition-dialog-enter-active .tx-motion-transition__panel, .tx-motion-transition-dialog-leave-active .tx-motion-transition__panel { transition: scale 180ms ease-out, translate 180ms ease-out; }
  .tx-motion-transition-dialog-enter-from, .tx-motion-transition-dialog-leave-to { opacity: 0; }
  .tx-motion-transition-dialog-enter-from .tx-motion-transition__panel, .tx-motion-transition-dialog-leave-to .tx-motion-transition__panel { scale: .95; translate: 0 10px; }
}
@media (prefers-reduced-motion: reduce) { .tx-motion-transition__effect, .tx-motion-transition__wave { display: none; } }
</style>
