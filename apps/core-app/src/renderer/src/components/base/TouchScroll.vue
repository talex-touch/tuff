<script setup lang="ts">
import { TxScroll as TuffTouchScroll } from '@talex-touch/tuffex'

defineOptions({
  name: 'TouchScroll'
})

const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    native?: boolean
  }>(),
  {
    noPadding: false,
    native: false
  }
)

const emit = defineEmits<{
  scroll: [scrollInfo: { scrollTop: number; scrollLeft: number }]
}>()

const attrs = useAttrs()
type ScrollInfo = {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
}

type ScrollInstance = InstanceType<typeof TuffTouchScroll> & {
  nativeScrollRef?: unknown
  scrollTo?: (x: number, y: number, time?: number) => void
  getScrollInfo?: () => ScrollInfo
  refresh?: () => void
}

const scrollRef = ref<ScrollInstance | null>(null)

const useNative = computed(() => {
  return props.native
})

const isMacLike =
  typeof navigator !== 'undefined' &&
  (String(navigator.platform).includes('Mac') || String(navigator.userAgent).includes('Mac OS X'))

const resolvedBScrollOptions = computed(() => {
  const raw = (attrs as { options?: unknown }).options
  const options = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  if (!isMacLike) return options

  if (Object.prototype.hasOwnProperty.call(options, 'useTransition')) return options

  return { ...options, useTransition: false }
})

defineExpose({
  nativeScrollRef: computed(() => scrollRef.value?.nativeScrollRef ?? null),
  elScrollRef: undefined,
  scrollTo(x: number, y: number, time?: number) {
    scrollRef.value?.scrollTo?.(x, y, time)
  },
  getScrollInfo() {
    return (
      scrollRef.value?.getScrollInfo?.() ?? {
        scrollTop: 0,
        scrollLeft: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        clientHeight: 0,
        clientWidth: 0
      }
    )
  },
  refresh() {
    scrollRef.value?.refresh?.()
  }
})
</script>

<template>
  <TuffTouchScroll
    ref="scrollRef"
    class="touch-scroll"
    v-bind="$attrs"
    :no-padding="noPadding"
    :native="useNative"
    :options="resolvedBScrollOptions"
    @scroll="(info) => emit('scroll', info)"
  >
    <template #header>
      <slot name="header" />
    </template>
    <template #footer>
      <slot name="footer" />
    </template>
    <slot />
  </TuffTouchScroll>
</template>

<style lang="scss" scoped>
.touch-scroll {
  width: 100%;
  height: 100%;
  position: relative;
  min-height: 0;
  min-width: 0;
  flex: 1;
  align-self: stretch;
}
</style>
