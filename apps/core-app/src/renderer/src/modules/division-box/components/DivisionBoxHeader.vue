<template>
  <div class="division-box-header">
    <div class="header-left">
      <!-- Icon -->
      <i v-if="icon" :class="iconClass" class="header-icon" />
      
      <!-- Title -->
      <span class="header-title">{{ title }}</span>
    </div>
    
    <div class="header-right">
      <!-- Pin button -->
      <button 
        class="header-action-btn"
        :class="{ 'is-pinned': isPinned }"
        :title="isPinned ? 'Unpin' : 'Pin'"
        @click="handlePin"
      >
        <i class="i-ri-pushpin-line" />
      </button>
      
      <!-- Close button -->
      <button 
        class="header-action-btn header-close-btn"
        title="Close"
        @click="handleClose"
      >
        <i class="i-ri-close-line" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDivisionBoxStore } from '../store/division-box'

/**
 * Props definition for DivisionBoxHeader component
 */
interface Props {
  /** Session ID */
  sessionId: string
  
  /** Display title */
  title: string
  
  /** Icon (iconify format or class) */
  icon?: string
}

const props = defineProps<Props>()

/**
 * Emits
 */
const emit = defineEmits<{
  close: []
  pin: []
}>()

// Store
const store = useDivisionBoxStore()

// Computed
const iconClass = computed(() => {
  if (!props.icon) return ''
  
  // If it's already a class (starts with 'i-' or contains space), use it directly
  if (props.icon.startsWith('i-') || props.icon.includes(' ')) {
    return props.icon
  }
  
  // Otherwise, assume it's an iconify format (e.g., 'ri:magic-line')
  // Convert to UnoCSS format: 'ri:magic-line' -> 'i-ri-magic-line'
  return `i-${props.icon.replace(':', '-')}`
})

const isPinned = computed(() => {
  return store.pinnedList.includes(props.sessionId)
})

// Methods
const handleClose = () => {
  emit('close')
}

const handlePin = () => {
  emit('pin')
}
</script>

<style scoped lang="scss">
.division-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: move;
  user-select: none;
  min-height: 40px;
  
  &:hover {
    background: var(--el-fill-color-light);
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0; // Allow text truncation
}

.header-icon {
  font-size: 16px;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: all 0.2s ease;
  
  i {
    font-size: 16px;
  }
  
  &:hover {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  &.is-pinned {
    color: var(--el-color-primary);
    
    i {
      transform: rotate(45deg);
    }
  }
}

.header-close-btn {
  &:hover {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }
}
</style>
