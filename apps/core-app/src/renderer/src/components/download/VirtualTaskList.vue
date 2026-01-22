<script setup lang="ts">
import type { DownloadTask } from '@talex-touch/utils'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { rafThrottle } from '~/utils/performance'
import TaskCard from './TaskCard.vue'

interface Props {
  tasks: DownloadTask[]
  viewMode: 'detailed' | 'compact'
  itemHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 120 // Default height for detailed view
})

const emit = defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  cancel: [taskId: string]
  retry: [taskId: string]
  remove: [taskId: string]
  delete: [taskId: string]
  'open-file': [taskId: string]
  'show-in-folder': [taskId: string]
  'show-details': [taskId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(600)
const overscan = 3 // Number of items to render outside visible area

// Calculate item height based on view mode
const itemHeight = computed(() => {
  return props.viewMode === 'compact' ? 80 : props.itemHeight
})

// Total height of all items
const totalHeight = computed(() => {
  return props.tasks.length * itemHeight.value
})

// Calculate visible range
const visibleRange = computed(() => {
  const start = Math.floor(scrollTop.value / itemHeight.value)
  const end = Math.ceil((scrollTop.value + containerHeight.value) / itemHeight.value)

  return {
    start: Math.max(0, start - overscan),
    end: Math.min(props.tasks.length, end + overscan)
  }
})

// Get visible tasks
const visibleTasks = computed(() => {
  const { start, end } = visibleRange.value
  return props.tasks.slice(start, end)
})

// Calculate offset for positioning
const offsetY = computed(() => {
  return visibleRange.value.start * itemHeight.value
})

// Throttled scroll handler
const handleScroll = rafThrottle(() => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop
  }
})

// Update container height on mount and resize
function updateContainerHeight() {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

onMounted(() => {
  updateContainerHeight()
  window.addEventListener('resize', updateContainerHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight)
})

// Reset scroll when tasks change significantly
watch(
  () => props.tasks.length,
  (newLength, oldLength) => {
    if (newLength < oldLength && scrollTop.value > totalHeight.value) {
      scrollTop.value = Math.max(0, totalHeight.value - containerHeight.value)
      if (containerRef.value) {
        containerRef.value.scrollTop = scrollTop.value
      }
    }
  }
)
</script>

<template>
  <div ref="containerRef" class="virtual-task-list" @scroll="handleScroll">
    <div class="virtual-scroll-spacer" :style="{ height: `${totalHeight}px` }">
      <div class="virtual-scroll-content" :style="{ transform: `translateY(${offsetY}px)` }">
        <TaskCard
          v-for="task in visibleTasks"
          :key="task.id"
          :task="task"
          :view-mode="viewMode"
          @pause="$emit('pause', task.id)"
          @resume="$emit('resume', task.id)"
          @cancel="$emit('cancel', task.id)"
          @retry="$emit('retry', task.id)"
          @remove="$emit('remove', task.id)"
          @delete="$emit('delete', task.id)"
          @open-file="$emit('open-file', task.id)"
          @show-in-folder="$emit('show-in-folder', task.id)"
          @show-details="$emit('show-details', task.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-task-list {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.virtual-scroll-spacer {
  position: relative;
  width: 100%;
}

.virtual-scroll-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Scrollbar styling */
.virtual-task-list::-webkit-scrollbar {
  width: 8px;
}

.virtual-task-list::-webkit-scrollbar-track {
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.virtual-task-list::-webkit-scrollbar-thumb {
  background: var(--el-fill-color-dark);
  border-radius: 4px;
}

.virtual-task-list::-webkit-scrollbar-thumb:hover {
  background: var(--el-fill-color-darker);
}
</style>
