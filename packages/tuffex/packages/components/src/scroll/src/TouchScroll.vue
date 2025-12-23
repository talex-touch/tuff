<script lang="ts" setup>
import { computed, ref } from 'vue'
import TxScroll from './TxScroll.vue'

defineOptions({
  name: 'TouchScroll',
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
  scroll: [scrollInfo: { scrollTop: number; scrollLeft: number }]
  'pulling-down': []
  'pulling-up': []
}>()

const scrollRef = ref<InstanceType<typeof TxScroll> | null>(null)

const nativeScrollRef = computed(() => {
  return (scrollRef.value as any)?.nativeScrollRef ?? null
})

function scrollTo(x: number, y: number, time?: number) {
  ;(scrollRef.value as any)?.scrollTo?.(x, y, time)
}

function getScrollInfo() {
  return (scrollRef.value as any)?.getScrollInfo?.()
}

function refresh() {
  ;(scrollRef.value as any)?.refresh?.()
}

function finishPullDown() {
  ;(scrollRef.value as any)?.finishPullDown?.()
}

function finishPullUp() {
  ;(scrollRef.value as any)?.finishPullUp?.()
}

defineExpose({
  nativeScrollRef,
  elScrollRef: undefined,
  scrollTo,
  getScrollInfo,
  refresh,
  finishPullDown,
  finishPullUp,
})
</script>

<template>
  <TxScroll
    ref="scrollRef"
    :no-padding="noPadding"
    :native="native"
    :scroll-chaining="scrollChaining"
    :direction="direction"
    :scrollbar="scrollbar"
    :scrollbar-fade="scrollbarFade"
    :scrollbar-interactive="scrollbarInteractive"
    :scrollbar-always-visible="scrollbarAlwaysVisible"
    :scrollbar-min-size="scrollbarMinSize"
    :probe-type="probeType"
    :bounce="bounce"
    :click="click"
    :wheel="wheel"
    :refresh-on-content-change="refreshOnContentChange"
    :pull-down-refresh="pullDownRefresh"
    :pull-down-threshold="pullDownThreshold"
    :pull-down-stop="pullDownStop"
    :pull-up-load="pullUpLoad"
    :pull-up-threshold="pullUpThreshold"
    :options="options"
    @scroll="(v) => emit('scroll', v)"
    @pulling-down="() => emit('pulling-down')"
    @pulling-up="() => emit('pulling-up')"
  >
    <template #header>
      <slot name="header" />
    </template>
    <template #footer>
      <slot name="footer" />
    </template>
    <slot />
  </TxScroll>
</template>
