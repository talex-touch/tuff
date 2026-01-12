<script setup lang="ts">
import { TouchScroll as TuffTouchScroll } from '@talex-touch/tuffex'
import { hasWindow } from '@talex-touch/utils/env'

defineOptions({
  name: 'TouchScroll',
})

const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    native?: boolean
  }>(),
  {
    noPadding: false,
    native: false,
  },
)

const emit = defineEmits<{
  scroll: [scrollInfo: { scrollTop: number, scrollLeft: number }]
}>()

const scrollRef = ref<InstanceType<typeof TuffTouchScroll> | null>(null)

const isDarwin = computed(() => {
  if (!hasWindow())
    return false

  return window.$initInfo.platform === 'darwin'
})

const useNative = computed(() => {
  return props.native || isDarwin.value
})

defineExpose({
  nativeScrollRef: computed(() => (scrollRef.value as any)?.nativeScrollRef ?? null),
  elScrollRef: undefined,
  scrollTo(x: number, y: number, time?: number) {
    ;(scrollRef.value as any)?.scrollTo?.(x, y, time)
  },
  getScrollInfo() {
    return (scrollRef.value as any)?.getScrollInfo?.() ?? {
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 0,
      scrollWidth: 0,
      clientHeight: 0,
      clientWidth: 0,
    }
  },
  refresh() {
    ;(scrollRef.value as any)?.refresh?.()
  },
})
</script>

<template>
  <TuffTouchScroll
    ref="scrollRef"
    class="touch-scroll"
    v-bind="$attrs"
    :no-padding="noPadding"
    :native="useNative"
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
}
</style>
