/**
 * useDrag Composable
 *
 * Handles drag functionality for DivisionBox, including:
 * - Drag start/move/end logic
 * - Edge detection and snap hints
 * - Position persistence
 */

import { onUnmounted, ref } from 'vue'
import { useDivisionBoxStore } from '../store/division-box'
import { EDGE_SNAP_THRESHOLD } from '../types'

export interface DragPosition {
  x: number
  y: number
}

export interface DockHintPosition {
  x: number
  y: number
  width: number
  height: number
}

export function useDrag(sessionId: string, initialX: number = 100, initialY: number = 100) {
  const store = useDivisionBoxStore()

  // State
  const isDragging = ref(false)
  const position = ref<DragPosition>({ x: initialX, y: initialY })
  const dragStartPos = ref<DragPosition>({ x: 0, y: 0 })
  const mouseStartPos = ref<DragPosition>({ x: 0, y: 0 })
  const showDockHint = ref(false)
  const dockHintPosition = ref<DockHintPosition | undefined>()

  /**
   * Start dragging
   */
  const startDrag = (e: MouseEvent) => {
    isDragging.value = true
    mouseStartPos.value = { x: e.clientX, y: e.clientY }
    dragStartPos.value = { ...position.value }

    // Update store UI state
    store.setDraggingSession(sessionId)

    // Add event listeners
    document.addEventListener('mousemove', handleDragMove)
    document.addEventListener('mouseup', handleDragEnd)

    // Prevent text selection
    e.preventDefault()
  }

  /**
   * Handle drag move
   */
  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging.value) return

    // Calculate new position
    const deltaX = e.clientX - mouseStartPos.value.x
    const deltaY = e.clientY - mouseStartPos.value.y

    position.value = {
      x: dragStartPos.value.x + deltaX,
      y: dragStartPos.value.y + deltaY
    }

    // Check for edge proximity and show dock hint
    checkEdgeProximity(e.clientX, e.clientY)
  }

  /**
   * Handle drag end
   */
  const handleDragEnd = (e: MouseEvent) => {
    if (!isDragging.value) return

    isDragging.value = false

    // Apply snap if near edge
    applyEdgeSnap(e.clientX, e.clientY)

    // Hide dock hint
    showDockHint.value = false
    dockHintPosition.value = undefined

    // Update store UI state
    store.setDraggingSession(null)

    // Save position to persistence
    savePosition()

    // Remove event listeners
    document.removeEventListener('mousemove', handleDragMove)
    document.removeEventListener('mouseup', handleDragEnd)
  }

  /**
   * Check if cursor is near screen edge
   */
  const checkEdgeProximity = (clientX: number, clientY: number) => {
    const screenWidth = window.innerWidth
    const screenHeight = window.innerHeight

    const nearLeft = clientX < EDGE_SNAP_THRESHOLD
    const nearRight = clientX > screenWidth - EDGE_SNAP_THRESHOLD
    const nearTop = clientY < EDGE_SNAP_THRESHOLD
    const nearBottom = clientY > screenHeight - EDGE_SNAP_THRESHOLD

    if (nearLeft || nearRight || nearTop || nearBottom) {
      showDockHint.value = true

      // Calculate dock hint position
      if (nearLeft) {
        dockHintPosition.value = {
          x: 0,
          y: 0,
          width: screenWidth / 2,
          height: screenHeight
        }
      } else if (nearRight) {
        dockHintPosition.value = {
          x: screenWidth / 2,
          y: 0,
          width: screenWidth / 2,
          height: screenHeight
        }
      } else if (nearTop) {
        dockHintPosition.value = {
          x: 0,
          y: 0,
          width: screenWidth,
          height: screenHeight / 2
        }
      } else if (nearBottom) {
        dockHintPosition.value = {
          x: 0,
          y: screenHeight / 2,
          width: screenWidth,
          height: screenHeight / 2
        }
      }
    } else {
      showDockHint.value = false
      dockHintPosition.value = undefined
    }
  }

  /**
   * Apply edge snap when releasing near edge
   */
  const applyEdgeSnap = (clientX: number, clientY: number) => {
    const screenWidth = window.innerWidth
    const screenHeight = window.innerHeight

    const nearLeft = clientX < EDGE_SNAP_THRESHOLD
    const nearRight = clientX > screenWidth - EDGE_SNAP_THRESHOLD
    const nearTop = clientY < EDGE_SNAP_THRESHOLD
    const nearBottom = clientY > screenHeight - EDGE_SNAP_THRESHOLD

    if (nearLeft) {
      position.value.x = 0
    } else if (nearRight) {
      position.value.x = screenWidth / 2
    }

    if (nearTop) {
      position.value.y = 0
    } else if (nearBottom) {
      position.value.y = screenHeight / 2
    }
  }

  /**
   * Save position to persistent storage
   */
  const savePosition = async () => {
    try {
      await store.updateSessionState(sessionId, 'position', position.value)
    } catch (error) {
      console.error('Failed to save position:', error)
    }
  }

  /**
   * Cleanup on unmount
   */
  onUnmounted(() => {
    if (isDragging.value) {
      document.removeEventListener('mousemove', handleDragMove)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  })

  return {
    isDragging,
    position,
    showDockHint,
    dockHintPosition,
    startDrag
  }
}
