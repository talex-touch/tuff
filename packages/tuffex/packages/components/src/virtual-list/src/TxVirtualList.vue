<script setup lang="ts">
import type { VirtualListEmits, VirtualListKey, VirtualListProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'TxVirtualList' })

const props = withDefaults(defineProps<VirtualListProps<any>>(), {
  items: () => [],
  height: 320,
  overscan: 4,
})

const emit = defineEmits<VirtualListEmits>()

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

const resolvedHeight = computed(() => (typeof props.height === 'number' ? `${props.height}px` : props.height))

function parseHeight(value: number | string): number | null {
  if (typeof value === 'number')
    return value
  const trimmed = value.trim()
  if (trimmed.endsWith('%') || trimmed.endsWith('vh') || trimmed.endsWith('vw') || trimmed.endsWith('rem') || trimmed.endsWith('em'))
    return null
  if (trimmed.endsWith('px')) {
    const parsed = Number.parseFloat(trimmed.slice(0, -2))
    return Number.isFinite(parsed) ? parsed : null
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number.parseFloat(trimmed)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

function updateViewport() {
  if (!containerRef.value)
    return
  const height = containerRef.value.clientHeight
  if (height > 0)
    viewHeight.value = height
}

watch(
  () => props.height,
  (v) => {
    const parsed = parseHeight(v)
    if (parsed != null) {
      viewHeight.value = parsed
      return
    }
    updateViewport()
  },
  { immediate: true },
)

onMounted(() => {
  updateViewport()
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => updateViewport())
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const startIndex = computed(() => {
  const base = Math.floor(scrollTop.value / props.itemHeight)
  return Math.max(0, base - (props.overscan ?? 0))
})

const endIndex = computed(() => {
  const base = Math.ceil((scrollTop.value + viewHeight.value) / props.itemHeight)
  return Math.min(props.items.length, base + (props.overscan ?? 0))
})

const visibleItems = computed(() => {
  return props.items.slice(startIndex.value, endIndex.value).map((item, i) => ({
    item,
    index: startIndex.value + i,
  }))
})

const totalHeight = computed(() => props.items.length * props.itemHeight)
const offsetTop = computed(() => startIndex.value * props.itemHeight)

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  scrollTop.value = el.scrollTop
  emit('scroll', { scrollTop: scrollTop.value, startIndex: startIndex.value, endIndex: endIndex.value })
}

function resolveKey(item: any, index: number): VirtualListKey {
  if (typeof props.itemKey === 'function')
    return props.itemKey(item, index)
  if (typeof props.itemKey === 'string' && props.itemKey)
    return item?.[props.itemKey] ?? index
  return index
}

function scrollToIndex(index: number) {
  if (!containerRef.value)
    return
  containerRef.value.scrollTop = Math.max(0, index) * props.itemHeight
}

function scrollToTop() {
  if (containerRef.value)
    containerRef.value.scrollTop = 0
}

function scrollToBottom() {
  if (containerRef.value)
    containerRef.value.scrollTop = Math.max(0, totalHeight.value - viewHeight.value)
}

defineExpose({ scrollToIndex, scrollToTop, scrollToBottom })
</script>

<template>
  <div ref="containerRef" class="tx-virtual-list" :style="{ height: resolvedHeight }" @scroll="onScroll">
    <div class="tx-virtual-list__spacer" :style="{ height: `${totalHeight}px` }">
      <div class="tx-virtual-list__items" :style="{ transform: `translateY(${offsetTop}px)` }">
        <div
          v-for="entry in visibleItems"
          :key="resolveKey(entry.item, entry.index)"
          class="tx-virtual-list__item"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot name="item" :item="entry.item" :index="entry.index">
            {{ entry.item }}
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-virtual-list {
  width: 100%;
  overflow: auto;
  position: relative;
}

.tx-virtual-list__spacer {
  position: relative;
  width: 100%;
}

.tx-virtual-list__items {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}

.tx-virtual-list__item {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
}
</style>
