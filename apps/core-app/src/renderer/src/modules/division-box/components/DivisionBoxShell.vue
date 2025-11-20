<template>
  <Transition name="division-box-fade">
    <div 
      v-if="isVisible"
      ref="shellRef"
      class="division-box-shell"
      :class="shellClasses"
      :style="shellStyle"
      @mousedown="handleMouseDown"
    >
    <!-- Header 区域 -->
    <DivisionBoxHeader
      v-if="showHeader"
      :title="title"
      :icon="icon"
      :session-id="sessionId"
      @close="handleClose"
      @pin="handlePin"
    />

    <!-- Content 区域 (WebContentsView 容器) -->
    <div 
      ref="contentRef" 
      class="division-box-content"
    >
      <!-- Loading indicator -->
      <div v-if="isLoading" class="state-indicator loading-indicator">
        <div class="loading-spinner" />
        <span>Loading...</span>
      </div>
      
      <!-- State badge -->
      <div v-if="stateBadge" class="state-badge" :class="`state-${stateBadge}`">
        {{ stateBadge }}
      </div>
      
      <!-- WebContentsView 将被挂载到这里 -->
    </div>

    <!-- Resize 手柄 -->
    <div 
      v-for="handle in resizeHandles" 
      :key="handle"
      :class="`resize-handle resize-handle-${handle}`"
      @mousedown.stop="handleResizeStart($event, handle)"
    />

    <!-- Dock 对齐提示 -->
    <DockHint
      v-if="showDockHint"
      :position="dockHintPosition"
    />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import DivisionBoxHeader from './DivisionBoxHeader.vue'
import DockHint from './DockHint.vue'
import { useDrag } from '../composables/useDrag'
import { useResize } from '../composables/useResize'
import { useDivisionBoxStore } from '../store/division-box'
import type { DivisionBoxSize } from '../types'
import { SIZE_PRESETS } from '../types'

/**
 * Props definition for DivisionBoxShell component
 */
interface Props {
  /** Unique session identifier */
  sessionId: string
  
  /** Display title */
  title: string
  
  /** Icon (iconify format) */
  icon?: string
  
  /** Size preset */
  size: DivisionBoxSize
  
  /** Show header */
  showHeader: boolean
  
  /** Initial position */
  initialX?: number
  initialY?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  showHeader: true,
  initialX: 100,
  initialY: 100
})

// Refs
const shellRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const isVisible = ref(true)
const isLoading = ref(false)
const currentState = ref<string>('active')

// Store
const store = useDivisionBoxStore()

// Composables
const {
  isDragging,
  position,
  showDockHint,
  dockHintPosition,
  startDrag
} = useDrag(props.sessionId, props.initialX, props.initialY)

const {
  isResizing,
  dimensions,
  startResize
} = useResize(props.sessionId, SIZE_PRESETS[props.size])

// Computed
const shellClasses = computed(() => ({
  [`size-${props.size}`]: true,
  'immersive': !props.showHeader,
  'dragging': isDragging.value,
  'resizing': isResizing.value
}))

const shellStyle = computed(() => ({
  transform: `translate(${position.value.x}px, ${position.value.y}px)`,
  width: `${dimensions.value.width}px`,
  height: `${dimensions.value.height}px`,
  transition: isDragging.value || isResizing.value 
    ? 'none' 
    : 'transform 0.3s ease, width 0.3s ease, height 0.3s ease'
}))

const stateBadge = computed(() => {
  // Show state badge for non-active states
  if (currentState.value === 'active') return null
  return currentState.value
})

// Resize handles (8 directions)
const resizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

// Methods
const handleMouseDown = (e: MouseEvent) => {
  // Only start drag if clicking on the shell itself (not on resize handles or content)
  if (
    e.target === shellRef.value || 
    (e.target as HTMLElement).classList.contains('division-box-header')
  ) {
    startDrag(e)
  }
}

const handleResizeStart = (e: MouseEvent, handle: typeof resizeHandles[number]) => {
  startResize(e, handle)
}

const handleClose = async () => {
  await store.closeDivisionBox(props.sessionId)
}

const handlePin = () => {
  store.togglePin(props.sessionId)
}

// Lifecycle
onMounted(() => {
  // Component mounted, ready for WebContentsView attachment
  isLoading.value = true
  
  // Listen for state changes
  window.electron.ipcRenderer.on('division-box:state-changed', (_event: any, data: any) => {
    if (data.sessionId === props.sessionId) {
      currentState.value = data.newState
      
      // Hide loading when active
      if (data.newState === 'active') {
        isLoading.value = false
      }
    }
  })
  
  // Simulate initial load completion
  setTimeout(() => {
    isLoading.value = false
  }, 500)
})

onUnmounted(() => {
  // Cleanup if needed
})
</script>

<style scoped lang="scss">
.division-box-shell {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 1000;
  transition: box-shadow 0.2s ease;
  
  &.dragging {
    cursor: move;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    user-select: none;
  }
  
  &.resizing {
    user-select: none;
  }
  
  &.immersive {
    border-radius: 12px;
  }
}

.division-box-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

// State indicators
.state-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 100;
}

.loading-indicator {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--el-border-color);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  z-index: 100;
  
  &.state-prepare {
    background: var(--el-color-info-light-9);
    color: var(--el-color-info);
  }
  
  &.state-attach {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
  
  &.state-inactive {
    background: var(--el-color-info-light-9);
    color: var(--el-color-info);
  }
  
  &.state-detach {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
  
  &.state-destroy {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }
}

// Resize handles
.resize-handle {
  position: absolute;
  z-index: 10;
  
  &.resize-handle-n {
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: ns-resize;
  }
  
  &.resize-handle-s {
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: ns-resize;
  }
  
  &.resize-handle-e {
    top: 0;
    right: 0;
    bottom: 0;
    width: 4px;
    cursor: ew-resize;
  }
  
  &.resize-handle-w {
    top: 0;
    left: 0;
    bottom: 0;
    width: 4px;
    cursor: ew-resize;
  }
  
  &.resize-handle-ne {
    top: 0;
    right: 0;
    width: 8px;
    height: 8px;
    cursor: nesw-resize;
  }
  
  &.resize-handle-nw {
    top: 0;
    left: 0;
    width: 8px;
    height: 8px;
    cursor: nwse-resize;
  }
  
  &.resize-handle-se {
    bottom: 0;
    right: 0;
    width: 8px;
    height: 8px;
    cursor: nwse-resize;
  }
  
  &.resize-handle-sw {
    bottom: 0;
    left: 0;
    width: 8px;
    height: 8px;
    cursor: nesw-resize;
  }
}

// Size presets
.size-compact {
  min-width: 300px;
  min-height: 200px;
}

.size-medium {
  min-width: 400px;
  min-height: 300px;
}

.size-expanded {
  min-width: 600px;
  min-height: 400px;
}

// Transition animations
.division-box-fade-enter-active {
  animation: division-box-fade-in 0.25s ease-out;
}

.division-box-fade-leave-active {
  animation: division-box-fade-out 0.25s ease-in;
}

@keyframes division-box-fade-in {
  from {
    opacity: 0;
    transform: translate(var(--initial-x, 100px), var(--initial-y, 100px)) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(var(--initial-x, 100px), var(--initial-y, 100px)) scale(1);
  }
}

@keyframes division-box-fade-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
