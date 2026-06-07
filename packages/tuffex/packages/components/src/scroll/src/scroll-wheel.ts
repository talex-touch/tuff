import type { ComputedRef } from 'vue'
import { ref } from 'vue'
import { hasNavigator } from '@talex-touch/utils/env'

type BetterScroll = any

interface TxScrollWheelProps {
  wheel?: boolean
  bounce?: boolean
  scrollChaining?: boolean
  options?: Record<string, unknown>
}

interface UseScrollWheelOptions {
  props: Readonly<TxScrollWheelProps>
  isNativeMode: ComputedRef<boolean>
  isScrollXEnabled: ComputedRef<boolean>
  isScrollYEnabled: ComputedRef<boolean>
  getBetterScroll: () => BetterScroll | null
}

const RESISTANCE_FACTOR = 0.35
const DEFAULT_WHEEL_OVERSHOOT = 120
const OUT_OF_BOUNDS_NEAR_LIMIT_RATIO = 0.85
const OUT_OF_BOUNDS_MAX_HOLD_MS = 180

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function applyDeltaWithResistance(base: number, delta: number, min: number, max: number, overshoot: number) {
  const next = base + delta
  if (overshoot <= 0)
    return clamp(next, min, max)

  if (next > max) {
    const damped = base > max
      ? base + delta * RESISTANCE_FACTOR
      : max + (delta - (max - base)) * RESISTANCE_FACTOR
    return Math.min(max + overshoot, damped)
  }

  if (next < min) {
    const damped = base < min
      ? base + delta * RESISTANCE_FACTOR
      : min + (delta - (min - base)) * RESISTANCE_FACTOR
    return Math.max(min - overshoot, damped)
  }

  return next
}

export function useScrollWheel(options: UseScrollWheelOptions) {
  const { props, isNativeMode, isScrollXEnabled, isScrollYEnabled, getBetterScroll } = options
  const isWheeling = ref(false)

  let wheelCleanup: (() => void) | null = null
  let wheelIndicatorTimer: number | null = null
  let wheelEndTimer: number | null = null
  let wheelApplyRaf: number | null = null
  let wheelTargetX: number | null = null
  let wheelTargetY: number | null = null
  let bounceGuardUntil = 0
  let outOfBoundsSince = 0

  function getOptions() {
    const rawOptionsFromProps = props.options ?? {}
    const { wheelOvershoot, ...optionsFromProps } = rawOptionsFromProps as Record<string, unknown> & {
      wheelOvershoot?: unknown
    }
    const resolvedWheelOvershoot = typeof wheelOvershoot === 'number' && Number.isFinite(wheelOvershoot)
      ? wheelOvershoot
      : DEFAULT_WHEEL_OVERSHOOT

    return {
      optionsFromProps,
      resolvedWheelOvershoot,
    }
  }

  function getTransitionOverride() {
    const { optionsFromProps } = getOptions()
    const hasUseTransitionOverride = Object.prototype.hasOwnProperty.call(optionsFromProps, 'useTransition')
    const shouldDisableTransitionByDefault = !hasUseTransitionOverride
      && props.wheel
      && props.bounce
      && hasNavigator()
      && (String(navigator.platform).includes('Mac') || String(navigator.userAgent).includes('Mac OS X'))

    return shouldDisableTransitionByDefault ? { useTransition: false } : {}
  }

  function requestWheelApply() {
    if (wheelApplyRaf !== null)
      return

    wheelApplyRaf = window.requestAnimationFrame(() => {
      wheelApplyRaf = null
      const bs = getBetterScroll()
      if (!bs)
        return

      const x = wheelTargetX ?? (typeof bs.x === 'number' ? bs.x : 0)
      const y = wheelTargetY ?? (typeof bs.y === 'number' ? bs.y : 0)
      if ((bs as any).pending)
        (bs as any)?.stop?.()
      bs.scrollTo(x, y, 0)
    })
  }

  function handleWheel(e: WheelEvent) {
    const bs = getBetterScroll()
    if (!bs)
      return
    if (isNativeMode.value)
      return
    if (!props.wheel)
      return
    if (e.ctrlKey)
      return

    const maxX = typeof (bs as any).maxScrollX === 'number' ? (bs as any).maxScrollX : -Infinity
    const maxY = typeof (bs as any).maxScrollY === 'number' ? (bs as any).maxScrollY : -Infinity
    const canScrollXNow = isScrollXEnabled.value && maxX < 0
    const canScrollYNow = isScrollYEnabled.value && maxY < 0

    const currX = typeof bs.x === 'number' ? bs.x : 0
    const currY = typeof bs.y === 'number' ? bs.y : 0

    let effDx = typeof e.deltaX === 'number' ? e.deltaX : 0
    let effDy = typeof e.deltaY === 'number' ? e.deltaY : 0

    if (!isScrollYEnabled.value && isScrollXEnabled.value) {
      if (effDx === 0 && effDy !== 0) {
        effDx = effDy
        effDy = 0
      }
    }
    else if (!isScrollXEnabled.value && isScrollYEnabled.value) {
      if (effDy === 0 && effDx !== 0) {
        effDy = effDx
        effDx = 0
      }
    }

    if (effDx === 0 && effDy === 0)
      return

    const isPixelMode = typeof e.deltaMode !== 'number' || e.deltaMode === 0
    const isOutXNow = isScrollXEnabled.value && (currX > 0 || currX < maxX)
    const isOutYNow = isScrollYEnabled.value && (currY > 0 || currY < maxY)
    const deltaXNow = isScrollXEnabled.value ? -effDx : 0
    const deltaYNow = isScrollYEnabled.value ? -effDy : 0
    const willScrollX = deltaXNow !== 0 && canScrollXNow
    const willScrollY = deltaYNow !== 0 && canScrollYNow

    if (!willScrollX && !willScrollY)
      return

    const absDelta = Math.max(Math.abs(deltaXNow), Math.abs(deltaYNow))
    const shouldBlockScrollChaining = !props.scrollChaining && (willScrollX || willScrollY)

    if (props.bounce && isPixelMode) {
      const now = getNow()
      if (now < bounceGuardUntil) {
        const isPushingOutX = willScrollX
          && ((currX >= 0 && deltaXNow > 0) || (currX <= maxX && deltaXNow < 0))
        const isPushingOutY = willScrollY
          && ((currY >= 0 && deltaYNow > 0) || (currY <= maxY && deltaYNow < 0))

        if (isPushingOutX || isPushingOutY) {
          if (e.cancelable)
            e.preventDefault()
          if (shouldBlockScrollChaining)
            e.stopPropagation()
          return
        }
      }
    }

    const isBouncing = Boolean((bs as any).pending)
    const isPushingFurtherOutXNow = willScrollX && isOutXNow
      && ((currX > 0 && deltaXNow > 0) || (currX < maxX && deltaXNow < 0))
    const isPushingFurtherOutYNow = willScrollY && isOutYNow
      && ((currY > 0 && deltaYNow > 0) || (currY < maxY && deltaYNow < 0))
    const shouldIgnoreWhileBouncing = props.bounce
      && isPixelMode
      && isBouncing
      && (isPushingFurtherOutXNow || isPushingFurtherOutYNow)
    if (shouldIgnoreWhileBouncing) {
      if (e.cancelable)
        e.preventDefault()
      if (shouldBlockScrollChaining)
        e.stopPropagation()
      return
    }

    if (isBouncing)
      (bs as any)?.stop?.()

    const currXAfterStop = typeof bs.x === 'number' ? bs.x : currX
    const currYAfterStop = typeof bs.y === 'number' ? bs.y : currY

    isWheeling.value = true
    wheelIndicatorTimer && window.clearTimeout(wheelIndicatorTimer)
    wheelIndicatorTimer = window.setTimeout(() => {
      isWheeling.value = false
      wheelIndicatorTimer = null
    }, 520)

    const baseX = wheelTargetX ?? currXAfterStop
    const baseY = wheelTargetY ?? currYAfterStop

    const { resolvedWheelOvershoot } = getOptions()
    const overshoot = props.bounce ? resolvedWheelOvershoot : 0
    const isOutXBase = isScrollXEnabled.value && (baseX > 0 || baseX < maxX)
    const isOutYBase = isScrollYEnabled.value && (baseY > 0 || baseY < maxY)
    const isOutBase = isOutXBase || isOutYBase

    const now = getNow()
    if (!isOutBase) {
      outOfBoundsSince = 0
    }
    else if (outOfBoundsSince === 0) {
      outOfBoundsSince = now
    }

    let deltaX = willScrollX ? deltaXNow : 0
    let deltaY = willScrollY ? deltaYNow : 0
    const isPushingFurtherOutX = isOutXBase && ((baseX > 0 && deltaX > 0) || (baseX < maxX && deltaX < 0))
    const isPushingFurtherOutY = isOutYBase && ((baseY > 0 && deltaY > 0) || (baseY < maxY && deltaY < 0))

    if (props.bounce && overshoot > 0) {
      const isNearLimitX = isPushingFurtherOutX && (
        (baseX > 0 && baseX >= overshoot * OUT_OF_BOUNDS_NEAR_LIMIT_RATIO)
        || (baseX < maxX && baseX <= maxX - overshoot * OUT_OF_BOUNDS_NEAR_LIMIT_RATIO)
      )
      const isNearLimitY = isPushingFurtherOutY && (
        (baseY > 0 && baseY >= overshoot * OUT_OF_BOUNDS_NEAR_LIMIT_RATIO)
        || (baseY < maxY && baseY <= maxY - overshoot * OUT_OF_BOUNDS_NEAR_LIMIT_RATIO)
      )
      if (isNearLimitX)
        deltaX = 0
      if (isNearLimitY)
        deltaY = 0
    }

    const nextX = isScrollXEnabled.value ? applyDeltaWithResistance(baseX, deltaX, maxX, 0, overshoot) : baseX
    const nextY = isScrollYEnabled.value ? applyDeltaWithResistance(baseY, deltaY, maxY, 0, overshoot) : baseY
    const willMove = nextX !== baseX || nextY !== baseY

    if (shouldBlockScrollChaining) {
      if (e.cancelable)
        e.preventDefault()
      e.stopPropagation()
    }

    const wheelEndDelay = isPixelMode ? 48 : (absDelta < 40 ? 120 : 160)
    const isPushingFurtherOut = isPushingFurtherOutX || isPushingFurtherOutY
    const allowOutOfBoundsHold = props.bounce
      && isPixelMode
      && isOutBase
      && isPushingFurtherOut
      && outOfBoundsSince > 0
      && now - outOfBoundsSince < OUT_OF_BOUNDS_MAX_HOLD_MS

    const shouldRefreshWheelEndTimer = !isOutBase || (willMove && (!isPushingFurtherOut || allowOutOfBoundsHold))
    if (wheelEndTimer !== null && shouldRefreshWheelEndTimer) {
      window.clearTimeout(wheelEndTimer)
      wheelEndTimer = null
    }
    if (wheelEndTimer === null) {
      wheelEndTimer = window.setTimeout(() => {
        wheelEndTimer = null
        wheelTargetX = null
        wheelTargetY = null
        const current = getBetterScroll()
        if (!current)
          return
        if (!props.bounce)
          return

        const currentMaxX = typeof (current as any).maxScrollX === 'number' ? (current as any).maxScrollX : -Infinity
        const currentMaxY = typeof (current as any).maxScrollY === 'number' ? (current as any).maxScrollY : -Infinity
        const xNow = typeof (current as any).x === 'number' ? (current as any).x : 0
        const yNow = typeof (current as any).y === 'number' ? (current as any).y : 0

        const isOutX = isScrollXEnabled.value && (xNow > 0 || xNow < currentMaxX)
        const isOutY = isScrollYEnabled.value && (yNow > 0 || yNow < currentMaxY)
        if (!isOutX && !isOutY)
          return

        bounceGuardUntil = getNow() + 900
        outOfBoundsSince = 0
        ;(current as any)?.resetPosition?.(420)
      }, wheelEndDelay)
    }

    if (!willMove)
      return

    wheelTargetX = nextX
    wheelTargetY = nextY

    if (!shouldBlockScrollChaining) {
      if (e.cancelable)
        e.preventDefault()
    }

    requestWheelApply()
  }

  function setupWheel(el: HTMLElement | null) {
    if (!el)
      return
    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanup = () => el.removeEventListener('wheel', handleWheel)
  }

  function destroyWheel() {
    wheelCleanup?.()
    wheelCleanup = null

    wheelIndicatorTimer && window.clearTimeout(wheelIndicatorTimer)
    wheelIndicatorTimer = null

    wheelEndTimer && window.clearTimeout(wheelEndTimer)
    wheelEndTimer = null
    wheelApplyRaf && window.cancelAnimationFrame(wheelApplyRaf)
    wheelApplyRaf = null
    wheelTargetX = null
    wheelTargetY = null
    bounceGuardUntil = 0
    outOfBoundsSince = 0
    isWheeling.value = false
  }

  return {
    isWheeling,
    getOptions,
    getTransitionOverride,
    setupWheel,
    destroyWheel,
  }
}
