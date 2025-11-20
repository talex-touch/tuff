/**
 * DivisionBox Types - Renderer Process
 * 
 * Type definitions for the renderer process, including UI state and store types.
 * Re-exports common types from main process for consistency.
 */

/**
 * Re-export core types that are shared between main and renderer processes
 */
export type {
  DivisionBoxConfig,
  SessionInfo,
  SessionMeta,
  DivisionBoxBounds,
  CloseOptions,
  HeaderConfig,
  HeaderAction,
  StateChangeEvent,
  IPCResponse
} from '../../../main/modules/division-box/types'

export {
  DivisionBoxState,
  DivisionBoxErrorCode,
  DivisionBoxError,
  DivisionBoxIPCChannel
} from '../../../main/modules/division-box/types'

export type { DivisionBoxSize } from '../../../main/modules/division-box/types'

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
