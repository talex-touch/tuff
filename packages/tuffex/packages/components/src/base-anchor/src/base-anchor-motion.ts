import type { ComputedRef, Ref } from 'vue'
import type { BaseAnchorAnimationOptions, BaseAnchorAnimationType, BaseAnchorExitGeometry } from './types'
import { computed } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { clamp01, createCubicBezier, LIQUID_DEFAULTS, liquidVelocityAt, parseCubicBezier, parseSpringEase, resolveLiquidEase } from './base-anchor-liquid'

type BaseAnchorSide = 'top' | 'bottom' | 'left' | 'right'
type BaseAnchorAlignment = 'start' | 'end' | 'center'

/**
 * `outlineColor` and `triggerRadius` stay optional after resolution: an unset
 * outline colour means "read the border token", an unset radius means "measure
 * the reference". Both are resolved against the DOM, which this module cannot see.
 */
export type ResolvedBaseAnchorExitGeometry = Required<BaseAnchorExitGeometry>

export type ResolvedBaseAnchorAnimation
  = Required<Omit<BaseAnchorAnimationOptions, 'outlineColor' | 'triggerRadius' | 'exit'>>
    & { outlineColor?: string, triggerRadius?: number, exit: ResolvedBaseAnchorExitGeometry }

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
  /** Cross-axis alignment of the resolved placement; anchors `expand`'s transform origin. */
  alignment: ComputedRef<BaseAnchorAlignment>
  arrowSize: ComputedRef<number>
  showArrow: ComputedRef<boolean>
  animation: ComputedRef<BaseAnchorAnimationOptions | undefined>
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
  /**
   * True when the user asked for reduced motion. The gsap-driven types (transfer,
   * boom, opacity) snap to their end state; liquid handles this inside prepareLiquid.
   */
  prefersReducedMotion: () => boolean
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
  // The anchor's default motion: symmetric spring expand. The remaining
  // fields are transfer-era and only apply when a consumer pins a classic
  // type; expand carries its own table.
  type: 'expand',
  duration: 432,
  closeDuration: 194.4,
  ease: 'back.out(2)',
  closeEase: 'power3.in',
  distance: 30,
  scale: 1.08,
  blur: 12,
  opacity: 0,
}


/** Classic (transfer/boom/opacity) closes at a fraction of their open. */
const CLASSIC_CLOSE_DURATION_RATIO = 0.45

/**
 * transfer's bounce: the panel slides in slightly small and its back ease
 * swings it past full around the anchor-facing corner before settling.
 */
const TRANSFER_SEED_SCALE = 0.92
const REFRACTION_CLOSE_PREPARE_MS = 180

/**
 * `expand`: one eased progress drives clip height, opacity, scale, and a short
 * drift away from the reference, together — the reference capture shows the
 * height and opacity curves coinciding to within noise.
 *
 * The open rides a real damped spring (see createSpringEase), tuned against
 * the capture: at 400ms its first 50ms track the video's measured curve, it
 * crosses the target at ~140ms, overshoots ~5% at ~180ms, and settles on an
 * exponential tail — fast, one clean bounce, and no corners in the velocity,
 * which is what `back.out`'s piecewise return lacked. The seed (0.95 scale,
 * 12px drift) gives the spring its amplitude; the clip clamps nothing during
 * the overshoot (see getExpandClipPath), so the whole body bounces, not just
 * its edges. The close accelerates out — replaying a spring backwards reads
 * as a stall, and exits should leave, not perform.
 *
 * Like liquid, expand must bypass the legacy `duration` / `ease` props: they
 * are always populated with transfer-era defaults and would re-time the spring.
 */
const EXPAND_DEFAULTS = {
  duration: 400,
  closeDuration: 240,
  // zeta 0.6 puts the overshoot near 10%: the height bounce has to stay
  // legible on a 50px demo panel (~5px), not just on the capture's 500px one.
  ease: 'spring(10, 0.6)',
  closeEase: 'power2.in',
  // Deep enough that the growth reads as scaling up from small, not as a
  // curtain: the panel leaves at 88% and the spring carries it ~1% past full.
  scale: 0.88,
  distance: 12,
} as const

/**
 * Hairline ring painted on the card while the box animates. The outline svg
 * cannot ride a moving box (its viewBox is measured at full size, so it
 * squishes), and hiding it until the end made the border pop in at settle.
 * Instead the ring swaps implementation: an inset box-shadow with the same
 * colour formula tracks the card edge during the motion, and the svg takes
 * over again in the same frame the motion ends — geometry and colour match,
 * so the seam is invisible.
 */
/**
 * `boom` seeds below 1 so the panel scales *up* out of the blur. It used to seed
 * at 1.08 and shrink inward, which reads as the surface being pushed away rather
 * than coming into focus — the opposite of what the materialise is for.
 */
const BOOM_DEFAULTS = {
  duration: 432,
  scale: 0.94,
} as const

const EXPAND_RING_SHADOW = 'inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 88%, transparent)'

/**
 * Bleed on the non-reveal edges of the expand clip. The panel's drop shadow
 * lives outside the border box, so a tight inset would crop it flat on all
 * four sides for the whole run and pop it back at settle; the capture shows
 * the side shadow riding along while the panel grows.
 */
const EXPAND_CLIP_BLEED = 40

interface AnimationPhaseTable {
  duration: number
  /** `undefined` means "derive from the resolved open duration by the legacy ratio". */
  closeDuration: number | undefined
  ease: string
  closeEase: string
  distance: number
  scale: number
}

/**
 * One type's timing and geometry defaults, resolved for a single phase.
 *
 * Open and close each look their own type up here, which is what lets a run be
 * asymmetric. When `closeType` is omitted both phases read the same table and
 * the output is identical to the pre-split resolver.
 *
 */
function phaseTable(type: BaseAnchorAnimationType): AnimationPhaseTable {
  if (isLiquidType(type)) {
    return {
      duration: LIQUID_DEFAULTS.duration,
      closeDuration: LIQUID_DEFAULTS.closeDuration,
      ease: LIQUID_DEFAULTS.ease,
      closeEase: LIQUID_DEFAULTS.closeEase,
      distance: DEFAULT_ANIMATION.distance,
      scale: DEFAULT_ANIMATION.scale,
    }
  }

  if (type === 'boom') {
    return {
      duration: BOOM_DEFAULTS.duration,
      closeDuration: undefined,
      ease: DEFAULT_ANIMATION.ease,
      closeEase: DEFAULT_ANIMATION.closeEase,
      distance: DEFAULT_ANIMATION.distance,
      scale: BOOM_DEFAULTS.scale,
    }
  }

  if (type === 'expand') {
    return {
      duration: EXPAND_DEFAULTS.duration,
      closeDuration: EXPAND_DEFAULTS.closeDuration,
      ease: EXPAND_DEFAULTS.ease,
      closeEase: EXPAND_DEFAULTS.closeEase,
      distance: EXPAND_DEFAULTS.distance,
      scale: EXPAND_DEFAULTS.scale,
    }
  }

  if (type === 'transfer') {
    return {
      duration: DEFAULT_ANIMATION.duration,
      closeDuration: undefined,
      ease: DEFAULT_ANIMATION.ease,
      closeEase: DEFAULT_ANIMATION.closeEase,
      distance: DEFAULT_ANIMATION.distance,
      scale: TRANSFER_SEED_SCALE,
    }
  }

  return {
    duration: DEFAULT_ANIMATION.duration,
    closeDuration: undefined,
    ease: DEFAULT_ANIMATION.ease,
    closeEase: DEFAULT_ANIMATION.closeEase,
    distance: DEFAULT_ANIMATION.distance,
    scale: DEFAULT_ANIMATION.scale,
  }
}

/**
 * `drip` and `bead` carry frame state from prepare through to settle, and both
 * directions share it — including `usesBeadMotion`, which the template reads to
 * build the liquid stage itself. So a liquid run has to be the *same* liquid
 * type at both ends: pairing one with a gsap type would leave the stage measured
 * and visible with nothing to tear it down, and pairing drip with bead would
 * need the stage geometry to change direction mid-run.
 *
 * Either mismatch degrades to a symmetric run rather than rendering a broken one.
 */
function resolveCloseType(
  type: BaseAnchorAnimationType,
  requested: BaseAnchorAnimationType | undefined,
): BaseAnchorAnimationType {
  if (!requested || requested === type)
    return type

  if (isLiquidType(type) || isLiquidType(requested)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[TxBaseAnchor] animation.closeType "${requested}" cannot pair with type "${type}": `
        + 'drip and bead share one stage across both directions, so a liquid run must use '
        + 'the same type at both ends. Falling back to a symmetric run.',
      )
    }
    return type
  }

  return requested
}

function resolveExitGeometry(
  animation: BaseAnchorAnimationOptions,
  closeTable: AnimationPhaseTable,
): ResolvedBaseAnchorExitGeometry {
  const exit: BaseAnchorExitGeometry = animation.exit ?? {}
  return {
    // Shared field first: an explicit `scale` is a statement about the whole
    // animation. Only when the caller said nothing does the close type's own
    // table apply, which is what keeps `{ type: 'boom', closeType: 'expand' }`
    // from closing with boom's above-1 scale.
    scale: Math.max(0.01, exit.scale ?? animation.scale ?? closeTable.scale),
    distance: Math.max(0, exit.distance ?? animation.distance ?? closeTable.distance),
    blur: Math.max(0, exit.blur ?? animation.blur ?? DEFAULT_ANIMATION.blur),
    opacity: Math.min(1, Math.max(0, exit.opacity ?? animation.opacity ?? DEFAULT_ANIMATION.opacity)),
  }
}

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
    const closeType = resolveCloseType(type, animation.closeType)

    const openTable = phaseTable(type)
    const closeTable = phaseTable(closeType)

    const duration = Math.max(0, animation.duration ?? openTable.duration)
    // A table without its own closeDuration is a classic type, whose close is
    // a fraction of the *resolved* open duration — so an explicit `duration`
    // still shortens the close.
    const closeDuration = Math.max(0, animation.closeDuration
      ?? closeTable.closeDuration
      ?? duration * CLASSIC_CLOSE_DURATION_RATIO)

    const distance = Math.max(0, animation.distance ?? openTable.distance)
    const scale = Math.max(0.01, animation.scale ?? openTable.scale)
    const blur = Math.max(0, animation.blur ?? DEFAULT_ANIMATION.blur)
    const opacity = Math.min(1, Math.max(0, animation.opacity ?? DEFAULT_ANIMATION.opacity))

    return {
      type,
      closeType,
      duration,
      closeDuration,
      ease: animation.ease ?? openTable.ease,
      closeEase: animation.closeEase ?? closeTable.closeEase,
      distance,
      scale,
      blur,
      opacity,
      exit: resolveExitGeometry(animation, closeTable),
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

  const closeAnimationType = computed<BaseAnchorAnimationType>(() => resolvedAnimation.value.closeType)

  /**
   * The close phase's own type, degraded on the same axis rule as the open one.
   * `resolveCloseType` already guarantees both phases agree on liquid-ness, so
   * the liquid-only computeds below can keep reading the open type alone.
   */
  const effectiveCloseAnimationType = computed<BaseAnchorAnimationType>(() => {
    if (!isLiquidType(closeAnimationType.value))
      return closeAnimationType.value
    const side = options.side.value
    return side === 'top' || side === 'bottom' ? closeAnimationType.value : 'opacity'
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

  function getTranslate(distance: number = resolvedAnimation.value.distance) {
    const d = distance
    switch (options.side.value) {
      case 'bottom': return { x: 0, y: -d }
      case 'top': return { x: 0, y: d }
      case 'left': return { x: d, y: 0 }
      case 'right': return { x: -d, y: 0 }
      default: return { x: 0, y: -d }
    }
  }

  /**
   * transfer's reveal window. Bled on the non-reveal edges like expand's:
   * a tight inset would crop the scale bounce (and any glow) at the box.
   * The shadow is handled separately — suppressed for the run and bloomed
   * back at settle (see restoreCardShadow) — because the reveal edge itself
   * must still cut, and a cut shadow reads worse than a late one.
   */
  function getClipPath(progress: number) {
    const bleed = `-${EXPAND_CLIP_BLEED}px`
    const p = `${Math.max(0, (1 - progress) * 100)}%`
    switch (options.side.value) {
      case 'bottom': return `inset(${bleed} ${bleed} ${p} ${bleed})`
      case 'top': return `inset(${p} ${bleed} ${bleed} ${bleed})`
      case 'left': return `inset(${bleed} ${bleed} ${bleed} ${p})`
      case 'right': return `inset(${bleed} ${p} ${bleed} ${bleed})`
      default: return `inset(${bleed} ${bleed} ${p} ${bleed})`
    }
  }

  /**
   * The reveal edge is the far edge; the other three bleed so the shadow
   * stays alive while the panel grows (see EXPAND_CLIP_BLEED).
   *
   * Deliberately unclamped: a back ease drives progress past 1, and the
   * reveal inset has to follow it negative — pinned at 0% it would shave the
   * panel's leading edge (and its shadow) for the whole overshoot.
   */
  function getExpandClipPath(progress: number) {
    const bleed = `-${EXPAND_CLIP_BLEED}px`
    const p = `${(1 - progress) * 100}%`
    switch (options.side.value) {
      case 'bottom': return `inset(${bleed} ${bleed} ${p} ${bleed})`
      case 'top': return `inset(${p} ${bleed} ${bleed} ${bleed})`
      case 'left': return `inset(${bleed} ${bleed} ${bleed} ${p})`
      case 'right': return `inset(${bleed} ${p} ${bleed} ${bleed})`
      default: return `inset(${bleed} ${bleed} ${p} ${bleed})`
    }
  }

  /**
   * The settle grows the panel around the corner facing the reference: the
   * anchored edge stays pinned and the far edges drift out, which is the
   * motion the capture shows (anchored corner fixed, opposite corner ~2.5%).
   */
  function getExpandOrigin() {
    const align = options.alignment.value
    const cross = align === 'start' ? '0%' : align === 'end' ? '100%' : '50%'
    switch (options.side.value) {
      case 'bottom': return `${cross} 0%`
      case 'top': return `${cross} 100%`
      case 'left': return `100% ${cross}`
      case 'right': return `0% ${cross}`
      default: return `${cross} 0%`
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
    // expand grows the real box; hand the layout back untouched afterwards.
    clip.style.height = ''
    clip.style.transform = ''
    delete clip.dataset.expandFullHeight
    delete clip.dataset.expandBodyPad
  }

  /**
   * Inline overrides that turn the panel into a growable box: content and
   * card follow the animated wrapper height, the card crops its own rows and
   * carries the hairline ring, the outline svg (which would squish against a
   * moving box) sits out. Inline on purpose — the motion must not depend on a
   * stylesheet having been delivered. The stash keeps whatever inline values
   * a consumer had, and stays live across interrupted runs so the restore
   * always lands on the consumer's own state, never on our overrides.
   */
  let expandBoxStash: {
    content: { height: string, maxHeight: string }
    card: { height: string, maxHeight: string, overflow: string, boxShadow: string } | null
    outline: { display: string } | null
  } | null = null

  function applyExpandBoxStyles(content: HTMLElement) {
    if (expandBoxStash)
      return
    const card = content.querySelector<HTMLElement>('.tx-base-anchor__card')
    const outline = content.querySelector<HTMLElement>('.tx-base-anchor__outline')
    expandBoxStash = {
      content: { height: content.style.height, maxHeight: content.style.maxHeight },
      card: card
        ? { height: card.style.height, maxHeight: card.style.maxHeight, overflow: card.style.overflow, boxShadow: card.style.boxShadow }
        : null,
      outline: outline ? { display: outline.style.display } : null,
    }

    content.style.height = '100%'
    content.style.maxHeight = 'none'
    if (card) {
      card.style.height = '100%'
      card.style.maxHeight = 'none'
      card.style.overflow = 'hidden'
      // Compose with the card's own shadow rather than clobbering it.
      const prior = hasWindow() ? window.getComputedStyle(card).boxShadow : ''
      card.style.boxShadow = prior && prior !== 'none' ? `${EXPAND_RING_SHADOW}, ${prior}` : EXPAND_RING_SHADOW
    }
    if (outline)
      outline.style.display = 'none'
  }

  function clearExpandBoxStyles(content: HTMLElement | null = options.contentRef.value) {
    if (!expandBoxStash || !content)
      return
    const stash = expandBoxStash
    expandBoxStash = null

    content.style.height = stash.content.height
    content.style.maxHeight = stash.content.maxHeight
    const card = content.querySelector<HTMLElement>('.tx-base-anchor__card')
    if (card && stash.card) {
      card.style.height = stash.card.height
      card.style.maxHeight = stash.card.maxHeight
      card.style.overflow = stash.card.overflow
      // The svg ring returns in this same frame, so the swap has no seam.
      card.style.boxShadow = stash.card.boxShadow
    }
    const outline = content.querySelector<HTMLElement>('.tx-base-anchor__outline')
    if (outline && stash.outline)
      outline.style.display = stash.outline.display
  }

  /**
   * transfer's shadow choreography: the reveal clip would crop the surface's
   * drop shadow into a hard edge, so the run suppresses it entirely and the
   * settle blooms it back in through a box-shadow transition — the same
   * "recover after the motion" grammar the surface overlay uses.
   */
  let transferShadowStash: { boxShadow: string, transition: string } | null = null

  function suppressCardShadow(content: HTMLElement, fadeOutMs = 0) {
    const card = content.querySelector<HTMLElement>('.tx-base-anchor__card')
    if (!card)
      return
    if (!transferShadowStash)
      transferShadowStash = { boxShadow: card.style.boxShadow, transition: card.style.transition }
    card.style.transition = fadeOutMs > 0 ? `box-shadow ${fadeOutMs}ms ease` : ''
    card.style.boxShadow = 'none'
  }

  function restoreCardShadow(content: HTMLElement | null, fadeMs = 0) {
    if (!transferShadowStash || !content)
      return
    const stash = transferShadowStash
    transferShadowStash = null
    const card = content.querySelector<HTMLElement>('.tx-base-anchor__card')
    if (!card)
      return
    // With a fade the stylesheet shadow returns THROUGH the transition; the
    // inline transition left behind is stashed by the next run.
    card.style.transition = fadeMs > 0 ? `box-shadow ${fadeMs}ms ease` : stash.transition
    card.style.boxShadow = stash.boxShadow
  }

  function resetContentElement() {
    const content = options.contentRef.value
    if (!content)
      return
    restoreCardShadow(content)
    clearExpandBoxStyles(content)
    const body = content.querySelector<HTMLElement>('.tx-base-anchor__body')
    if (body) {
      body.style.opacity = ''
      body.style.willChange = 'auto'
    }
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
    if (type === 'expand') {
      // Box mode needs no surface swap at all: the glass is revealed by the
      // growing box at full opacity and only the body layer fades, so the
      // backdrop-filter never sits under an animated opacity — the Chrome
      // failure the swap (and its solid-to-glass settle fade) papered over.
      // Only the window-reveal fallback still fades the whole content.
      const side = options.side.value
      const vertical = side === 'top' || side === 'bottom'
      return !(vertical && options.useCard.value)
    }
    return type === 'transfer' || type === 'boom'
  }

  /**
   * GSAP core cannot parse `spring(...)` or CSS `cubic-bezier(...)` strings,
   * but it does accept a plain progress function — so expand's curves resolve
   * through the kernel's spring and bezier builders. Everything else (gsap's
   * own vocabulary) passes through untouched.
   */
  function resolveGsapEase(value: string): string | ((t: number) => number) {
    const spring = parseSpringEase(value)
    if (spring)
      return spring
    const points = parseCubicBezier(value)
    if (!points)
      return value
    return createCubicBezier(points[0], points[1], points[2], points[3])
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
    // Parked: let the suppressed surface shadow bloom back in.
    restoreCardShadow(options.contentRef.value, 280)
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

  /**
   * Each type seeds its arrow in its own visual language: transfer tucks it
   * toward the reference for the landing pop, expand buries it small at the
   * anchor edge so the spring can grow it with the panel, boom holds it back
   * for its zoom, opacity only fades.
   */
  function prepareArrowOpen(gsap: GsapRuntime, type: BaseAnchorAnimationType) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl)
      return

    const insetT = getArrowInsetTranslate()
    if (type === 'transfer') {
      gsap.set(arrowEl, {
        x: insetT.x,
        y: insetT.y,
        scale: 0.72,
        opacity: 0,
        willChange: 'transform,opacity',
      })
      return
    }

    if (type === 'expand') {
      gsap.set(arrowEl, {
        x: insetT.x * 0.6,
        y: insetT.y * 0.6,
        scale: 0.5,
        opacity: 0,
        willChange: 'transform,opacity',
      })
      return
    }

    gsap.set(arrowEl, {
      x: 0,
      y: 0,
      scale: type === 'boom' ? 0.6 : 1,
      opacity: 0,
      willChange: type === 'opacity' ? 'opacity' : 'transform,opacity',
    })
  }

  function addArrowOpenTween(timeline: GsapTimeline, type: BaseAnchorAnimationType, duration: number) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl || type === 'none')
      return

    if (type === 'expand') {
      // The arrow rides the panel's own spring for the full run: it grows,
      // overshoots, and settles in phase with the body it points from.
      timeline.to(arrowEl, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration,
        ease: resolveGsapEase(resolvedAnimation.value.ease),
      }, 0)
      return
    }

    if (type === 'boom') {
      // Late and fast, matching the zoom's focus snap.
      timeline.to(arrowEl, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: Math.min(0.24, Math.max(0.12, duration * 0.5)),
        ease: 'power3.out',
      }, duration * 0.2)
      return
    }

    if (type === 'opacity') {
      timeline.to(arrowEl, {
        opacity: 1,
        duration,
        ease: 'power2.out',
      }, 0)
      return
    }

    // transfer: pop in right as the slide lands.
    const arrowDur = Math.min(0.16, Math.max(0.09, duration * 0.28))
    timeline.to(arrowEl, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      duration: arrowDur,
      ease: 'power2.out',
    }, Math.max(0, duration - arrowDur * 0.85))
  }

  function addArrowCloseTween(gsap: GsapRuntime, timeline: GsapTimeline, type: BaseAnchorAnimationType, duration: number) {
    const arrowEl = options.arrowRef.value
    if (!options.showArrow.value || !arrowEl || type === 'none')
      return 0

    const arrowDur = Math.min(0.12, Math.max(0.07, duration * 0.4))
    const insetT = type === 'transfer'
      ? getArrowInsetTranslate()
      : type === 'expand'
        ? { x: getArrowInsetTranslate().x * 0.6, y: getArrowInsetTranslate().y * 0.6 }
        : { x: 0, y: 0 }

    gsap.set(arrowEl, { willChange: type === 'opacity' ? 'opacity' : 'transform,opacity' })
    timeline.to(arrowEl, {
      x: insetT.x,
      y: insetT.y,
      scale: type === 'transfer' ? 0.72 : type === 'expand' ? 0.5 : type === 'boom' ? 0.6 : 1,
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

    // Reduced motion: snap straight to the open end state instead of running a
    // gsap timeline (liquid already handles this inside runLiquid via prepareLiquid).
    if (options.prefersReducedMotion()) {
      finishOpen(currentRunId)
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
    // expand's clip bleeds past the box to keep the shadow, so it needs overflow visible.
    // The bled clip needs overflow: the bleed IS what keeps the bounce alive.
    clip.style.overflow = 'visible'
    clip.style.clipPath = type === 'transfer'
      ? getClipPath(0)
      : type === 'expand' ? getExpandClipPath(0) : 'none'
    clip.style.willChange = type === 'transfer' || type === 'expand' ? 'clip-path' : 'auto'
    prepareArrowOpen(gsap, type)

    tl = gsap.timeline({
      onComplete: () => finishOpen(currentRunId),
    })

    if (type === 'transfer') {
      const hiddenT = getTranslate()
      const clipState = { progress: 0 }
      content.style.willChange = 'transform'
      gsap.set(content, {
        x: hiddenT.x,
        y: hiddenT.y,
        scale: animation.scale,
        transformOrigin: getExpandOrigin(),
      })
      suppressCardShadow(content)

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
        scale: 1,
        duration: dur,
        ease: openEase,
      }, 0)
    }
    else if (type === 'expand') {
      // One eased progress drives everything: the tweens share the timeline
      // position, the duration, and the ease, so they cannot drift apart —
      // the coupling the reference capture shows.
      const expandEase = resolveGsapEase(animation.ease)
      const driftT = getTranslate()

      // Natural height can only be read with the box overrides off — an
      // interrupted close has them live with the box mid-collapse, and
      // reopening should continue from there, not blink back to zero.
      const priorHeight = clip.style.height
      clip.style.height = ''
      clip.style.transform = ''
      clearExpandBoxStyles(content)
      const currentSide = options.side.value
      const panelHeight = (currentSide === 'top' || currentSide === 'bottom') && options.useCard.value
        ? Math.max(0, content.offsetHeight)
        : 0

      // Box mode fades the body layer INSIDE the card, never the content: an
      // animated opacity above the card makes Chrome drop its backdrop-filter
      // for the whole run, which is what used to force the surface swap. The
      // glass is simply revealed by the growing box, live from frame one.
      const body = content.querySelector<HTMLElement>('.tx-base-anchor__body')
      const fadeTarget = panelHeight > 0 ? (body ?? content) : content
      content.style.willChange = fadeTarget === content ? 'transform,opacity' : 'transform'
      if (fadeTarget !== content)
        fadeTarget.style.willChange = 'opacity'
      gsap.set(content, {
        x: driftT.x,
        y: driftT.y,
        scale: animation.scale,
        transformOrigin: getExpandOrigin(),
      })
      gsap.set(fadeTarget, { opacity: animation.opacity })

      if (panelHeight > 0) {
        // Grow the real box, not a clip window over it. A window cannot
        // overshoot — past 100% there is nothing left to reveal — so the
        // height bounce the capture shows (0 → ~110% → 100%) only exists if
        // the box itself stretches. The card rides the animated height (see
        // applyExpandBoxStyles), so its radius, ring, and shadow follow the
        // moving edge and its rows crop inside it; content stays
        // top-anchored and unsquished throughout.
        //
        // The tween drives a progress proxy, not a pixel target: the natural
        // height is re-read from the body every frame, because slot content
        // can finish rendering mid-flight (dropdown items land a tick after
        // the panel opens). A fixed target would animate to the stale
        // measurement and snap to the real height on reset; through the
        // proxy, the spring simply glides to wherever the content now ends.
        const bodyPad = panelHeight - (body?.offsetHeight ?? panelHeight)
        const naturalHeight = () => (body ? Math.max(1, body.offsetHeight + bodyPad) : panelHeight)
        // The close cannot re-derive the pad while the overrides are live.
        clip.dataset.expandBodyPad = String(bodyPad)
        applyExpandBoxStyles(content)
        clip.style.clipPath = 'none'
        // side=top must grow upward: pair the height with a translate so the
        // trigger-facing edge stays pinned while the far edge does the moving.
        clip.style.willChange = currentSide === 'top' ? 'height,transform' : 'height'

        const writeBoxFrame = (p: number) => {
          const natural = naturalHeight()
          const height = Math.max(0, p * natural)
          // The close needs the current full height to keep the pinned-edge
          // invariant, so keep it fresh.
          clip.dataset.expandFullHeight = String(natural)
          clip.style.height = `${height}px`
          if (currentSide === 'top')
            clip.style.transform = `translateY(${natural - height}px)`
        }

        // Interrupted close: pick the box up where it is, not from zero.
        const priorPx = Number.parseFloat(priorHeight)
        const heightState = {
          p: Number.isFinite(priorPx) && priorPx > 0 ? Math.min(1, priorPx / naturalHeight()) : 0,
        }
        writeBoxFrame(heightState.p)

        tl.to(heightState, {
          p: 1,
          duration: dur,
          ease: expandEase,
          onUpdate() {
            writeBoxFrame(heightState.p)
          },
        }, 0)
      }
      else {
        // Horizontal placements (width animation would reflow text every
        // frame) and cardless/unmeasurable layouts keep the window reveal.
        const clipState = { progress: 0 }
        tl.to(clipState, {
          progress: 1,
          duration: dur,
          ease: expandEase,
          onUpdate() {
            clip.style.clipPath = getExpandClipPath(clipState.progress)
          },
        }, 0)
      }

      tl.to(content, {
        x: 0,
        y: 0,
        scale: 1,
        duration: dur,
        ease: expandEase,
      }, 0)

      tl.to(fadeTarget, {
        opacity: 1,
        duration: dur,
        ease: expandEase,
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
    const type = effectiveCloseAnimationType.value
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

    // Reduced motion: snap straight to the closed end state instead of tweening.
    if (options.prefersReducedMotion()) {
      finishClose(currentRunId)
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
      clip.style.overflow = 'visible'
      clip.style.clipPath = type === 'transfer'
        ? getClipPath(1)
        : type === 'expand' ? getExpandClipPath(1) : 'none'
      clip.style.willChange = type === 'transfer' || type === 'expand' ? 'clip-path' : 'auto'

      tl = gsap.timeline({
        onComplete: () => finishClose(currentRunId),
      })

      const motionStart = addArrowCloseTween(gsap, tl, type, dur)

      if (type === 'transfer') {
        const hiddenT = getTranslate(animation.exit.distance)
        const clipState = { progress: 1 }
        content.style.willChange = 'transform'
        gsap.set(content, { transformOrigin: getExpandOrigin() })
        // Quick fade rather than a hard crop as the clip sweeps back over it.
        suppressCardShadow(content, 140)

        tl.to(content, {
          x: hiddenT.x,
          y: hiddenT.y,
          scale: animation.scale,
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
      else if (type === 'expand') {
        // Accelerate out, landing back on the seed drift/scale/opacity. Still
        // one coupled progress — just a shorter curve than the open.
        const expandCloseEase = resolveGsapEase(animation.closeEase)
        const driftT = getTranslate(animation.exit.distance)

        // Read BEFORE applying the overrides: with the card at 100% the
        // content reports the box, not itself. An open interrupted mid-grow
        // already has them on — then the partial box is exactly the height
        // the collapse should start from.
        const currentSide = options.side.value
        const panelHeight = (currentSide === 'top' || currentSide === 'bottom') && options.useCard.value
          ? Math.max(0, content.offsetHeight)
          : 0

        // Same split as the open: the glass never fades, the body does.
        const body = content.querySelector<HTMLElement>('.tx-base-anchor__body')
        const fadeTarget = panelHeight > 0 ? (body ?? content) : content
        content.style.willChange = fadeTarget === content ? 'transform,opacity' : 'transform'
        if (fadeTarget !== content)
          fadeTarget.style.willChange = 'opacity'
        gsap.set(content, { transformOrigin: getExpandOrigin() })

        if (panelHeight > 0) {
          // Same progress proxy as the open: the natural height is re-read
          // every frame so late-rendering or shrinking content cannot make
          // the collapse land wide of the box.
          const storedPad = Number.parseFloat(clip.dataset.expandBodyPad ?? '')
          const bodyPad = Number.isFinite(storedPad)
            ? storedPad
            : panelHeight - (body?.offsetHeight ?? panelHeight)
          const naturalHeight = () => (body ? Math.max(1, body.offsetHeight + bodyPad) : panelHeight)
          applyExpandBoxStyles(content)
          clip.style.clipPath = 'none'
          clip.style.willChange = currentSide === 'top' ? 'height,transform' : 'height'

          const writeBoxFrame = (p: number) => {
            const natural = naturalHeight()
            const height = Math.max(0, p * natural)
            clip.dataset.expandFullHeight = String(natural)
            clip.style.height = `${height}px`
            // top + translateY(natural - height) + height is constant, so the
            // trigger-facing edge stays pinned through interrupts too.
            if (currentSide === 'top')
              clip.style.transform = `translateY(${natural - height}px)`
          }

          const heightState = { p: Math.min(1, panelHeight / naturalHeight()) }
          writeBoxFrame(heightState.p)
          tl.to(heightState, {
            p: 0,
            duration: dur,
            ease: expandCloseEase,
            onUpdate() {
              writeBoxFrame(heightState.p)
            },
          }, motionStart)
        }
        else {
          const clipState = { progress: 1 }
          tl.to(clipState, {
            progress: 0,
            duration: dur,
            ease: expandCloseEase,
            onUpdate() {
              clip.style.clipPath = getExpandClipPath(clipState.progress)
            },
          }, motionStart)
        }

        tl.to(content, {
          x: driftT.x,
          y: driftT.y,
          scale: animation.exit.scale,
          duration: dur,
          ease: expandCloseEase,
        }, motionStart)

        tl.to(fadeTarget, {
          opacity: animation.exit.opacity,
          duration: dur,
          ease: expandCloseEase,
        }, motionStart)
      }
      else if (type === 'boom') {
        content.style.willChange = 'transform,opacity,filter'
        gsap.set(content, { transformOrigin: '50% 50%' })
        tl.to(content, {
          scale: animation.exit.scale,
          opacity: animation.exit.opacity,
          filter: `blur(${animation.exit.blur}px)`,
          duration: dur,
          ease: resolvedCloseEase,
        }, motionStart)
      }
      else if (type === 'opacity') {
        content.style.willChange = 'opacity'
        tl.to(content, {
          opacity: animation.exit.opacity,
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
