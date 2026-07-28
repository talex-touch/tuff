import type { ComputedRef, Ref } from 'vue'
import type { BaseAnchorAnimationOptions, BaseAnchorAnimationType } from './types'
import { computed } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { clamp01, LIQUID_DEFAULTS, liquidVelocityAt, resolveLiquidEase } from './base-anchor-liquid'

type BaseAnchorSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * `outlineColor` and `triggerRadius` stay optional after resolution: an unset
 * outline colour means "read the border token", an unset radius means "measure
 * the reference". Both are resolved against the DOM, which this module cannot see.
 */
export type ResolvedBaseAnchorAnimation
  = Required<Omit<BaseAnchorAnimationOptions, 'outlineColor' | 'triggerRadius'>>
    & { outlineColor?: string, triggerRadius?: number }

interface GsapTimeline {
  to: (target: unknown, vars: Record<string, unknown>, position?: number) => GsapTimeline
  kill: () => void
}

interface GsapRuntime {
  set: (target: unknown, vars: Record<string, unknown>) => void
  timeline: (options?: { onComplete?: () => void }) => GsapTimeline
}

interface BaseAnchorMotionOptions {
  clipRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
  arrowRef: Ref<HTMLElement | null>
  side: ComputedRef<BaseAnchorSide>
  arrowSize: ComputedRef<number>
  showArrow: ComputedRef<boolean>
  animation: ComputedRef<BaseAnchorAnimationOptions | undefined>
  duration: ComputedRef<number | undefined>
  ease: ComputedRef<string | undefined>
  panelBackground: ComputedRef<string>
  useCard: ComputedRef<boolean>
  keepAliveContent: ComputedRef<boolean>
  isUnlimitedHeight: ComputedRef<boolean>
  isOpen: ComputedRef<boolean>
  isCurrentRun: (runId: number) => boolean
  setMounted: (value: boolean) => void
  setPanelSurfaceMoving: (value: boolean) => void
  pulsePanelSurfaceMoving: (duration?: number) => void

  /**
   * Measure the liquid stage and show it. Returning false means the drop cannot
   * be animated here (no layout, reduced motion, missing nodes) and the caller
   * should snap to the end state instead.
   */
  prepareLiquid: (direction: 'open' | 'close') => boolean
  /**
   * Write one frame of goo geometry for progress `p` (0 closed, 1 open).
   * `velocity` is |dp| per unit of normalised time — 1.0 is a linear ramp —
   * and drives the `bead` pinch.
   */
  applyLiquidFrame: (p: number, velocity?: number) => void
  /** Clear per-item inline opacity; hide the stage when the anchor ends up closed. */
  settleLiquid: (open: boolean) => void
}

/** `drip` and `bead` share one engine; only the sheet's width behaviour differs. */
export function isLiquidType(type: BaseAnchorAnimationType): boolean {
  return type === 'drip' || type === 'bead'
}

/** Shared defaults for the gsap-driven types. liquid brings its own table (LIQUID_DEFAULTS). */
const DEFAULT_ANIMATION: Required<Pick<
  BaseAnchorAnimationOptions,
  'type' | 'duration' | 'closeDuration' | 'ease' | 'closeEase' | 'distance' | 'scale' | 'blur' | 'opacity'
>> = {
  type: 'transfer',
  duration: 432,
  closeDuration: 194.4,
  ease: 'back.out(2)',
  closeEase: 'power3.in',
  distance: 30,
  scale: 1.08,
  blur: 12,
  opacity: 0,
}

const LEGACY_CLOSE_DURATION_RATIO = 0.45
const REFRACTION_CLOSE_PREPARE_MS = 180

let gsapRuntime: Promise<GsapRuntime> | null = null

function loadGsap() {
  if (!gsapRuntime) {
    gsapRuntime = import('gsap').then((mod) => {
      const runtime = mod.default ?? (mod as unknown as { gsap?: GsapRuntime }).gsap
      return runtime as GsapRuntime
    })
  }
  return gsapRuntime
}

export function useBaseAnchorMotion(options: BaseAnchorMotionOptions) {
  let tl: GsapTimeline | null = null
  let closePrepareTimer: ReturnType<typeof setTimeout> | null = null
  let liquidFrame: number | null = null

  const resolvedAnimation = computed<ResolvedBaseAnchorAnimation>(() => {
    const animation = options.animation.value ?? {}
    const type = animation.type ?? DEFAULT_ANIMATION.type
    // The legacy `duration` / `ease` props carry transfer-era defaults (432ms,
    // back.out(2)) and are never undefined, so liquid has to bypass them entirely
    // or it would inherit a timing spec it explicitly rejects.
    const isLiquid = isLiquidType(type)

    const duration = isLiquid
      ? Math.max(0, animation.duration ?? LIQUID_DEFAULTS.duration)
      : Math.max(0, animation.duration ?? options.duration.value ?? DEFAULT_ANIMATION.duration)
    const closeDuration = isLiquid
      ? Math.max(0, animation.closeDuration ?? LIQUID_DEFAULTS.closeDuration)
      : Math.max(0, animation.closeDuration ?? duration * LEGACY_CLOSE_DURATION_RATIO)

    return {
      type,
      duration,
      closeDuration,
      ease: isLiquid
        ? (animation.ease ?? LIQUID_DEFAULTS.ease)
        : (animation.ease ?? options.ease.value ?? DEFAULT_ANIMATION.ease),
      closeEase: isLiquid
        ? (animation.closeEase ?? LIQUID_DEFAULTS.closeEase)
        : (animation.closeEase ?? DEFAULT_ANIMATION.closeEase),
      distance: Math.max(0, animation.distance ?? DEFAULT_ANIMATION.distance),
      scale: Math.max(0.01, animation.scale ?? DEFAULT_ANIMATION.scale),
      blur: Math.max(0, animation.blur ?? DEFAULT_ANIMATION.blur),
      opacity: Math.min(1, Math.max(0, animation.opacity ?? DEFAULT_ANIMATION.opacity)),
      gooBlur: Math.max(0.01, animation.gooBlur ?? LIQUID_DEFAULTS.gooBlur),
      gooThreshold: animation.gooThreshold ?? LIQUID_DEFAULTS.gooThreshold,
      gooThresholdOffset: animation.gooThresholdOffset ?? LIQUID_DEFAULTS.gooThresholdOffset,
      seedHeight: Math.max(0, animation.seedHeight ?? LIQUID_DEFAULTS.seedHeight),
      beadPinch: Math.max(0, animation.beadPinch ?? LIQUID_DEFAULTS.beadPinch),
      beadVelocityRef: Math.max(0.01, animation.beadVelocityRef ?? LIQUID_DEFAULTS.beadVelocityRef),
      itemSelector: animation.itemSelector || LIQUID_DEFAULTS.itemSelector,
      outlineColor: animation.outlineColor,
      triggerRadius: animation.triggerRadius,
    }
  })

  const animationType = computed<BaseAnchorAnimationType>(() => resolvedAnimation.value.type)

  /**
   * A drop falls. The liquid motion is only defined on the vertical axis, so a
   * left/right placement degrades to the opacity path rather than rendering a
   * neck that would have to pinch sideways.
   */
  const effectiveAnimationType = computed<BaseAnchorAnimationType>(() => {
    if (!isLiquidType(animationType.value))
      return animationType.value
    const side = options.side.value
    return side === 'top' || side === 'bottom' ? animationType.value : 'opacity'
  })

  const usesLiquidMotion = computed(() => isLiquidType(effectiveAnimationType.value))
  const usesBeadMotion = computed(() => effectiveAnimationType.value === 'bead')
  const isLiquidFallback = computed(
    () => isLiquidType(animationType.value) && !isLiquidType(effectiveAnimationType.value),
  )
  const usesTransferMotion = computed(() => animationType.value === 'transfer')

  const bouncePad = computed(() => {
    if (!usesTransferMotion.value)
      return {}

    const pad = '10px'
    switch (options.side.value) {
      case 'bottom': return { paddingBottom: pad }
      case 'top': return { paddingTop: pad }
      case 'left': return { paddingLeft: pad }
      case 'right': return { paddingRight: pad }
      default: return { paddingBottom: pad }
    }
  })

  function getTranslate() {
    const d = resolvedAnimation.value.distance
    switch (options.side.value) {
      case 'bottom': return { x: 0, y: -d }
      case 'top': return { x: 0, y: d }
      case 'left': return { x: d, y: 0 }
      case 'right': return { x: -d, y: 0 }
      default: return { x: 0, y: -d }
    }
  }

  function getClipPath(progress: number) {
    const p = `${Math.max(0, (1 - progress) * 100)}%`
    switch (options.side.value) {
      case 'bottom': return `inset(0 0 ${p} 0)`
      case 'top': return `inset(${p} 0 0 0)`
      case 'left': return `inset(0 0 0 ${p})`
      case 'right': return `inset(0 ${p} 0 0)`
      default: return `inset(0 0 ${p} 0)`
    }
  }

  function getArrowInsetTranslate() {
    const d = Math.max(4, Math.round(options.arrowSize.value * 0.45))
    switch (options.side.value) {
      case 'bottom': return { x: 0, y: d }
      case 'top': return { x: 0, y: -d }
      case 'left': return { x: -d, y: 0 }
      case 'right': return { x: d, y: 0 }
      default: return { x: 0, y: d }
    }
  }

  function resetClipElement(visible: boolean, overflow: 'visible' | 'hidden' = visible ? 'visible' : 'hidden') {
    const clip = options.clipRef.value
    if (!clip)
      return
    clip.style.visibility = visible ? 'visible' : 'hidden'
    clip.style.clipPath = 'none'
    clip.style.overflow = overflow
    clip.style.willChange = 'auto'
  }

  function resetContentElement() {
    const content = options.contentRef.value
    if (!content)
      return
    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.opacity = ''
    content.style.filter = ''
    // liquid bounds the content by the necked sheet while the drop runs; a clip
    // left behind would keep cropping the panel long after it settled.
    content.style.clipPath = ''
    content.style.willChange = 'auto'
  }

  function resetArrowElement() {
    const arrowEl = options.arrowRef.value
    if (!arrowEl)
      return
    arrowEl.style.transform = ''
    arrowEl.style.transformOrigin = ''
    arrowEl.style.opacity = ''
    arrowEl.style.filter = ''
    arrowEl.style.willChange = 'auto'
  }

  function stopLiquidLoop() {
    if (liquidFrame == null)
      return
    if (hasWindow())
      window.cancelAnimationFrame(liquidFrame)
    liquidFrame = null
  }

  function clearTimeline() {
    if (closePrepareTimer != null) {
      clearTimeout(closePrepareTimer)
      closePrepareTimer = null
    }
    stopLiquidLoop()
    if (tl) {
      tl.kill()
      tl = null
    }
  }

  function shouldAdaptSurfaceFor(type: BaseAnchorAnimationType) {
    // liquid already renders on an opaque `pure` surface — there is no
    // backdrop-filter left to degrade.
    return type === 'transfer' || type === 'boom'
  }

  /**
   * Drive the liquid drop off a single progress scalar.
   *
   * This deliberately does not go through GSAP: the motion is specified as two
   * CSS cubic-bezier curves (GSAP core has no equivalent) and every frame has to
   * derive SVG geometry, the shadow twin, and per-item opacity from `p` rather
   * than tween properties. Owning the scalar also makes a spring structurally
   * impossible.
   */
  function runLiquid(currentRunId: number, direction: 'open' | 'close') {
    const isOpening = direction === 'open'
    const animation = resolvedAnimation.value
    const durMs = isOpening ? animation.duration : animation.closeDuration
    const endP = isOpening ? 1 : 0

    const finish = () => {
      options.settleLiquid(isOpening)
      if (isOpening)
        finishOpen(currentRunId)
      else
        finishClose(currentRunId)
    }

    stopLiquidLoop()

    const ready = options.prepareLiquid(direction)
    if (!ready || durMs <= 0 || !hasWindow()) {
      options.applyLiquidFrame(endP)
      finish()
      return
    }

    const ease = isOpening
      ? resolveLiquidEase(animation.ease, LIQUID_DEFAULTS.ease)
      : resolveLiquidEase(animation.closeEase, LIQUID_DEFAULTS.closeEase)

    const startedAt = performance.now()

    /**
     * One frame, derived entirely from `t`.
     *
     * The bead's velocity is evaluated analytically rather than differenced
     * against the previous frame, so the seed frame reports the speed the drop
     * actually leaves at instead of a standing start, nothing lags a frame
     * behind the geometry it belongs to, and rAF pacing drops out of the result.
     */
    const writeFrame = (t: number, settled: boolean) => {
      // Closing runs its own shorter ease-out curve consumed in reverse position,
      // never the open curve played backwards.
      const eased = ease(t)
      const p = isOpening ? eased : 1 - eased
      // The motion has stopped, so the drop is no longer reporting any speed.
      options.applyLiquidFrame(p, settled ? 0 : liquidVelocityAt(p, t, ease))
    }

    writeFrame(0, false)

    const step = () => {
      liquidFrame = null
      if (!options.isCurrentRun(currentRunId))
        return

      const t = clamp01((performance.now() - startedAt) / durMs)
      const settled = t >= 1
      writeFrame(t, settled)

      if (settled) {
        finish()
        return
      }
      liquidFrame = window.requestAnimationFrame(step)
    }

    liquidFrame = window.requestAnimationFrame(step)
  }

  function settleOpenVisualStateForFollow() {
    const clip = options.clipRef.value
    const content = options.contentRef.value
    if (!clip || !content || !hasWindow())
      return

    clearTimeline()
    if (options.panelBackground.value !== 'refraction')
      options.pulsePanelSurfaceMoving(120)

    if (usesLiquidMotion.value) {
      // clearTimeline killed the frame loop; land the drop on its open state
      // rather than leaving the silhouette frozen mid-fall.
      options.prepareLiquid('open')
      options.applyLiquidFrame(1)
      options.settleLiquid(true)
    }

    resetClipElement(true, 'visible')
    resetContentElement()
    resetArrowElement()
  }

  function finishOpen(currentRunId: number) {
    if (!options.isCurrentRun(currentRunId))
      return
    resetClipElement(true, 'visible')
    resetContentElement()
    resetArrowElement()
    options.setPanelSurfaceMoving(false)
    tl = null
  }

  function finishClose(currentRunId: number) {
    if (!options.isCurrentRun(currentRunId))
      return
    resetClipElement(false, 'hidden')
    resetContentElement()
    resetArrowElement()
    if (!options.keepAliveContent.value)
      options.setMounted(false)
    options.setPanelSurfaceMoving(false)
    tl = null
  }

  function prepareArrowOpen(gsap: GsapRuntime, type: BaseAnchorAnimationType) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl)
      return

    if (type === 'transfer') {
      const insetT = getArrowInsetTranslate()
      gsap.set(arrowEl, {
        x: insetT.x,
        y: insetT.y,
        scale: 0.72,
        opacity: 0,
        willChange: 'transform,opacity',
      })
      return
    }

    gsap.set(arrowEl, {
      x: 0,
      y: 0,
      scale: type === 'boom' ? 0.86 : 1,
      opacity: 0,
      willChange: type === 'opacity' ? 'opacity' : 'transform,opacity',
    })
  }

  function addArrowOpenTween(timeline: GsapTimeline, type: BaseAnchorAnimationType, duration: number) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl || type === 'none')
      return

    const arrowDur = type === 'transfer'
      ? Math.min(0.16, Math.max(0.09, duration * 0.28))
      : Math.min(0.18, Math.max(0.08, duration * 0.36))
    const startAt = type === 'transfer' ? Math.max(0, duration - arrowDur * 0.85) : 0

    timeline.to(arrowEl, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      duration: arrowDur,
      ease: 'power2.out',
    }, startAt)
  }

  function addArrowCloseTween(gsap: GsapRuntime, timeline: GsapTimeline, type: BaseAnchorAnimationType, duration: number) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl || type === 'none')
      return 0

    const arrowDur = Math.min(0.11, Math.max(0.07, duration * 0.4))
    const insetT = type === 'transfer' ? getArrowInsetTranslate() : { x: 0, y: 0 }

    gsap.set(arrowEl, { willChange: type === 'opacity' ? 'opacity' : 'transform,opacity' })
    timeline.to(arrowEl, {
      x: insetT.x,
      y: insetT.y,
      scale: type === 'transfer' ? 0.72 : type === 'boom' ? 0.86 : 1,
      opacity: 0,
      duration: arrowDur,
      ease: 'power2.in',
    }, 0)

    return type === 'transfer' ? arrowDur : 0
  }

  async function animateOpen(currentRunId: number) {
    const clip = options.clipRef.value
    const content = options.contentRef.value
    if (options.isUnlimitedHeight.value) {
      clearTimeline()
      if (!clip || !content) {
        options.setMounted(true)
        options.setPanelSurfaceMoving(false)
        return
      }
      finishOpen(currentRunId)
      return
    }
    if (!clip || !content || !hasWindow()) {
      options.setMounted(true)
      options.setPanelSurfaceMoving(false)
      return
    }

    clearTimeline()

    const animation = resolvedAnimation.value
    const type = effectiveAnimationType.value
    const durMs = animation.duration
    options.setPanelSurfaceMoving(shouldAdaptSurfaceFor(type))

    if (durMs <= 0 || type === 'none') {
      finishOpen(currentRunId)
      return
    }

    if (isLiquidType(type)) {
      clip.style.visibility = 'visible'
      // The goo blur has to bleed past the panel box; clipping it would cut the
      // neck off square.
      clip.style.overflow = 'visible'
      clip.style.clipPath = 'none'
      runLiquid(currentRunId, 'open')
      return
    }

    const gsap = await loadGsap()
    if (!options.isCurrentRun(currentRunId))
      return

    const dur = durMs / 1000
    // A liquid config that degraded to the opacity path still carries CSS
    // cubic-bezier strings, which GSAP cannot parse.
    const openEase = isLiquidFallback.value ? 'power2.out' : animation.ease
    clip.style.visibility = 'visible'
    clip.style.overflow = type === 'transfer' ? 'hidden' : 'visible'
    clip.style.clipPath = type === 'transfer' ? getClipPath(0) : 'none'
    clip.style.willChange = type === 'transfer' ? 'clip-path' : 'auto'
    prepareArrowOpen(gsap, type)

    tl = gsap.timeline({
      onComplete: () => finishOpen(currentRunId),
    })

    if (type === 'transfer') {
      const hiddenT = getTranslate()
      const clipState = { progress: 0 }
      content.style.willChange = 'transform'
      gsap.set(content, { x: hiddenT.x, y: hiddenT.y })

      tl.to(clipState, {
        progress: 1,
        duration: dur * 0.85,
        ease: 'power2.inOut',
        onUpdate() {
          clip.style.clipPath = getClipPath(clipState.progress)
        },
      }, 0)

      tl.to(content, {
        x: 0,
        y: 0,
        duration: dur,
        ease: openEase,
      }, 0)
    }
    else if (type === 'boom') {
      content.style.willChange = 'transform,opacity,filter'
      gsap.set(content, {
        scale: animation.scale,
        opacity: animation.opacity,
        filter: `blur(${animation.blur}px)`,
        transformOrigin: '50% 50%',
      })
      tl.to(content, {
        scale: 1,
        opacity: 1,
        filter: 'blur(0px)',
        duration: dur,
        ease: openEase,
      }, 0)
    }
    else if (type === 'opacity') {
      content.style.willChange = 'opacity'
      gsap.set(content, { opacity: animation.opacity })
      tl.to(content, {
        opacity: 1,
        duration: dur,
        ease: openEase,
      }, 0)
    }

    addArrowOpenTween(tl, type, dur)
  }

  async function animateClose(currentRunId: number) {
    const clip = options.clipRef.value
    const content = options.contentRef.value
    if (options.isUnlimitedHeight.value) {
      clearTimeline()
      if (!clip || !content) {
        options.setMounted(false)
        options.setPanelSurfaceMoving(false)
        return
      }
      finishClose(currentRunId)
      return
    }
    if (!clip || !content || !hasWindow()) {
      options.setMounted(false)
      options.setPanelSurfaceMoving(false)
      return
    }

    clearTimeline()

    const animation = resolvedAnimation.value
    const type = effectiveAnimationType.value
    const durMs = animation.closeDuration
    options.setPanelSurfaceMoving(shouldAdaptSurfaceFor(type))

    if (durMs <= 0 || type === 'none') {
      finishClose(currentRunId)
      return
    }

    if (isLiquidType(type)) {
      clip.style.visibility = 'visible'
      clip.style.overflow = 'visible'
      clip.style.clipPath = 'none'
      runLiquid(currentRunId, 'close')
      return
    }

    const startCloseMotion = async () => {
      if (!options.isCurrentRun(currentRunId) || options.isOpen.value)
        return

      const gsap = await loadGsap()
      if (!options.isCurrentRun(currentRunId) || options.isOpen.value)
        return

      const dur = durMs / 1000
      const resolvedCloseEase = isLiquidFallback.value ? 'power2.in' : animation.closeEase
      clip.style.visibility = 'visible'
      clip.style.overflow = type === 'transfer' ? 'hidden' : 'visible'
      clip.style.clipPath = type === 'transfer' ? getClipPath(1) : 'none'
      clip.style.willChange = type === 'transfer' ? 'clip-path' : 'auto'

      tl = gsap.timeline({
        onComplete: () => finishClose(currentRunId),
      })

      const motionStart = addArrowCloseTween(gsap, tl, type, dur)

      if (type === 'transfer') {
        const hiddenT = getTranslate()
        const clipState = { progress: 1 }
        content.style.willChange = 'transform'

        tl.to(content, {
          x: hiddenT.x,
          y: hiddenT.y,
          duration: dur,
          ease: resolvedCloseEase,
        }, motionStart)

        tl.to(clipState, {
          progress: 0,
          duration: dur,
          ease: resolvedCloseEase,
          onUpdate() {
            clip.style.clipPath = getClipPath(clipState.progress)
          },
        }, motionStart)
      }
      else if (type === 'boom') {
        content.style.willChange = 'transform,opacity,filter'
        gsap.set(content, { transformOrigin: '50% 50%' })
        tl.to(content, {
          scale: animation.scale,
          opacity: animation.opacity,
          filter: `blur(${animation.blur}px)`,
          duration: dur,
          ease: resolvedCloseEase,
        }, motionStart)
      }
      else if (type === 'opacity') {
        content.style.willChange = 'opacity'
        tl.to(content, {
          opacity: animation.opacity,
          duration: dur,
          ease: resolvedCloseEase,
        }, motionStart)
      }
    }

    if (options.panelBackground.value === 'refraction' && type === 'transfer') {
      closePrepareTimer = setTimeout(() => {
        closePrepareTimer = null
        void startCloseMotion()
      }, REFRACTION_CLOSE_PREPARE_MS)
      return
    }

    await startCloseMotion()
  }

  return {
    animateClose,
    animateOpen,
    bouncePad,
    clearTimeline,
    effectiveAnimationType,
    /**
     * True while the drop owns the frame loop. The follow watcher uses this to
     * stay out of the way: `runLiquid` already re-measures and rewrites the whole
     * stage every frame, so refreshing it from a second loop is pure duplicate work.
     */
    hasActiveLiquidRun: () => liquidFrame !== null,
    hasActiveTimeline: () => tl !== null || liquidFrame !== null,
    resolvedAnimation,
    settleOpenVisualStateForFollow,
    usesBeadMotion,
    usesLiquidMotion,
  }
}
