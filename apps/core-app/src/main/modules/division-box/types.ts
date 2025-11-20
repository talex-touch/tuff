/**
 * DivisionBox Core Type Definitions
 * 
 * This file contains all core type interfaces for the DivisionBox system,
 * including configuration, state management, and error handling types.
 */

import type { WebPreferences } from 'electron'

/**
 * DivisionBox lifecycle states
 * State machine: prepare → attach → active → inactive → detach → destroy
 */
export enum DivisionBoxState {
  PREPARE = 'prepare',
  ATTACH = 'attach',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DETACH = 'detach',
  DESTROY = 'destroy'
}

/**
 * Error codes for DivisionBox operations
 */
export enum DivisionBoxErrorCode {
  RESOURCE_ERROR = 'RESOURCE_ERROR',
  STATE_ERROR = 'STATE_ERROR',
  IPC_ERROR = 'IPC_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED'
}

/**
 * Custom error class for DivisionBox operations
 */
export class DivisionBoxError extends Error {
  constructor(
    public readonly code: DivisionBoxErrorCode,
    message: string,
    public readonly sessionId?: string,
    public readonly timestamp: number = Date.now()
  ) {
    super(message)
    this.name = 'DivisionBoxError'
    Error.captureStackTrace(this, DivisionBoxError)
  }
}

/**
 * Header action button configuration
 */
export interface HeaderAction {
  label: string
  icon?: string
  onClick: () => void
}

/**
 * Header configuration for DivisionBox
 */
export interface HeaderConfig {
  show: boolean
  title?: string
  icon?: string
  actions?: HeaderAction[]
}

/**
 * Size presets for DivisionBox
 */
export type DivisionBoxSize = 'compact' | 'medium' | 'expanded'

/**
 * Configuration for creating a DivisionBox instance
 */
export interface DivisionBoxConfig {
  /** URL to load in the WebContentsView */
  url: string
  
  /** Associated plugin ID (optional) */
  pluginId?: string
  
  /** Display title */
  title: string
  
  /** Icon (supports iconify format) */
  icon?: string
  
  /** Size preset */
  size?: DivisionBoxSize
  
  /** Enable keepAlive caching mode */
  keepAlive?: boolean
  
  /** Header configuration */
  header?: HeaderConfig
  
  /** WebContentsView preferences */
  webPreferences?: WebPreferences
}

/**
 * Session metadata
 */
export interface SessionMeta {
  /** Associated plugin ID */
  pluginId?: string
  
  /** Display title */
  title: string
  
  /** Icon */
  icon?: string
  
  /** Size preset */
  size: DivisionBoxSize
  
  /** KeepAlive mode enabled */
  keepAlive: boolean
  
  /** Creation timestamp */
  createdAt: number
  
  /** Last accessed timestamp */
  lastAccessedAt: number
}

/**
 * Bounds information for DivisionBox positioning
 */
export interface DivisionBoxBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Session information returned to clients
 */
export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string
  
  /** Current lifecycle state */
  state: DivisionBoxState
  
  /** Session metadata */
  meta: SessionMeta
  
  /** Position and size bounds */
  bounds?: DivisionBoxBounds
}

/**
 * Options for closing a DivisionBox
 */
export interface CloseOptions {
  /** Delay before closing (milliseconds) */
  delay?: number
  
  /** Play closing animation */
  animation?: boolean
  
  /** Force close (ignore keepAlive) */
  force?: boolean
}

/**
 * State change event data
 */
export interface StateChangeEvent {
  sessionId: string
  oldState: DivisionBoxState
  newState: DivisionBoxState
  timestamp: number
}

/**
 * IPC message types for DivisionBox operations
 */
export enum DivisionBoxIPCChannel {
  OPEN = 'division-box:open',
  CLOSE = 'division-box:close',
  GET_STATE = 'division-box:get-state',
  UPDATE_STATE = 'division-box:update-state',
  GET_ACTIVE_SESSIONS = 'division-box:get-active-sessions',
  STATE_CHANGED = 'division-box:state-changed',
  SESSION_DESTROYED = 'division-box:session-destroyed'
}

/**
 * IPC response wrapper
 */
export interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: DivisionBoxErrorCode
    message: string
  }
}
