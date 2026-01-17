/**
 * DivisionBox Types - Renderer Process
 *
 * UI-specific type definitions for the renderer process.
 * For shared types, import directly from '@talex-touch/utils'.
 */

import type { SessionInfo } from '@talex-touch/utils'

/**
 * UI-specific state for DivisionBox in renderer process
 */
export interface DivisionBoxUIState {
  /** Currently dragging session ID */
  draggingSessionId: string | null

  /** Currently resizing session ID */
  resizingSessionId: string | null

  /** Show dock alignment hint */
  showDockHint: boolean

  /** Dock hint position */
  dockHintPosition?: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * Store state for DivisionBox management
 */
export interface DivisionBoxStoreState {
  /** Active sessions map */
  activeSessions: Map<string, SessionInfo>

  /** Recent sessions list (sessionIds) */
  recentList: string[]

  /** Pinned sessions list (sessionIds) */
  pinnedList: string[]

  /** UI state */
  uiState: DivisionBoxUIState
}

/**
 * Drag state information
 */
export interface DragState {
  isDragging: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  sessionId: string
}

/**
 * Resize state information
 */
export interface ResizeState {
  isResizing: boolean
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  sessionId: string
  handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
}

/**
 * Size preset definitions (in pixels)
 */
export interface SizePreset {
  width: number
  height: number
}

export const SIZE_PRESETS: Record<string, SizePreset> = {
  compact: { width: 400, height: 300 },
  medium: { width: 600, height: 450 },
  expanded: { width: 800, height: 600 }
}

/**
 * Edge detection threshold (pixels)
 */
export const EDGE_SNAP_THRESHOLD = 20

/**
 * Animation duration (milliseconds)
 */
export const ANIMATION_DURATION = 250
