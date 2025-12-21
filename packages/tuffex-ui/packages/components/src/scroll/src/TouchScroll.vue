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

defineExpose({
  nativeScrollRef,
  elScrollRef: undefined,
  scrollTo,
  getScrollInfo,
  refresh,
})
</script>

<template>
  <TxScroll
    ref="scrollRef"
    :no-padding="noPadding"
    :native="native"
    :options="options"
    @scroll="(v) => emit('scroll', v)"
  >
    <template #header>
      <slot name="header" />
    </template>
    <slot />
  </TxScroll>
</template>
