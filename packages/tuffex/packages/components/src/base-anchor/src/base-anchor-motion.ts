import type { ComputedRef, Ref } from 'vue'
import type { BaseAnchorAnimationOptions, BaseAnchorAnimationType } from './types'
import { computed } from 'vue'
import { hasWindow } from '../../../../utils/env'

type BaseAnchorSide = 'top' | 'bottom' | 'left' | 'right'

type GsapTimeline = {
  to: (target: unknown, vars: Record<string, unknown>, position?: number) => GsapTimeline
  kill: () => void
}

type GsapRuntime = {
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
}

const DEFAULT_ANIMATION: Required<BaseAnchorAnimationOptions> = {
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

  const resolvedAnimation = computed<Required<BaseAnchorAnimationOptions>>(() => {
    const animation = options.animation.value ?? {}
    const duration = Math.max(0, animation.duration ?? options.duration.value ?? DEFAULT_ANIMATION.duration)
    const closeDuration = Math.max(0, animation.closeDuration ?? duration * LEGACY_CLOSE_DURATION_RATIO)
    const type = animation.type ?? DEFAULT_ANIMATION.type

    return {
      type,
      duration,
      closeDuration,
      ease: animation.ease ?? options.ease.value ?? DEFAULT_ANIMATION.ease,
      closeEase: animation.closeEase ?? DEFAULT_ANIMATION.closeEase,
      distance: Math.max(0, animation.distance ?? DEFAULT_ANIMATION.distance),
      scale: Math.max(0.01, animation.scale ?? DEFAULT_ANIMATION.scale),
      blur: Math.max(0, animation.blur ?? DEFAULT_ANIMATION.blur),
      opacity: Math.min(1, Math.max(0, animation.opacity ?? DEFAULT_ANIMATION.opacity)),
    }
  })

  const animationType = computed<BaseAnchorAnimationType>(() => resolvedAnimation.value.type)
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

  function clearTimeline() {
    if (closePrepareTimer != null) {
      clearTimeout(closePrepareTimer)
      closePrepareTimer = null
    }
    if (tl) {
      tl.kill()
      tl = null
    }
  }

  function shouldAdaptSurfaceFor(type: BaseAnchorAnimationType) {
    return type === 'transfer' || type === 'boom'
  }

  function settleOpenVisualStateForFollow() {
    const clip = options.clipRef.value
    const content = options.contentRef.value
    if (!clip || !content || !hasWindow())
      return

    clearTimeline()
    if (options.panelBackground.value !== 'refraction')
      options.pulsePanelSurfaceMoving(120)

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
    const type = animation.type
    const durMs = animation.duration
    options.setPanelSurfaceMoving(shouldAdaptSurfaceFor(type))

    if (durMs <= 0 || type === 'none') {
      finishOpen(currentRunId)
      return
    }

    const gsap = await loadGsap()
    if (!options.isCurrentRun(currentRunId))
      return

    const dur = durMs / 1000
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
        ease: animation.ease,
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
        ease: animation.ease,
      }, 0)
    }
    else if (type === 'opacity') {
      content.style.willChange = 'opacity'
      gsap.set(content, { opacity: animation.opacity })
      tl.to(content, {
        opacity: 1,
        duration: dur,
        ease: animation.ease,
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
    const type = animation.type
    const durMs = animation.closeDuration
    options.setPanelSurfaceMoving(shouldAdaptSurfaceFor(type))

    if (durMs <= 0 || type === 'none') {
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
          ease: animation.closeEase,
        }, motionStart)

        tl.to(clipState, {
          progress: 0,
          duration: dur,
          ease: animation.closeEase,
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
          ease: animation.closeEase,
        }, motionStart)
      }
      else if (type === 'opacity') {
        content.style.willChange = 'opacity'
        tl.to(content, {
          opacity: animation.opacity,
          duration: dur,
          ease: animation.closeEase,
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
    hasActiveTimeline: () => tl !== null,
    settleOpenVisualStateForFollow,
  }
}
