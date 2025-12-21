<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TxScrollInfo } from './types'

type BetterScroll = any

defineOptions({
  name: 'TxScroll',
})

const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    native?: boolean
    options?: Record<string, unknown>
  }>(),
  {
    noPadding: false,
    native: false,
    options: () => ({}),
  },
)

const emit = defineEmits<{
  scroll: [scrollInfo: { scrollTop: number; scrollLeft: number }]
}>()

const wrapperRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const nativeScrollRef = ref<HTMLElement | null>(null)

let bs: BetterScroll | null = null
let ro: ResizeObserver | null = null

function emitScroll(scrollTop: number, scrollLeft: number) {
  emit('scroll', { scrollTop, scrollLeft })
}

async function initBetterScroll() {
  if (!wrapperRef.value) return

  const { default: BScroll } = await import('@better-scroll/core')
  const { ScrollBar } = await import('@better-scroll/scroll-bar')

  BScroll.use(ScrollBar)

  bs = new BScroll(wrapperRef.value, {
    scrollX: false,
    scrollY: true,
    probeType: 3,
    scrollbar: {
      fade: true,
      interactive: true,
    },
    ...props.options,
  })

  bs.on('scroll', (pos: { x: number; y: number }) => {
    emitScroll(Math.abs(pos.y), Math.abs(pos.x))
  })
}

function destroyBetterScroll() {
  if (bs) {
    bs.destroy()
    bs = null
  }
}

function setupResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return

  ro = new ResizeObserver(() => {
    if (bs) bs.refresh()
  })

  if (wrapperRef.value) ro.observe(wrapperRef.value)
  if (contentRef.value) ro.observe(contentRef.value)
}

function destroyResizeObserver() {
  if (ro) {
    ro.disconnect()
    ro = null
  }
}

function handleNativeScroll(e: Event) {
  const target = e.target as HTMLElement
  emitScroll(target.scrollTop, target.scrollLeft)
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
    if (bs) bs.refresh()
  },
})

onMounted(async () => {
  await nextTick()

  if (!props.native) {
    await initBetterScroll()
    setupResizeObserver()
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
    }
  },
)
</script>

<template>
  <div class="tx-scroll" :class="{ 'is-native': native }">
    <template v-if="native">
      <div ref="nativeScrollRef" class="tx-scroll__native" @scroll="handleNativeScroll">
        <slot name="header" />
        <div class="tx-scroll__content" :style="noPadding ? 'padding: 0 !important' : ''">
          <slot />
        </div>
      </div>
    </template>

    <template v-else>
      <div ref="wrapperRef" class="tx-scroll__wrapper">
        <div ref="contentRef" class="tx-scroll__content" :style="noPadding ? 'padding: 0 !important' : ''">
          <slot name="header" />
          <slot />
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.tx-scroll {
  width: 100%;
  height: 100%;
}

.tx-scroll__native {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.tx-scroll__wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.tx-scroll__content {
  padding: 8px 12px;
}
</style>
