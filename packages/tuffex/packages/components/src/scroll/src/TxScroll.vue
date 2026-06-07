<script lang="ts" setup>
import type { TxScrollInfo } from './types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { installBetterScrollPullDown, installBetterScrollPullUp } from './better-scroll-pull-plugins'
import { isMacOSSafari, supportsNativeNonRootOverscrollBounce } from './runtime-capabilities'
import { useScrollWheel } from './scroll-wheel'

type BetterScroll = any

defineOptions({
  name: 'TxScroll',
})
const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    native?: boolean
    unified?: boolean
    nativeAutoFallback?: boolean
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
    unified: false,
    nativeAutoFallback: true,
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

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const nativeScrollRef = ref<HTMLElement | null>(null)

const isRuntimeReady = ref(false)
const canScrollY = ref(false)
const canScrollX = ref(false)
const shouldAutoFallbackToNative = computed(() => {
  if (!isRuntimeReady.value)
    return false
  if (props.unified)
    return false
  if (isMacOSSafari())
    return true
  return props.nativeAutoFallback && supportsNativeNonRootOverscrollBounce()
})
const isNativeMode = computed(() => props.native || shouldAutoFallbackToNative.value)

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
let refreshTimer: number | null = null
const {
  isWheeling,
  getOptions: getWheelOptions,
  getTransitionOverride,
  setupWheel,
  destroyWheel,
} = useScrollWheel({
  props,
  isNativeMode,
  isScrollXEnabled,
  isScrollYEnabled,
  getBetterScroll: () => bs,
})

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
    await installBetterScrollPullDown(BScroll)
  }

  if (shouldUsePullUp) {
    await installBetterScrollPullUp(BScroll)
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

  const { optionsFromProps } = getWheelOptions()

  // The dynamic imports / plugin installs above yield to the event loop. If the
  // component unmounted (or its DOM was torn down) in that gap, wrapperRef is now
  // null — bail before handing null to BScroll (whose later refresh() crashes on
  // undefined content) and to setupWheel (addEventListener on null).
  if (!wrapperRef.value)
    return

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
    ...getTransitionOverride(),
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

  setupWheel(wrapperRef.value)
}

function destroyBetterScroll() {
  destroyWheel()

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
    if (isNativeMode.value) {
      nativeScrollRef.value?.scrollTo(x, y)
      return
    }

    if (bs) {
      bs.scrollTo(-x, -y, time)
    }
  },
  getScrollInfo(): TxScrollInfo {
    if (isNativeMode.value && nativeScrollRef.value) {
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
    if (isNativeMode.value) {
      nativePullingDown = false
      return
    }

    if (bs) {
      bs.finishPullDown?.()
      scheduleRefresh()
    }
  },
  finishPullUp() {
    if (isNativeMode.value) {
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
  isRuntimeReady.value = true
  await nextTick()

  if (!isNativeMode.value) {
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
  () => isNativeMode.value,
  async (nextIsNative) => {
    await nextTick()

    destroyResizeObserver()
    destroyBetterScroll()

    if (!nextIsNative) {
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
    if (isNativeMode.value)
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
  <div class="tx-scroll" :class="{ 'is-native': isNativeMode }">
    <template v-if="isNativeMode">
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
