import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import {
  onScopeDispose,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ObjectDirective,
  type Ref
} from 'vue'

/**
 * Phase-locked, low-FPS Web Animations API clock for persistent indicators over
 * translucent / refraction Electron windows.
 *
 * Why: continuous 60-120fps CSS `@keyframes ... infinite` rules force macOS
 * vibrancy / glass compositors to repaint the backdrop every frame. Replacing
 * those loops with stepped WAAPI animations (`steps(16)` on a shared 90ms /
 * ~11.1fps tick grid) anchored to `startTime = 0` (`document.timeline` origin)
 * collapses every concurrent indicator onto the exact same low-frequency ticks,
 * and automatically halts under `prefers-reduced-motion: reduce`, hidden tabs,
 * active window moves (`html.is-window-moving`), TDS reduced-motion tier
 * (`html.tds-reduced-motion`), or Tuff's low-battery motion gate
 * (`html[data-low-battery-motion="1"]`).
 */

export const LIVE_ANIM_CLOCK_ATTR = 'data-live-anim-clock'
export const LIVE_ANIM_STATE_ATTR = 'data-live-anim-state'
export const LIVE_ANIM_ATTR = 'data-live-anim'
export const LIVE_ANIM_STEPS_ATTR = 'data-live-anim-steps'
export const LIVE_ANIM_DURATION_ATTR = 'data-live-anim-duration'
export const LIVE_ANIM_STAGGER_ATTR = 'data-live-anim-stagger'
export const LIVE_ANIM_PAUSED_ATTR = 'data-live-anim-paused'
export const LOW_BATTERY_MOTION_ATTR = 'data-low-battery-motion'
export const WINDOW_MOVING_CLASS = 'is-window-moving'
export const TDS_REDUCED_MOTION_CLASS = 'tds-reduced-motion'

export type LiveAnimationClockState = 'running' | 'paused' | 'suppressed'

/** Shared step interval (90ms ≈ 11.11fps) so all presets align onto one phase grid. */
export const LIVE_ANIM_DEFAULT_TICK_MS = 90
export const LIVE_ANIM_DEFAULT_STEPS = 16
export const LIVE_ANIM_DEFAULT_DURATION_MS = LIVE_ANIM_DEFAULT_STEPS * LIVE_ANIM_DEFAULT_TICK_MS

export type LiveAnimationPresetName = 'pulse' | 'breathe' | 'dot' | 'bar' | 'spin' | 'shimmer'

export interface LiveAnimationPreset {
  /** Compositor-only keyframes (`opacity`, `translate`, `scale`, `rotate`). */
  keyframes: Keyframe[]
  /** Cycle duration in ms. Paired with `steps` on the shared 90ms tick grid. */
  duration: number
  /** Discrete steps per cycle for WAAPI `steps(n)` easing. */
  steps: number
  /** Per-slot phase stagger in ms (an exact multiple of `duration / steps`). */
  staggerStepMs?: number
}

export const LIVE_ANIM_PRESETS: Readonly<Record<LiveAnimationPresetName, LiveAnimationPreset>> =
  Object.freeze({
    pulse: {
      keyframes: [{ opacity: 0.42 }, { opacity: 1 }, { opacity: 0.42 }],
      duration: LIVE_ANIM_DEFAULT_DURATION_MS,
      steps: LIVE_ANIM_DEFAULT_STEPS
    },
    breathe: {
      keyframes: [
        { opacity: 0.52, scale: '0.94' },
        { opacity: 1, scale: '1' },
        { opacity: 0.52, scale: '0.94' }
      ],
      duration: LIVE_ANIM_DEFAULT_DURATION_MS,
      steps: LIVE_ANIM_DEFAULT_STEPS
    },
    dot: {
      keyframes: [
        { translate: '0 0', opacity: 0.45 },
        { translate: '0 -3px', opacity: 1, offset: 0.375 },
        { translate: '0 0', opacity: 0.45, offset: 0.75 },
        { translate: '0 0', opacity: 0.45 }
      ],
      duration: LIVE_ANIM_DEFAULT_DURATION_MS,
      steps: LIVE_ANIM_DEFAULT_STEPS,
      staggerStepMs: LIVE_ANIM_DEFAULT_TICK_MS * 2
    },
    bar: {
      keyframes: [
        { scale: '1 0.38', opacity: 0.45 },
        { scale: '1 1', opacity: 1, offset: 0.4375 },
        { scale: '1 0.38', opacity: 0.45 }
      ],
      duration: LIVE_ANIM_DEFAULT_DURATION_MS,
      steps: LIVE_ANIM_DEFAULT_STEPS,
      staggerStepMs: LIVE_ANIM_DEFAULT_TICK_MS * 2
    },
    spin: {
      keyframes: [{ rotate: '0deg' }, { rotate: '360deg' }],
      // 12 steps × 90ms = 1080ms (30deg/step, exact same 90ms tick grid as 16-step presets).
      duration: 12 * LIVE_ANIM_DEFAULT_TICK_MS,
      steps: 12
    },
    shimmer: {
      keyframes: [{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }],
      duration: LIVE_ANIM_DEFAULT_DURATION_MS,
      steps: LIVE_ANIM_DEFAULT_STEPS
    }
  })

export interface LiveAnimationClockOptions {
  /** Override default step count when an element does not declare `data-live-anim-steps`. */
  steps?: number
  /** Target frames per second used to derive `steps` when `steps` is not explicitly set. */
  targetFps?: number
  /** Additional custom presets merged on top of `LIVE_ANIM_PRESETS`. */
  presets?: Partial<Record<string, LiveAnimationPreset>>
}

export interface LiveAnimationClockController {
  /** Temporarily pause all managed WAAPI animations (e.g., native window hidden). */
  pause: () => void
  /** Resume managed animations and re-lock them to `startTime = 0`. */
  resume: () => void
  /** Re-scan the root subtree and reconcile tracked elements. */
  refresh: () => void
  /** Cancel all managed animations, disconnect observers, and remove listeners. */
  dispose: () => void
  /** Whether animations are currently paused (hidden document, window moving, or manual pause). */
  isPaused: () => boolean
  /** Whether motion is suppressed (`prefers-reduced-motion: reduce`, `html.tds-reduced-motion`, or low-battery mode). */
  isSuppressed: () => boolean
  /** Current projected clock state (`'running'`, `'paused'`, or `'suppressed'`). */
  getState: () => LiveAnimationClockState
  /** Current number of live WAAPI animations owned by this controller. */
  activeCount: () => number
}

interface ResolvedAnimationSpec {
  presetName: string
  keyframes: Keyframe[]
  duration: number
  steps: number
  delay: number
  signature: string
}

interface TrackedAnimation {
  animation: Animation
  signature: string
  paused: boolean
}

const OBSERVED_ELEMENT_ATTRIBUTES = [
  LIVE_ANIM_ATTR,
  LIVE_ANIM_STEPS_ATTR,
  LIVE_ANIM_DURATION_ATTR,
  LIVE_ANIM_STAGGER_ATTR,
  LIVE_ANIM_PAUSED_ATTR
]

const LIVE_ANIM_SELECTOR = `[${LIVE_ANIM_ATTR}]`

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function parsePositiveNumberAttr(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name)
  if (raw === null || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return isPositiveFinite(parsed) ? parsed : undefined
}

function parseStaggerIndexAttr(el: Element): number {
  const raw = el.getAttribute(LIVE_ANIM_STAGGER_ATTR)
  if (raw === null || raw.trim() === '') return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isElementPaused(el: Element): boolean {
  const raw = el.getAttribute(LIVE_ANIM_PAUSED_ATTR)
  return raw === 'true' || raw === '1' || raw === ''
}

function resolveRootElement(root?: HTMLElement | Document | null): HTMLElement | null {
  if (!root) {
    if (!hasDocument()) return null
    return document.documentElement ?? document.body ?? null
  }
  if ('nodeType' in root && root.nodeType === 9) {
    const doc = root as Document
    return doc.documentElement ?? doc.body ?? null
  }
  return root as HTMLElement
}

function getWindowForDocument(doc: Document | null | undefined): Window | null {
  if (doc?.defaultView) return doc.defaultView
  return hasWindow() ? window : null
}

function readReducedMotion(win: Window | null): MediaQueryList | null {
  if (!win || typeof win.matchMedia !== 'function') return null
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)')
  } catch {
    return null
  }
}

function isLowBatteryMotionActive(doc: Document | null | undefined): boolean {
  return doc?.documentElement?.getAttribute(LOW_BATTERY_MOTION_ATTR) === '1'
}

function isWindowMovingActive(doc: Document | null | undefined): boolean {
  return Boolean(doc?.documentElement?.classList.contains(WINDOW_MOVING_CLASS))
}

function isTdsReducedMotionActive(doc: Document | null | undefined): boolean {
  return Boolean(doc?.documentElement?.classList.contains(TDS_REDUCED_MOTION_CLASS))
}

/**
 * Tracks standalone per-element clocks created before an ancestor host clock
 * mounts (e.g. child `mounted` firing before `AppShell.onMounted`). When a host
 * clock scans the element it releases the temporary local clock first so there
 * is never a duplicate WAAPI animation or leaked observer.
 */
const standaloneClockReleasers = new WeakMap<HTMLElement, () => void>()

function canAnimateElement(el: HTMLElement): boolean {
  return typeof el.animate === 'function'
}

function lockPhaseOrigin(animation: Animation): void {
  try {
    animation.startTime = 0
  } catch {
    // Some test stubs or restricted timelines may not allow mutating `startTime`.
  }
}

function safeCancel(animation: Animation): void {
  try {
    animation.cancel()
  } catch {
    // Ignore cancel errors on detached/mocked animations.
  }
}

function safePause(animation: Animation): void {
  try {
    if (typeof animation.pause === 'function') {
      animation.pause()
    }
  } catch {
    // Ignore pause errors on mocked animations.
  }
}

function safePlayPhaseLocked(animation: Animation): void {
  try {
    if (typeof animation.play === 'function') {
      animation.play()
    }
  } catch {
    // Ignore play errors on mocked animations.
  }
  lockPhaseOrigin(animation)
}

function computeSteps(
  baseSteps: number,
  durationMs: number,
  attrSteps: number | undefined,
  options: LiveAnimationClockOptions | undefined
): number {
  if (isPositiveFinite(attrSteps)) {
    return Math.max(2, Math.round(attrSteps))
  }
  if (isPositiveFinite(options?.steps)) {
    return Math.max(2, Math.round(options.steps))
  }
  if (isPositiveFinite(options?.targetFps)) {
    return Math.max(2, Math.round((durationMs / 1000) * options.targetFps))
  }
  return Math.max(2, Math.round(baseSteps))
}

function resolveElementSpec(
  el: HTMLElement,
  presets: Record<string, LiveAnimationPreset>,
  options: LiveAnimationClockOptions | undefined
): ResolvedAnimationSpec | null {
  const presetName = el.getAttribute(LIVE_ANIM_ATTR)?.trim()
  if (!presetName || presetName === 'none' || isElementPaused(el)) {
    return null
  }

  const preset = presets[presetName]
  if (!preset) {
    return null
  }

  const attrDuration = parsePositiveNumberAttr(el, LIVE_ANIM_DURATION_ATTR)
  const attrSteps = parsePositiveNumberAttr(el, LIVE_ANIM_STEPS_ATTR)
  const duration = Math.max(100, Math.round(attrDuration ?? preset.duration))
  const steps = computeSteps(preset.steps, duration, attrSteps, options)
  const staggerIndex = parseStaggerIndexAttr(el)

  // Quantize stagger delay onto exact step multiples so staggered dots/bars
  // still wake the compositor on the exact same tick boundary.
  const stepMs = duration / steps
  const rawStaggerMs = staggerIndex > 0 ? staggerIndex * (preset.staggerStepMs ?? stepMs * 2) : 0
  const quantizedStaggerMs = rawStaggerMs > 0 ? Math.round(rawStaggerMs / stepMs) * stepMs : 0
  const delay = quantizedStaggerMs > 0 ? -quantizedStaggerMs : 0

  return {
    presetName,
    keyframes: preset.keyframes,
    duration,
    steps,
    delay,
    signature: `${presetName}|${duration}|${steps}|${delay}`
  }
}

function startSteppedAnimation(el: HTMLElement, spec: ResolvedAnimationSpec): Animation | null {
  if (!canAnimateElement(el)) return null

  try {
    const animation = el.animate(spec.keyframes, {
      duration: spec.duration,
      iterations: Number.POSITIVE_INFINITY,
      easing: `steps(${spec.steps})`,
      delay: spec.delay
    })
    if (!animation) return null
    lockPhaseOrigin(animation)
    return animation
  } catch {
    return null
  }
}

function createNoopController(): LiveAnimationClockController {
  return {
    pause: () => {},
    resume: () => {},
    refresh: () => {},
    dispose: () => {},
    isPaused: () => true,
    isSuppressed: () => true,
    getState: () => 'suppressed',
    activeCount: () => 0
  }
}

/**
 * Installs a phase-locked, low-FPS WAAPI animation clock on `root` (defaults to
 * `document.documentElement`).
 *
 * Elements inside `root` declare `data-live-anim="<preset>"` (`pulse`, `breathe`,
 * `dot`, `bar`, `spin`, `shimmer`) and are automatically discovered, synchronized
 * to `startTime = 0`, paused when hidden, cancelled under reduced-motion or
 * low-battery mode, and cleaned up on DOM removal or `dispose()`.
 */
export function installLiveAnimationClock(
  root?: HTMLElement | Document | null,
  options?: LiveAnimationClockOptions
): LiveAnimationClockController {
  const resolvedRoot = resolveRootElement(root)
  if (!resolvedRoot) {
    return createNoopController()
  }
  const rootEl: HTMLElement = resolvedRoot

  const doc = rootEl.ownerDocument ?? (hasDocument() ? document : null)
  const win = getWindowForDocument(doc)
  const presets: Record<string, LiveAnimationPreset> = {
    ...LIVE_ANIM_PRESETS,
    ...(options?.presets ?? {})
  }

  const tracked = new Map<HTMLElement, TrackedAnimation>()
  const mediaQuery = readReducedMotion(win)

  let disposed = false
  let manualPaused = false
  let reducedMotion = Boolean(mediaQuery?.matches)
  let tdsReducedMotion = isTdsReducedMotionActive(doc)
  let lowBattery = isLowBatteryMotionActive(doc)
  let windowMoving = isWindowMovingActive(doc)
  let documentHidden = Boolean(doc?.hidden)

  const isSuppressed = (): boolean => reducedMotion || tdsReducedMotion || lowBattery
  const isPaused = (): boolean => manualPaused || documentHidden || windowMoving
  const getState = (): LiveAnimationClockState => {
    if (isSuppressed()) return 'suppressed'
    if (isPaused()) return 'paused'
    return 'running'
  }

  function syncRootStateAttr(): void {
    const nextState = getState()
    if (rootEl.getAttribute(LIVE_ANIM_STATE_ATTR) !== nextState) {
      rootEl.setAttribute(LIVE_ANIM_STATE_ATTR, nextState)
    }
  }

  function detachElement(el: HTMLElement): void {
    const entry = tracked.get(el)
    if (!entry) return
    tracked.delete(el)
    safeCancel(entry.animation)
  }

  function cancelAll(): void {
    for (const entry of tracked.values()) {
      safeCancel(entry.animation)
    }
    tracked.clear()
  }

  function pauseAll(): void {
    for (const entry of tracked.values()) {
      if (!entry.paused) {
        safePause(entry.animation)
        entry.paused = true
      }
    }
  }

  function syncElement(el: HTMLElement): void {
    if (disposed) return

    if (el !== rootEl) {
      const releaseStandalone = standaloneClockReleasers.get(el)
      if (releaseStandalone) {
        releaseStandalone()
      }
    }

    if (!el.isConnected || isSuppressed()) {
      detachElement(el)
      return
    }

    const spec = resolveElementSpec(el, presets, options)
    if (!spec) {
      detachElement(el)
      return
    }

    const existing = tracked.get(el)
    if (existing && existing.signature === spec.signature) {
      if (isPaused()) {
        if (!existing.paused) {
          safePause(existing.animation)
          existing.paused = true
        }
      } else if (existing.paused) {
        safePlayPhaseLocked(existing.animation)
        existing.paused = false
      }
      return
    }

    if (existing) {
      detachElement(el)
    }

    // Do not allocate a new WAAPI animation while hidden or manually paused;
    // `reconcileAll()` attaches it with `startTime = 0` as soon as visibility returns.
    if (isPaused()) return

    const animation = startSteppedAnimation(el, spec)
    if (!animation) return

    tracked.set(el, { animation, signature: spec.signature, paused: false })
  }

  function syncSubtree(node: Node): void {
    if (disposed || node.nodeType !== 1) return
    const el = node as HTMLElement
    if (el.hasAttribute(LIVE_ANIM_ATTR)) {
      syncElement(el)
    }
    const descendants = el.querySelectorAll<HTMLElement>(LIVE_ANIM_SELECTOR)
    for (const child of descendants) {
      syncElement(child)
    }
  }

  function pruneDisconnected(removedNode?: Node): void {
    for (const el of Array.from(tracked.keys())) {
      if (!el.isConnected || (removedNode && removedNode.contains(el))) {
        detachElement(el)
      }
    }
  }

  function reconcileAll(): void {
    if (disposed) return
    syncRootStateAttr()
    if (isSuppressed()) {
      cancelAll()
      return
    }
    if (isPaused()) {
      pauseAll()
      return
    }

    pruneDisconnected()
    syncSubtree(rootEl)
  }

  // Mark the root so child components (e.g. TxAiThinking) know whether the host
  // WAAPI clock is active and should suppress fallback CSS keyframes. When the
  // runtime lacks `Element.prototype.animate`, mark `unsupported` so CSS fallbacks
  // remain legible instead of disappearing.
  const previousClockAttr = rootEl.getAttribute(LIVE_ANIM_CLOCK_ATTR)
  const previousStateAttr = rootEl.getAttribute(LIVE_ANIM_STATE_ATTR)
  rootEl.setAttribute(LIVE_ANIM_CLOCK_ATTR, canAnimateElement(rootEl) ? 'active' : 'unsupported')

  // Initial scan
  reconcileAll()

  // Observe DOM additions, removals, and live-anim attribute changes inside `rootEl`.
  let domObserver: MutationObserver | null = null
  if (typeof MutationObserver !== 'undefined') {
    domObserver = new MutationObserver((mutations) => {
      if (disposed) return
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target.nodeType === 1) {
            syncElement(mutation.target as HTMLElement)
          }
          continue
        }

        if (mutation.type === 'childList') {
          for (const removed of mutation.removedNodes) {
            if (removed.nodeType === 1) {
              pruneDisconnected(removed)
            }
          }
          for (const added of mutation.addedNodes) {
            syncSubtree(added)
          }
        }
      }
    })
    domObserver.observe(rootEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: OBSERVED_ELEMENT_ATTRIBUTES
    })
  }

  // Observe Tuff's global motion gates on `<html>` (low-battery, TDS reduced-motion, window-moving).
  let htmlStateObserver: MutationObserver | null = null
  const htmlEl = doc?.documentElement ?? null
  if (htmlEl && typeof MutationObserver !== 'undefined') {
    htmlStateObserver = new MutationObserver(() => {
      if (disposed) return
      const nextLowBattery = isLowBatteryMotionActive(doc)
      const nextTdsReduced = isTdsReducedMotionActive(doc)
      const nextWindowMoving = isWindowMovingActive(doc)
      if (
        nextLowBattery === lowBattery &&
        nextTdsReduced === tdsReducedMotion &&
        nextWindowMoving === windowMoving
      ) {
        return
      }
      lowBattery = nextLowBattery
      tdsReducedMotion = nextTdsReduced
      windowMoving = nextWindowMoving
      reconcileAll()
    })
    htmlStateObserver.observe(htmlEl, {
      attributes: true,
      attributeFilter: [LOW_BATTERY_MOTION_ATTR, 'class']
    })
  }

  const handleVisibilityChange = (): void => {
    if (disposed) return
    documentHidden = Boolean(doc?.hidden)
    reconcileAll()
  }
  doc?.addEventListener('visibilitychange', handleVisibilityChange)

  const handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (disposed) return
    reducedMotion = Boolean(event.matches)
    reconcileAll()
  }
  if (mediaQuery) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleReducedMotionChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleReducedMotionChange)
    }
  }

  return {
    pause() {
      if (disposed || manualPaused) return
      manualPaused = true
      syncRootStateAttr()
      pauseAll()
    },
    resume() {
      if (disposed || !manualPaused) return
      manualPaused = false
      reconcileAll()
    },
    refresh() {
      reconcileAll()
    },
    dispose() {
      if (disposed) return
      disposed = true

      cancelAll()
      domObserver?.disconnect()
      domObserver = null
      htmlStateObserver?.disconnect()
      htmlStateObserver = null

      doc?.removeEventListener('visibilitychange', handleVisibilityChange)
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleReducedMotionChange)
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(handleReducedMotionChange)
        }
      }

      if (previousClockAttr === null) {
        rootEl.removeAttribute(LIVE_ANIM_CLOCK_ATTR)
      } else {
        rootEl.setAttribute(LIVE_ANIM_CLOCK_ATTR, previousClockAttr)
      }

      if (previousStateAttr === null) {
        rootEl.removeAttribute(LIVE_ANIM_STATE_ATTR)
      } else {
        rootEl.setAttribute(LIVE_ANIM_STATE_ATTR, previousStateAttr)
      }
    },
    isPaused,
    isSuppressed,
    getState,
    activeCount: () => tracked.size
  }
}

export interface LiveAnimationBindingConfig {
  preset: LiveAnimationPresetName | 'none'
  active?: boolean
  steps?: number
  duration?: number
  stagger?: number
}

export type LiveAnimationDirectiveValue =
  | LiveAnimationPresetName
  | 'none'
  | false
  | null
  | undefined
  | LiveAnimationBindingConfig

interface NormalizedBinding {
  preset: LiveAnimationPresetName | 'none'
  active: boolean
  steps?: number
  duration?: number
  stagger?: number
}

function normalizeLiveAnimationBinding(value: LiveAnimationDirectiveValue): NormalizedBinding {
  if (!value || value === 'none') {
    return { preset: 'none', active: false }
  }
  if (typeof value === 'string') {
    return { preset: value, active: true }
  }
  return {
    preset: value.preset,
    active: value.active ?? true,
    steps: value.steps,
    duration: value.duration,
    stagger: value.stagger
  }
}

function clearLiveAnimationAttrs(el: HTMLElement): void {
  el.removeAttribute(LIVE_ANIM_ATTR)
  el.removeAttribute(LIVE_ANIM_STEPS_ATTR)
  el.removeAttribute(LIVE_ANIM_DURATION_ATTR)
  el.removeAttribute(LIVE_ANIM_STAGGER_ATTR)
  el.removeAttribute(LIVE_ANIM_PAUSED_ATTR)
}

function applyLiveAnimationAttrs(el: HTMLElement, binding: NormalizedBinding): void {
  el.setAttribute(LIVE_ANIM_ATTR, binding.preset)
  if (isPositiveFinite(binding.steps)) {
    el.setAttribute(LIVE_ANIM_STEPS_ATTR, String(Math.round(binding.steps)))
  } else {
    el.removeAttribute(LIVE_ANIM_STEPS_ATTR)
  }
  if (isPositiveFinite(binding.duration)) {
    el.setAttribute(LIVE_ANIM_DURATION_ATTR, String(Math.round(binding.duration)))
  } else {
    el.removeAttribute(LIVE_ANIM_DURATION_ATTR)
  }
  if (
    typeof binding.stagger === 'number' &&
    Number.isFinite(binding.stagger) &&
    binding.stagger > 0
  ) {
    el.setAttribute(LIVE_ANIM_STAGGER_ATTR, String(binding.stagger))
  } else {
    el.removeAttribute(LIVE_ANIM_STAGGER_ATTR)
  }
}

function isManagedByHostClock(el: HTMLElement): boolean {
  return Boolean(el.parentElement?.closest(`[${LIVE_ANIM_CLOCK_ATTR}="active"]`))
}

interface StandaloneClockEntry {
  clock: LiveAnimationClockController
  release: () => void
}

function createStandaloneClock(el: HTMLElement, onRelease: () => void): StandaloneClockEntry {
  const clock = installLiveAnimationClock(el)
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    if (standaloneClockReleasers.get(el) === release) {
      standaloneClockReleasers.delete(el)
    }
    clock.dispose()
    onRelease()
  }
  standaloneClockReleasers.set(el, release)
  return { clock, release }
}

/**
 * Imperatively attaches a DOM element onto the phase-locked live animation clock.
 * Delegates purely via `data-live-anim*` attributes when inside an active host clock
 * (`installLiveAnimationClock`), or installs a self-cleaning standalone clock otherwise.
 * Returns a cleanup callback that clears attributes and stops any standalone clock.
 */
export function attachLiveAnimation(
  el: HTMLElement,
  binding: LiveAnimationDirectiveValue
): () => void {
  const normalized = normalizeLiveAnimationBinding(binding)
  let standalone: StandaloneClockEntry | null = null

  if (!normalized.active || normalized.preset === 'none') {
    clearLiveAnimationAttrs(el)
    return () => {
      clearLiveAnimationAttrs(el)
    }
  }

  applyLiveAnimationAttrs(el, normalized)
  if (!isManagedByHostClock(el)) {
    standalone = createStandaloneClock(el, () => {
      standalone = null
    })
  }

  return () => {
    clearLiveAnimationAttrs(el)
    standalone?.release()
    standalone = null
  }
}

const directiveEntries = new WeakMap<HTMLElement, StandaloneClockEntry>()

function syncDirectiveElement(el: HTMLElement, value: LiveAnimationDirectiveValue): void {
  const normalized = normalizeLiveAnimationBinding(value)
  const existing = directiveEntries.get(el)

  if (!normalized.active || normalized.preset === 'none') {
    clearLiveAnimationAttrs(el)
    existing?.release()
    return
  }

  applyLiveAnimationAttrs(el, normalized)
  if (isManagedByHostClock(el)) {
    existing?.release()
    return
  }

  if (existing) {
    existing.clock.refresh()
    return
  }

  const entry = createStandaloneClock(el, () => {
    if (directiveEntries.get(el) === entry) {
      directiveEntries.delete(el)
    }
  })
  directiveEntries.set(el, entry)
}

/**
 * Lightweight Vue 3 directive (`v-tds-live-animation`) that binds an element onto
 * CoreApp's 90ms phase-locked live animation clock.
 *
 * Accepts a preset name (`'spin'`, `'pulse'`, `'breathe'`, `'dot'`, `'bar'`, `'shimmer'`),
 * `'none' | false | null | undefined` to stop, or a `{ preset, active?, steps?, duration?, stagger? }`
 * configuration object.
 */
export const vTdsLiveAnimation: ObjectDirective<HTMLElement, LiveAnimationDirectiveValue> = {
  mounted(el, binding) {
    syncDirectiveElement(el, binding.value)
  },
  updated(el, binding) {
    syncDirectiveElement(el, binding.value)
  },
  beforeUnmount(el) {
    clearLiveAnimationAttrs(el)
    directiveEntries.get(el)?.release()
  }
}

export interface UseLiveAnimationOptions {
  preset: MaybeRefOrGetter<LiveAnimationPresetName | 'none'>
  active?: MaybeRefOrGetter<boolean>
  steps?: MaybeRefOrGetter<number | undefined>
  duration?: MaybeRefOrGetter<number | undefined>
  stagger?: MaybeRefOrGetter<number | undefined>
}

/**
 * Vue 3 composable that binds a single element ref onto the phase-locked live
 * animation clock. When an ancestor host clock (`installLiveAnimationClock`) is
 * active, it delegates animation ownership purely via `data-live-anim*` attributes
 * so there is never a duplicate WAAPI instance. When used standalone without a
 * host clock, it installs a scoped self-cleaning clock on the target element.
 */
export function useLiveAnimation(
  target: Ref<HTMLElement | null | undefined>,
  options: UseLiveAnimationOptions
): { stop: () => void } {
  let localEntry: StandaloneClockEntry | null = null
  let localEl: HTMLElement | null = null

  function disposeLocal(): void {
    localEntry?.release()
    localEntry = null
    localEl = null
  }

  function sync(): void {
    const el = target.value
    if (!el) {
      disposeLocal()
      return
    }

    const normalized: NormalizedBinding = {
      active: options.active === undefined ? true : Boolean(toValue(options.active)),
      preset: toValue(options.preset),
      steps: toValue(options.steps),
      duration: toValue(options.duration),
      stagger: toValue(options.stagger)
    }

    if (!normalized.active || normalized.preset === 'none') {
      clearLiveAnimationAttrs(el)
      disposeLocal()
      return
    }

    applyLiveAnimationAttrs(el, normalized)

    if (isManagedByHostClock(el)) {
      disposeLocal()
      return
    }

    if (localEl !== el || !localEntry) {
      disposeLocal()
      localEl = el
      localEntry = createStandaloneClock(el, () => {
        localEntry = null
        localEl = null
      })
    } else {
      localEntry.clock.refresh()
    }
  }

  const stopWatch = watch(
    () => [
      target.value,
      toValue(options.preset),
      options.active === undefined ? true : toValue(options.active),
      toValue(options.steps),
      toValue(options.duration),
      toValue(options.stagger)
    ],
    sync,
    { immediate: true, flush: 'post' }
  )

  const stop = (): void => {
    stopWatch()
    const el = target.value
    if (el) {
      clearLiveAnimationAttrs(el)
    }
    disposeLocal()
  }

  onScopeDispose(stop)

  return { stop }
}
