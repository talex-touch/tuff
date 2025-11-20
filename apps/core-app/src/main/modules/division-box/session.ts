/**
 * DivisionBoxSession - Main Process
 * 
 * Manages a single DivisionBox instance lifecycle, state, and resources.
 * Implements a six-state lifecycle: prepare → attach → active → inactive → detach → destroy
 */

import { WebContentsView } from 'electron'
import type { WebPreferences } from 'electron'
import {
  DivisionBoxState,
  DivisionBoxError,
  DivisionBoxErrorCode,
  type DivisionBoxConfig,
  type SessionMeta,
  type StateChangeEvent
} from './types'

/**
 * Type for state change listener callback
 */
type StateChangeListener = (event: StateChangeEvent) => void

/**
 * Valid state transitions in the lifecycle state machine
 */
const VALID_TRANSITIONS: Record<DivisionBoxState, DivisionBoxState[]> = {
  [DivisionBoxState.PREPARE]: [DivisionBoxState.ATTACH, DivisionBoxState.DESTROY],
  [DivisionBoxState.ATTACH]: [DivisionBoxState.ACTIVE, DivisionBoxState.DESTROY],
  [DivisionBoxState.ACTIVE]: [DivisionBoxState.INACTIVE, DivisionBoxState.DETACH, DivisionBoxState.DESTROY],
  [DivisionBoxState.INACTIVE]: [DivisionBoxState.ACTIVE, DivisionBoxState.DETACH, DivisionBoxState.DESTROY],
  [DivisionBoxState.DETACH]: [DivisionBoxState.DESTROY],
  [DivisionBoxState.DESTROY]: []
}

/**
 * DivisionBoxSession class
 * 
 * Manages the lifecycle, state, and resources of a single DivisionBox instance.
 */
export class DivisionBoxSession {
  /** Unique session identifier */
  readonly sessionId: string

  /** WebContentsView instance (null when not created or destroyed) */
  private webContentsView: WebContentsView | null = null

  /** Current lifecycle state */
  private state: DivisionBoxState = DivisionBoxState.PREPARE

  /** Session-level state storage (key-value pairs) */
  private sessionState: Map<string, any> = new Map()

  /** Session metadata */
  readonly meta: SessionMeta

  /** KeepAlive timer for inactive state */
  private keepAliveTimer: NodeJS.Timeout | null = null

  /** State change event listeners */
  private stateChangeListeners: Set<StateChangeListener> = new Set()

  /** Configuration used to create this session */
  private readonly config: DivisionBoxConfig

  /**
   * Creates a new DivisionBoxSession
   * 
   * @param sessionId - Unique identifier for this session
   * @param config - Configuration for the DivisionBox
   */
  constructor(sessionId: string, config: DivisionBoxConfig) {
    this.sessionId = sessionId
    this.config = config

    // Initialize metadata with defaults
    const now = Date.now()
    this.meta = {
      pluginId: config.pluginId,
      title: config.title,
      icon: config.icon,
      size: config.size || 'medium',
      keepAlive: config.keepAlive || false,
      createdAt: now,
      lastAccessedAt: now
    }
  }

  /**
   * Gets the current lifecycle state
   * 
   * @returns Current state
   */
  getState(): DivisionBoxState {
    return this.state
  }

  /**
   * Sets the lifecycle state with validation
   * 
   * Validates the state transition against the state machine rules.
   * Triggers state change listeners on successful transition.
   * 
   * @param newState - Target state to transition to
   * @throws {DivisionBoxError} If the transition is invalid
   */
  async setState(newState: DivisionBoxState): Promise<void> {
    const oldState = this.state

    // Check if already in target state
    if (oldState === newState) {
      return
    }

    // Validate state transition
    if (!this.isValidTransition(oldState, newState)) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.INVALID_TRANSITION,
        `Invalid state transition: ${oldState} -> ${newState}`,
        this.sessionId
      )
    }

    // Update state
    this.state = newState

    // Update last accessed timestamp
    this.meta.lastAccessedAt = Date.now()

    // Emit state change event
    const event: StateChangeEvent = {
      sessionId: this.sessionId,
      oldState,
      newState,
      timestamp: Date.now()
    }

    this.notifyStateChange(event)
  }

  /**
   * Checks if a state transition is valid according to the state machine
   * 
   * @param from - Current state
   * @param to - Target state
   * @returns True if transition is valid
   */
  private isValidTransition(from: DivisionBoxState, to: DivisionBoxState): boolean {
    const validTargets = VALID_TRANSITIONS[from]
    return validTargets.includes(to)
  }

  /**
   * Notifies all registered state change listeners
   * 
   * @param event - State change event data
   */
  private notifyStateChange(event: StateChangeEvent): void {
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[DivisionBoxSession] Error in state change listener:', error)
      }
    })
  }

  /**
   * Registers a state change listener
   * 
   * @param listener - Callback to invoke on state changes
   */
  onStateChange(listener: StateChangeListener): void {
    this.stateChangeListeners.add(listener)
  }

  /**
   * Removes a state change listener
   * 
   * @param listener - Callback to remove
   */
  removeStateChangeListener(listener: StateChangeListener): void {
    this.stateChangeListeners.delete(listener)
  }

  /**
   * Creates and configures a WebContentsView
   * 
   * @param url - URL to load in the view
   * @throws {DivisionBoxError} If view creation fails
   */
  async createWebContentsView(url: string): Promise<void> {
    if (this.webContentsView) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.STATE_ERROR,
        'WebContentsView already exists',
        this.sessionId
      )
    }

    try {
      // Create WebContentsView with configuration
      const webPreferences: WebPreferences = {
        nodeIntegration: false,
        contextIsolation: true,
        ...this.config.webPreferences
      }

      this.webContentsView = new WebContentsView({
        webPreferences
      })

      // Load URL
      await this.webContentsView.webContents.loadURL(url)

      // Transition to ATTACH state
      await this.setState(DivisionBoxState.ATTACH)
    } catch (error) {
      this.webContentsView = null
      throw new DivisionBoxError(
        DivisionBoxErrorCode.RESOURCE_ERROR,
        `Failed to create WebContentsView: ${error}`,
        this.sessionId
      )
    }
  }

  /**
   * Destroys the WebContentsView and cleans up resources
   */
  destroyWebContentsView(): void {
    if (this.webContentsView) {
      try {
        // @ts-ignore - webContents.destroy() exists but may not be in types
        this.webContentsView.webContents.destroy()
      } catch (error) {
        console.error('[DivisionBoxSession] Error destroying WebContentsView:', error)
      }
      this.webContentsView = null
    }
  }

  /**
   * Gets the WebContentsView instance
   * 
   * @returns WebContentsView or null if not created
   */
  getWebContentsView(): WebContentsView | null {
    return this.webContentsView
  }

  /**
   * Sets a value in the session state
   * 
   * @param key - State key
   * @param value - State value
   */
  setSessionState(key: string, value: any): void {
    this.sessionState.set(key, value)
  }

  /**
   * Gets a value from the session state
   * 
   * @param key - State key
   * @returns State value or undefined
   */
  getSessionState(key: string): any {
    return this.sessionState.get(key)
  }

  /**
   * Clears all session state data
   */
  clearSessionState(): void {
    this.sessionState.clear()
  }

  /**
   * Starts the keepAlive timer
   * 
   * Used in INACTIVE state to maintain the view for quick recovery.
   */
  startKeepAliveTimer(): void {
    // Clear existing timer if any
    this.stopKeepAliveTimer()

    // Note: The actual timer logic would depend on LRU cache management
    // For now, we just mark that keepAlive is active
    // The timer would be managed by the DivisionBoxManager
  }

  /**
   * Stops the keepAlive timer
   */
  stopKeepAliveTimer(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  /**
   * Destroys the session and cleans up all resources
   * 
   * - Destroys WebContentsView
   * - Clears session state
   * - Removes all event listeners
   * - Stops keepAlive timer
   * - Transitions to DESTROY state
   */
  async destroy(): Promise<void> {
    // Stop keepAlive timer
    this.stopKeepAliveTimer()

    // Destroy WebContentsView
    this.destroyWebContentsView()

    // Clear session state
    this.clearSessionState()

    // Clear all listeners
    this.stateChangeListeners.clear()

    // Transition to DESTROY state
    // We need to allow this transition from any state for cleanup
    this.state = DivisionBoxState.DESTROY

    // Emit final state change
    const event: StateChangeEvent = {
      sessionId: this.sessionId,
      oldState: this.state,
      newState: DivisionBoxState.DESTROY,
      timestamp: Date.now()
    }

    this.notifyStateChange(event)
  }
}
