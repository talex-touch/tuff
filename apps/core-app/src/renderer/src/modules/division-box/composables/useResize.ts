/**
 * useResize Composable
 * 
 * Handles resize functionality for DivisionBox, including:
 * - Resize start/move/end logic
 * - Multi-directional resizing (8 handles)
 * - Size constraints (min/max)
 * - Size persistence
 */

import { ref, onUnmounted } from 'vue'
import { useDivisionBoxStore } from '../store/division-box'
import type { SizePreset } from '../types'

export interface Dimensions {
  width: number
  height: number
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// Minimum dimensions
const MIN_WIDTH = 300
const MIN_HEIGHT = 200

// Maximum dimensions
const MAX_WIDTH = window.innerWidth
const MAX_HEIGHT = window.innerHeight

export function useResize(sessionId: string, initialSize: SizePreset) {
  const store = useDivisionBoxStore()
  
  // State
  const isResizing = ref(false)
  const dimensions = ref<Dimensions>({
    width: initialSize.width,
    height: initialSize.height
  })
  const resizeStartDimensions = ref<Dimensions>({ width: 0, height: 0 })
  const mouseStartPos = ref({ x: 0, y: 0 })
  const currentHandle = ref<ResizeHandle>('se')
  
  /**
   * Start resizing
   */
  const startResize = (e: MouseEvent, handle: ResizeHandle) => {
    isResizing.value = true
    currentHandle.value = handle
    mouseStartPos.value = { x: e.clientX, y: e.clientY }
    resizeStartDimensions.value = { ...dimensions.value }
    
    // Update store UI state
    store.setResizingSession(sessionId)
    
    // Add event listeners
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    
    // Prevent text selection
    e.preventDefault()
  }
  
  /**
   * Handle resize move
   */
  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing.value) return
    
    const deltaX = e.clientX - mouseStartPos.value.x
    const deltaY = e.clientY - mouseStartPos.value.y
    
    const handle = currentHandle.value
    let newWidth = resizeStartDimensions.value.width
    let newHeight = resizeStartDimensions.value.height
    
    // Calculate new dimensions based on handle direction
    if (handle.includes('e')) {
      newWidth = resizeStartDimensions.value.width + deltaX
    } else if (handle.includes('w')) {
      newWidth = resizeStartDimensions.value.width - deltaX
    }
    
    if (handle.includes('s')) {
      newHeight = resizeStartDimensions.value.height + deltaY
    } else if (handle.includes('n')) {
      newHeight = resizeStartDimensions.value.height - deltaY
    }
    
    // Apply constraints
    newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight))
    
    dimensions.value = {
      width: newWidth,
      height: newHeight
    }
  }
  
  /**
   * Handle resize end
   */
  const handleResizeEnd = () => {
    if (!isResizing.value) return
    
    isResizing.value = false
    
    // Update store UI state
    store.setResizingSession(null)
    
    // Save dimensions to persistence
    saveDimensions()
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
  }
  
  /**
   * Set dimensions to a specific size
   */
  const setDimensions = (newDimensions: Dimensions) => {
    dimensions.value = {
      width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newDimensions.width)),
      height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newDimensions.height))
    }
    saveDimensions()
  }
  
  /**
   * Apply a size preset
   */
  const applySizePreset = (preset: SizePreset) => {
    setDimensions(preset)
  }
  
  /**
   * Save dimensions to persistent storage
   */
  const saveDimensions = async () => {
    try {
      await store.updateSessionState(sessionId, 'dimensions', dimensions.value)
    } catch (error) {
      console.error('Failed to save dimensions:', error)
    }
  }
  
  /**
   * Cleanup on unmount
   */
  onUnmounted(() => {
    if (isResizing.value) {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  })
  
  return {
    isResizing,
    dimensions,
    startResize,
    setDimensions,
    applySizePreset
  }
}
