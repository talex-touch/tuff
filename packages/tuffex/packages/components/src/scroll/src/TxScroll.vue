<script lang="ts" setup>
import type { TxScrollInfo } from './types'
import PullDown from '@better-scroll/pull-down'
import PullUp from '@better-scroll/pull-up'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

type BetterScroll = any

defineOptions({
  name: 'TxScroll',
})
const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    native?: boolean
    scrollChaining?: boolean
    direction?: 'vertical' | 'horizontal' | 'both'
    scrollbar?: boolean
    scrollbarFade?: boolean
    scrollbarInteractive?: boolean
    scrollbarAlwaysVisible?: boolean
    scrollbarMinSize?: number
    probeType?: 0 | 1 | 2 | 3
    bounce?: boolean
    click?: boolean
    wheel?: boolean
    refreshOnContentChange?: boolean
    pullDownRefresh?: boolean | Record<string, unknown>
    pullDownThreshold?: number
    pullDownStop?: number
    pullUpLoad?: boolean | Record<string, unknown>
    pullUpThreshold?: number
    options?: Record<string, unknown>
  }>(),
  {
    noPadding: false,
    native: false,
    scrollChaining: false,
    direction: 'vertical',
    scrollbar: true,
    scrollbarFade: true,
    scrollbarInteractive: true,
    scrollbarAlwaysVisible: false,
    scrollbarMinSize: 18,
    probeType: 3,
    bounce: true,
    click: true,
    wheel: true,
    refreshOnContentChange: true,
    pullDownRefresh: false,
    pullDownThreshold: 70,
    pullDownStop: 56,
    pullUpLoad: false,
    pullUpThreshold: 0,
    options: () => ({}),
  },
)
const emit = defineEmits<{
  'scroll': [scrollInfo: { scrollTop: number, scrollLeft: number }]
  'pulling-down': []
  'pulling-up': []
}>()
let isBScrollPluginInstalled = false
let isBScrollPullDownInstalled = false
let isBScrollPullUpInstalled = false

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const nativeScrollRef = ref<HTMLElement | null>(null)

const canScrollY = ref(false)
const canScrollX = ref(false)

const isScrollXEnabled = computed(() => props.direction === 'horizontal' || props.direction === 'both')
const isScrollYEnabled = computed(() => props.direction === 'vertical' || props.direction === 'both')
const isFreeScroll = computed(() => props.direction === 'both')

const wrapperStyle = computed(() => {
  return {
    '--tx-scrollbar-min-size': `${props.scrollbarMinSize}px`,
  } as Record<string, string>
})

const wrapperClass = computed(() => {
  const alwaysVisible = props.scrollbarAlwaysVisible
    || (props.bounce && props.scrollbar && ((isScrollYEnabled.value && !canScrollY.value) || (isScrollXEnabled.value && !canScrollX.value)))

  return {
    'tx-scroll__wrapper--always-visible': alwaysVisible,
    'tx-scroll__wrapper--wheeling': isWheeling.value,
  }
})

const contentStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.noPadding)
    style.padding = '0'
  if (isScrollXEnabled.value)
    style.width = 'max-content'
  return style
})

const nativeScrollStyle = computed(() => {
  return {
    overflowY: isScrollYEnabled.value ? 'auto' : 'hidden',
    overflowX: isScrollXEnabled.value ? 'auto' : 'hidden',
    overscrollBehaviorY: isScrollYEnabled.value
      ? (props.scrollChaining ? 'auto' : 'contain')
      : 'auto',
    overscrollBehaviorX: isScrollXEnabled.value
      ? (props.scrollChaining ? 'auto' : 'contain')
      : 'auto',
  } as Record<string, string>
})

let bs: BetterScroll | null = null
let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null
let wheelCleanup: (() => void) | null = null
let refreshTimer: number | null = null

let wheelIndicatorTimer: number | null = null
let wheelEndTimer: number | null = null
let wheelApplyRaf: number | null = null
let wheelTargetX: number | null = null
let wheelTargetY: number | null = null
const isWheeling = ref(false)

let nativeTouchStartY: number | null = null
let nativePullingDown = false
let nativePullingUp = false

function updateScrollAbility() {
  if (!bs) {
    canScrollX.value = false
    canScrollY.value = false
    return
  }

  const maxX = typeof (bs as any).maxScrollX === 'number' ? (bs as any).maxScrollX : 0
  const maxY = typeof (bs as any).maxScrollY === 'number' ? (bs as any).maxScrollY : 0
  canScrollX.value = isScrollXEnabled.value && maxX < 0
  canScrollY.value = isScrollYEnabled.value && maxY < 0
}

function scheduleRefresh() {
  refreshTimer && window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    bs?.refresh?.()
    updateScrollAbility()
  }, 16)
}

function emitScroll(scrollTop: number, scrollLeft: number) {
  emit('scroll', { scrollTop, scrollLeft })
}

async function initBetterScroll() {
  if (!wrapperRef.value)
    return

  const { default: BScroll } = await import('@better-scroll/core')
  const { default: ScrollBar } = await import('@better-scroll/scroll-bar')
  if (!isBScrollPluginInstalled) {
    BScroll.use(ScrollBar)
    isBScrollPluginInstalled = true
  }

  const shouldUsePullDown = props.pullDownRefresh !== false
    && (props.pullDownRefresh === true || typeof props.pullDownRefresh === 'object')
  const shouldUsePullUp = props.pullUpLoad !== false
    && (props.pullUpLoad === true || typeof props.pullUpLoad === 'object')

  if (shouldUsePullDown) {
    if (!isBScrollPullDownInstalled) {
      BScroll.use(PullDown)
      isBScrollPullDownInstalled = true
    }
  }

  if (shouldUsePullUp) {
    if (!isBScrollPullUpInstalled) {
      BScroll.use(PullUp)
      isBScrollPullUpInstalled = true
    }
  }

  const scrollbarOption = props.scrollbar
    ? {
        fade: props.scrollbarFade,
        interactive: props.scrollbarInteractive,
      }
    : false

  const pullDownOption = shouldUsePullDown
    ? {
        threshold: props.pullDownThreshold,
        stop: props.pullDownStop,
        ...(typeof props.pullDownRefresh === 'object' ? props.pullDownRefresh : {}),
      }
    : false

  const pullUpOption = shouldUsePullUp
    ? {
        threshold: props.pullUpThreshold,
        ...(typeof props.pullUpLoad === 'object' ? props.pullUpLoad : {}),
      }
    : false

  const optionsFromProps = props.options ?? {}
  const hasUseTransitionOverride = Object.prototype.hasOwnProperty.call(optionsFromProps, 'useTransition')
  const shouldDisableTransitionByDefault = !hasUseTransitionOverride
    && props.wheel
    && props.bounce
    && typeof navigator !== 'undefined'
    && (String(navigator.platform).includes('Mac') || String(navigator.userAgent).includes('Mac OS X'))

  bs = new BScroll(wrapperRef.value, {
    scrollX: isScrollXEnabled.value,
    scrollY: isScrollYEnabled.value,
    freeScroll: isFreeScroll.value,
    probeType: props.probeType,
    bounce: props.bounce,
    click: props.click,
    scrollbar: scrollbarOption,
    pullDownRefresh: pullDownOption,
    pullUpLoad: pullUpOption,
    ...(shouldDisableTransitionByDefault ? { useTransition: false } : {}),
    ...optionsFromProps,
  })

  bs.on('scroll', (pos: { x: number, y: number }) => {
    emitScroll(Math.abs(pos.y), Math.abs(pos.x))
  })

  if (shouldUsePullDown) {
    bs.on('pullingDown', () => {
      emit('pulling-down')
    })
  }

  if (shouldUsePullUp) {
    bs.on('pullingUp', () => {
      emit('pulling-up')
    })
  }

  scheduleRefresh()

  const el = wrapperRef.value
  const RESISTANCE_FACTOR = 0.35
  const applyDeltaWithResistance = (base: number, delta: number, min: number, max: number, overshoot: number) => {
    const next = base + delta
    if (overshoot <= 0)
      return Math.max(min, Math.min(max, next))

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

  const requestWheelApply = () => {
    if (wheelApplyRaf !== null)
      return

    wheelApplyRaf = window.requestAnimationFrame(() => {
      wheelApplyRaf = null
      if (!bs)
        return

      const x = wheelTargetX ?? (typeof bs.x === 'number' ? bs.x : 0)
      const y = wheelTargetY ?? (typeof bs.y === 'number' ? bs.y : 0)
      if ((bs as any).pending)
        ;(bs as any)?.stop?.()
      bs.scrollTo(x, y, 0)
    })
  }

  const onWheel = (e: WheelEvent) => {
    if (!bs)
      return
    if (props.native)
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

    const dx = typeof e.deltaX === 'number' ? e.deltaX : 0
    const dy = typeof e.deltaY === 'number' ? e.deltaY : 0

    let effDx = dx
    let effDy = dy

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

    const absDelta = Math.max(Math.abs(effDx), Math.abs(effDy))
    const isPixelMode = typeof e.deltaMode !== 'number' || e.deltaMode === 0
    const isOutXNow = isScrollXEnabled.value && (currX > 0 || currX < maxX)
    const isOutYNow = isScrollYEnabled.value && (currY > 0 || currY < maxY)
    const deltaXNow = isScrollXEnabled.value ? -effDx : 0
    const deltaYNow = isScrollYEnabled.value ? -effDy : 0
    const shouldBlockScrollChaining = !props.scrollChaining && (
      (effDx !== 0 && canScrollXNow)
      || (effDy !== 0 && canScrollYNow)
    )

    const isBouncing = Boolean((bs as any).pending)
    const isPushingFurtherOutXNow = isOutXNow
      && ((currX > 0 && deltaXNow > 0) || (currX < maxX && deltaXNow < 0))
    const isPushingFurtherOutYNow = isOutYNow
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
      ;(bs as any)?.stop?.()

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

    const overshoot = props.bounce ? 60 : 0
    const isOutXBase = isScrollXEnabled.value && (baseX > 0 || baseX < maxX)
    const isOutYBase = isScrollYEnabled.value && (baseY > 0 || baseY < maxY)

    const OUT_OF_BOUNDS_TAIL_THRESHOLD = overshoot
    const OUT_OF_BOUNDS_NEAR_LIMIT_RATIO = 0.85

    let deltaX = deltaXNow
    let deltaY = deltaYNow
    const isPushingFurtherOutX = isOutXBase && ((baseX > 0 && deltaX > 0) || (baseX < maxX && deltaX < 0))
    const isPushingFurtherOutY = isOutYBase && ((baseY > 0 && deltaY > 0) || (baseY < maxY && deltaY < 0))

    if (props.bounce && isPixelMode && absDelta < OUT_OF_BOUNDS_TAIL_THRESHOLD) {
      if (isPushingFurtherOutX)
        deltaX = 0
      if (isPushingFurtherOutY)
        deltaY = 0
    }

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
    const shouldRefreshWheelEndTimer = !(isOutXBase || isOutYBase) || willMove
    if (wheelEndTimer !== null && shouldRefreshWheelEndTimer) {
      window.clearTimeout(wheelEndTimer)
      wheelEndTimer = null
    }
    if (wheelEndTimer === null) {
      wheelEndTimer = window.setTimeout(() => {
        wheelEndTimer = null
        wheelTargetX = null
        wheelTargetY = null
        if (!bs)
          return
        if (!props.bounce)
          return

        const currentMaxX = typeof (bs as any).maxScrollX === 'number' ? (bs as any).maxScrollX : -Infinity
        const currentMaxY = typeof (bs as any).maxScrollY === 'number' ? (bs as any).maxScrollY : -Infinity
        const xNow = typeof (bs as any).x === 'number' ? (bs as any).x : 0
        const yNow = typeof (bs as any).y === 'number' ? (bs as any).y : 0

        const isOutX = isScrollXEnabled.value && (xNow > 0 || xNow < currentMaxX)
        const isOutY = isScrollYEnabled.value && (yNow > 0 || yNow < currentMaxY)
        if (!isOutX && !isOutY)
          return

        ;(bs as any)?.resetPosition?.(420)
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

  el.addEventListener('wheel', onWheel, { passive: false })
  wheelCleanup = () => el.removeEventListener('wheel', onWheel)
}

function destroyBetterScroll() {
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

  isWheeling.value = false

  if (mo) {
    mo.disconnect()
    mo = null
  }

  refreshTimer && window.clearTimeout(refreshTimer)
  refreshTimer = null
  if (bs) {
    bs.destroy()
    bs = null
  }

  updateScrollAbility()
}

function setupResizeObserver() {
  if (typeof ResizeObserver === 'undefined')
    return

  ro = new ResizeObserver(() => {
    if (bs) {
      bs.refresh()
      updateScrollAbility()
    }
  })

  if (wrapperRef.value)
    ro.observe(wrapperRef.value)
  if (contentRef.value)
    ro.observe(contentRef.value)
}

function destroyResizeObserver() {
  if (ro) {
    ro.disconnect()
    ro = null
  }
}

function setupMutationObserver() {
  if (!props.refreshOnContentChange)
    return
  if (typeof MutationObserver === 'undefined')
    return
  if (!contentRef.value)
    return

  mo = new MutationObserver(() => {
    scheduleRefresh()
  })

  mo.observe(contentRef.value, {
    subtree: true,
    childList: true,
    characterData: true,
  })
}

function handleNativeScroll(e: Event) {
  const target = e.target as HTMLElement
  emitScroll(target.scrollTop, target.scrollLeft)

  if (!props.pullUpLoad)
    return
  if (nativePullingUp)
    return

  const distanceToBottom = target.scrollHeight - (target.scrollTop + target.clientHeight)
  if (distanceToBottom <= props.pullUpThreshold) {
    nativePullingUp = true
    emit('pulling-up')
  }
}

function handleNativeTouchStart(e: TouchEvent) {
  if (!props.pullDownRefresh)
    return
  if (nativePullingDown)
    return
  if (!nativeScrollRef.value)
    return
  if (nativeScrollRef.value.scrollTop > 0)
    return

  const y = e.touches?.[0]?.clientY
  if (typeof y !== 'number')
    return
  nativeTouchStartY = y
}

function handleNativeTouchEnd(e: TouchEvent) {
  if (!props.pullDownRefresh)
    return
  if (nativePullingDown)
    return
  if (!nativeScrollRef.value)
    return
  if (nativeScrollRef.value.scrollTop > 0)
    return

  const startY = nativeTouchStartY
  nativeTouchStartY = null
  const y = e.changedTouches?.[0]?.clientY
  if (typeof startY !== 'number' || typeof y !== 'number')
    return

  const delta = y - startY
  if (delta >= props.pullDownThreshold) {
    nativePullingDown = true
    emit('pulling-down')
  }
}

defineExpose({
  nativeScrollRef,
  scrollTo(x: number, y: number, time = 0) {
    if (props.native) {
      nativeScrollRef.value?.scrollTo(x, y)
      return
    }

    if (bs) {
      bs.scrollTo(-x, -y, time)
    }
  },
  getScrollInfo(): TxScrollInfo {
    if (props.native && nativeScrollRef.value) {
      const el = nativeScrollRef.value
      return {
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
      }
    }

    if (bs && wrapperRef.value) {
      const el = wrapperRef.value
      return {
        scrollTop: Math.abs(bs.y || 0),
        scrollLeft: Math.abs(bs.x || 0),
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
      }
    }

    return {
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 0,
      scrollWidth: 0,
      clientHeight: 0,
      clientWidth: 0,
    }
  },
  refresh() {
    if (bs) {
      bs.refresh()
      updateScrollAbility()
    }
  },
  finishPullDown() {
    if (props.native) {
      nativePullingDown = false
      return
    }

    if (bs) {
      bs.finishPullDown?.()
      scheduleRefresh()
    }
  },
  finishPullUp() {
    if (props.native) {
      nativePullingUp = false
      return
    }

    if (bs) {
      bs.finishPullUp?.()
      scheduleRefresh()
    }
  },
})

onMounted(async () => {
  await nextTick()

  if (!props.native) {
    await initBetterScroll()
    setupResizeObserver()
    setupMutationObserver()
  }
})

onUnmounted(() => {
  destroyResizeObserver()
  destroyBetterScroll()
})

watch(
  () => props.native,
  async (nextNative) => {
    await nextTick()

    destroyResizeObserver()
    destroyBetterScroll()

    if (!nextNative) {
      await initBetterScroll()
      setupResizeObserver()
      setupMutationObserver()
    }
  },
)

watch(
  () => [
    props.direction,
    props.scrollbar,
    props.scrollbarFade,
    props.scrollbarInteractive,
    props.probeType,
    props.bounce,
    props.click,
    props.wheel,
    props.refreshOnContentChange,
    props.pullDownRefresh,
    props.pullDownThreshold,
    props.pullDownStop,
    props.pullUpLoad,
    props.pullUpThreshold,
    props.options,
  ],
  async () => {
    if (props.native)
      return

    await nextTick()
    destroyResizeObserver()
    destroyBetterScroll()
    await initBetterScroll()
    setupResizeObserver()
    setupMutationObserver()
  },
  { deep: true },
)
</script>

<template>
  <div class="tx-scroll" :class="{ 'is-native': native }">
    <template v-if="native">
      <div
        ref="nativeScrollRef"
        class="tx-scroll__native"
        :style="nativeScrollStyle"
        @scroll="handleNativeScroll"
        @touchstart="handleNativeTouchStart"
        @touchend="handleNativeTouchEnd"
      >
        <slot name="header" />
        <div class="tx-scroll__content" :style="contentStyle">
          <slot />
          <slot name="footer" />
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="wrapperRef" class="tx-scroll__wrapper" :class="wrapperClass" :style="wrapperStyle">
        <div ref="contentRef" class="tx-scroll__content" :style="contentStyle">
          <slot name="header" />
          <slot />
          <slot name="footer" />
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.tx-scroll {
  display: block;
  width: 100%;
  height: 100%;
}

.tx-scroll__native {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.tx-scroll__wrapper {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.tx-scroll__content {
  padding: 8px 12px;
  min-height: 100%;
}

.tx-scroll__wrapper :deep(.bscroll-vertical-scrollbar) {
  position: absolute !important;
  top: 4px;
  bottom: 4px;
  right: 2px;
  width: 6px;
  pointer-events: none;
  z-index: 1;
}

.tx-scroll__wrapper :deep(.bscroll-horizontal-scrollbar) {
  position: absolute !important;
  left: 4px;
  right: 4px;
  bottom: 2px;
  height: 6px;
  pointer-events: none;
  z-index: 1;
}

.tx-scroll__wrapper :deep(.bscroll-indicator) {
  pointer-events: auto;
  min-height: var(--tx-scrollbar-min-size);
  min-width: var(--tx-scrollbar-min-size);
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.35);
}

.tx-scroll__wrapper--always-visible :deep(.bscroll-vertical-scrollbar),
.tx-scroll__wrapper--always-visible :deep(.bscroll-horizontal-scrollbar) {
  opacity: 1 !important;
  display: block !important;
}

.tx-scroll__wrapper--wheeling :deep(.bscroll-vertical-scrollbar),
.tx-scroll__wrapper--wheeling :deep(.bscroll-horizontal-scrollbar) {
  opacity: 1 !important;
  display: block !important;
}
</style>
