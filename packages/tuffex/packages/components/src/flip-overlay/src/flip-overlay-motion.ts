import type { ComputedRef, Ref } from 'vue'
import type { FlipOverlayEmits, FlipOverlayProps } from './types'
import { hasWindow } from '../../../../utils/env'
import { STACK_STATE_EPSILON } from './flip-overlay-stack'

type FlipOverlayTween = {
  kill: () => void
  progress: () => number
  timeScale: (value: number) => void
}

type GsapRuntime = {
  set: (target: unknown, vars: Record<string, unknown>) => void
  to: (target: unknown, vars: Record<string, unknown>) => FlipOverlayTween
}

type FlipOverlayStackMotionState = {
  depth: number
  translateY: number
  scale: number
  opacity: number
}

type AppliedStackState = {
  y: number
  scale: number
  opacity: number
}

interface FlipOverlayMotionOptions {
  props: FlipOverlayProps
  cardRef: Ref<HTMLElement | null>
  visible: Ref<boolean>
  expanded: Ref<boolean>
  animating: Ref<boolean>
  sourceRect: Ref<DOMRect | null>
  sourceRadius: Ref<string | null>
  tilt: Ref<{ x: number, y: number }>
  stackMeta: ComputedRef<FlipOverlayStackMotionState>
  isCurrentRun: (runId: number) => boolean
  getVisibleStackCount: () => number
  syncExpanded: (value: boolean) => void
  syncAnimating: (value: boolean) => void
  removeStackEntry: () => void
  emit: FlipOverlayEmits
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

function isSameStackState(current: AppliedStackState | null, next: AppliedStackState) {
  if (!current)
    return false

  return Math.abs(current.y - next.y) <= STACK_STATE_EPSILON
    && Math.abs(current.scale - next.scale) <= STACK_STATE_EPSILON
    && Math.abs(current.opacity - next.opacity) <= STACK_STATE_EPSILON
}

function toCenteredTransform(y = 0, scale = 1) {
  const translate = `translate(-50%, -50%) translateY(${y}px)`
  return scale === 1 ? translate : `${translate} scale(${scale})`
}

function applyImmediateStackState(card: HTMLElement, state: AppliedStackState) {
  card.style.transform = toCenteredTransform(state.y, state.scale)
  card.style.opacity = String(state.opacity)
}

function prepareHiddenStackOpen(card: HTMLElement) {
  card.style.opacity = '0'
  card.style.transform = toCenteredTransform(10, 0.985)
}

function prepareHiddenSourceOpen(card: HTMLElement) {
  card.style.opacity = '0'
}

export function useFlipOverlayMotion(options: FlipOverlayMotionOptions) {
  let tween: FlipOverlayTween | null = null
  let stackTween: FlipOverlayTween | null = null
  let appliedStackState: AppliedStackState | null = null

  function clearTween() {
    if (!tween)
      return
    tween.kill()
    tween = null
  }

  function clearStackTween() {
    if (!stackTween)
      return
    stackTween.kill()
    stackTween = null
  }

  function applyStackCardState(forceImmediate = false) {
    const card = options.cardRef.value
    if (!card)
      return

    if (!options.visible.value || !options.expanded.value || options.animating.value) {
      clearStackTween()
      appliedStackState = null
      return
    }

    const { translateY, scale, opacity, depth } = options.stackMeta.value
    const nextState = {
      y: translateY,
      scale,
      opacity,
    }

    if (!forceImmediate && isSameStackState(appliedStackState, nextState))
      return

    clearStackTween()

    if (forceImmediate || depth === 0) {
      applyImmediateStackState(card, nextState)
      appliedStackState = nextState
      return
    }

    appliedStackState = nextState
    void loadGsap().then((gsap) => {
      stackTween = gsap.to(card, {
        y: translateY,
        scaleX: scale,
        scaleY: scale,
        opacity,
        duration: 0.26,
        ease: 'power2.out',
        overwrite: 'auto',
        onComplete: () => {
          stackTween = null
        },
      })
    })
  }

  function applySpeedBoost() {
    if (!tween)
      return
    if (tween.progress() > (options.props.speedBoostAt ?? 0.7))
      tween.timeScale(options.props.speedBoost ?? 1.12)
  }

  async function startOpenAnimation(currentRunId: number) {
    const card = options.cardRef.value
    const from = options.sourceRect.value
    if (!card || !hasWindow()) {
      options.syncExpanded(true)
      options.syncAnimating(false)
      options.emit('opened')
      return
    }

    if (!from) {
      const isStackPushOpen = options.getVisibleStackCount() > 1

      if (isStackPushOpen) {
        clearTween()
        clearStackTween()
        options.syncAnimating(true)
        prepareHiddenStackOpen(card)
        options.syncExpanded(true)

        const gsap = await loadGsap()
        if (!options.isCurrentRun(currentRunId))
          return

        gsap.set(card, {
          autoAlpha: 0,
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 10,
          scaleX: 0.985,
          scaleY: 0.985,
        })
        tween = gsap.to(card, {
          autoAlpha: 1,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          duration: 0.22,
          ease: 'power2.out',
          overwrite: true,
          onComplete: () => {
            if (!options.isCurrentRun(currentRunId))
              return
            options.syncAnimating(false)
            tween = null
            options.emit('opened')
          },
        })
        return
      }

      applyImmediateStackState(card, {
        y: 0,
        scale: 1,
        opacity: 1,
      })
      options.syncExpanded(true)
      options.syncAnimating(false)
      options.emit('opened')
      return
    }

    const fromCenterX = from.left + from.width / 2
    const fromCenterY = from.top + from.height / 2
    const viewportCenterX = window.innerWidth / 2
    const viewportCenterY = window.innerHeight / 2
    const translateX = fromCenterX - viewportCenterX
    const translateY = fromCenterY - viewportCenterY
    const to = card.getBoundingClientRect()
    const scaleX = from.width / to.width
    const scaleY = from.height / to.height
    const targetRadius = getComputedStyle(card).borderRadius
    const initialRadius = options.sourceRadius.value || targetRadius
    const tiltValue = options.tilt.value

    clearTween()
    clearStackTween()
    options.syncAnimating(true)
    prepareHiddenSourceOpen(card)

    const gsap = await loadGsap()
    if (!options.isCurrentRun(currentRunId))
      return

    gsap.set(card, {
      xPercent: -50,
      yPercent: -50,
      x: translateX,
      y: translateY,
      scaleX,
      scaleY,
      rotateX: tiltValue.x,
      rotateY: tiltValue.y,
      transformPerspective: options.props.perspective ?? 1200,
      borderRadius: initialRadius,
      autoAlpha: 1,
    })
    options.syncExpanded(true)
    tween = gsap.to(card, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotateX: 0,
      rotateY: 0,
      borderRadius: targetRadius,
      duration: (options.props.duration ?? 480) / 1000,
      ease: options.props.easeOut ?? 'back.out(1.25)',
      overwrite: true,
      onUpdate: applySpeedBoost,
      onComplete: () => {
        if (!options.isCurrentRun(currentRunId))
          return
        options.syncAnimating(false)
        tween = null
        options.emit('opened')
      },
    })
    tween.timeScale(1)
  }

  async function startCloseAnimation(currentRunId: number) {
    const card = options.cardRef.value
    const from = options.sourceRect.value
    if (!card || !hasWindow() || !from) {
      options.visible.value = false
      options.syncAnimating(false)
      options.removeStackEntry()
      if (options.props.modelValue)
        options.emit('update:modelValue', false)
      options.emit('closed')
      return
    }

    const fromCenterX = from.left + from.width / 2
    const fromCenterY = from.top + from.height / 2
    const viewportCenterX = window.innerWidth / 2
    const viewportCenterY = window.innerHeight / 2
    const translateX = fromCenterX - viewportCenterX
    const translateY = fromCenterY - viewportCenterY
    const to = card.getBoundingClientRect()
    const scaleX = from.width / to.width
    const scaleY = from.height / to.height
    const tiltValue = options.tilt.value

    clearTween()
    clearStackTween()
    options.syncAnimating(true)

    const gsap = await loadGsap()
    if (!options.isCurrentRun(currentRunId))
      return

    tween = gsap.to(card, {
      x: translateX,
      y: translateY,
      scaleX,
      scaleY,
      rotateX: tiltValue.x,
      rotateY: tiltValue.y,
      borderRadius: options.sourceRadius.value || getComputedStyle(card).borderRadius,
      duration: (options.props.duration ?? 480) / 1000,
      ease: options.props.easeIn ?? 'back.in(1)',
      overwrite: true,
      onUpdate: applySpeedBoost,
      onComplete: () => {
        if (!options.isCurrentRun(currentRunId))
          return
        options.visible.value = false
        options.syncAnimating(false)
        options.removeStackEntry()
        tween = null
        options.emit('update:modelValue', false)
        options.emit('closed')
      },
    })
    tween.timeScale(1)
  }

  return {
    applyStackCardState,
    clearStackTween,
    clearTween,
    startCloseAnimation,
    startOpenAnimation,
  }
}
