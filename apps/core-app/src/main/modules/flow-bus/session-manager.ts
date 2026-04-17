/**
 * Flow Session Manager
 *
 * Manages Flow session lifecycle and state transitions.
 */

import type {
  FlowError,
  FlowPayload,
  FlowSession,
  FlowSessionState,
  FlowSessionUpdate
} from '@talex-touch/utils'
import { flowBusSessionLog } from './logger'

/**
 * Session state change listener
 */
type SessionListener = (update: FlowSessionUpdate) => void

/**
 * FlowSessionManager
 *
 * Singleton manager for all Flow sessions.
 * Handles session creation, state transitions, and cleanup.
 */
export class FlowSessionManager {
  private static instance: FlowSessionManager | null = null

  /** Map of session ID to session */
  private sessions: Map<string, FlowSession> = new Map()

  /** Session state change listeners */
  private listeners: Map<string, Set<SessionListener>> = new Map()

  /** Global listeners (for all sessions) */
  private globalListeners: Set<SessionListener> = new Set()

  /** Session ID counter */
  private sessionIdCounter = 0

  /** Default timeout in milliseconds */
  private readonly DEFAULT_TIMEOUT = 30000

  private constructor() {}

  static getInstance(): FlowSessionManager {
    if (!FlowSessionManager.instance) {
      FlowSessionManager.instance = new FlowSessionManager()
    }
    return FlowSessionManager.instance
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now()
    const counter = this.sessionIdCounter++
    return `flow-${timestamp}-${counter}`
  }

  /**
   * Creates a new Flow session
   */
  createSession(
    senderId: string,
    targetPluginId: string,
    targetId: string,
    payload: FlowPayload
  ): FlowSession {
    const sessionId = this.generateSessionId()
    const now = Date.now()

    const session: FlowSession = {
      sessionId,
      state: 'INIT',
      senderId,
      targetPluginId,
      targetId,
      fullTargetId: `${targetPluginId}.${targetId}`,
      payload,
      createdAt: now,
      updatedAt: now
    }

    this.sessions.set(sessionId, session)
    flowBusSessionLog.debug('Created session', {
      meta: {
        sessionId,
        senderId,
        targetId: session.fullTargetId
      }
    })

    return session
  }

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): FlowSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Updates session state
   */
  updateState(
    sessionId: string,
    newState: FlowSessionState,
    data?: { ackPayload?: unknown; error?: FlowError }
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      flowBusSessionLog.warn('Session not found during state update', {
        meta: {
          sessionId,
          state: newState
        }
      })
      return false
    }

    const previousState = session.state
    session.state = newState
    session.updatedAt = Date.now()

    if (data?.ackPayload !== undefined) {
      session.ackPayload = data.ackPayload
    }
    if (data?.error) {
      session.error = data.error
    }

    // Notify listeners
    const update: FlowSessionUpdate = {
      sessionId,
      previousState,
      currentState: newState,
      timestamp: session.updatedAt,
      data
    }

    this.notifyListeners(sessionId, update)

    flowBusSessionLog.debug('Updated session state', {
      meta: {
        sessionId,
        previousState,
        state: newState
      }
    })
    return true
  }

  /**
   * Sets session acknowledgment
   */
  acknowledge(sessionId: string, ackPayload?: unknown): boolean {
    return this.updateState(sessionId, 'ACKED', { ackPayload })
  }

  /**
   * Sets session error
   */
  setError(sessionId: string, error: FlowError): boolean {
    return this.updateState(sessionId, 'FAILED', { error })
  }

  /**
   * Cancels a session
   */
  cancel(sessionId: string): boolean {
    return this.updateState(sessionId, 'CANCELLED')
  }

  /**
   * Removes a session
   */
  removeSession(sessionId: string): boolean {
    const removed = this.sessions.delete(sessionId)
    if (removed) {
      this.listeners.delete(sessionId)
      flowBusSessionLog.debug('Removed session', {
        meta: {
          sessionId
        }
      })
    }
    return removed
  }

  /**
   * Adds a listener for a specific session
   */
  addListener(sessionId: string, listener: SessionListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set())
    }
    this.listeners.get(sessionId)!.add(listener)

    return () => {
      const listeners = this.listeners.get(sessionId)
      if (listeners) {
        listeners.delete(listener)
      }
    }
  }

  /**
   * Adds a global listener for all sessions
   */
  addGlobalListener(listener: SessionListener): () => void {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  /**
   * Notifies listeners of session update
   */
  private notifyListeners(sessionId: string, update: FlowSessionUpdate): void {
    // Notify session-specific listeners
    const sessionListeners = this.listeners.get(sessionId)
    if (sessionListeners) {
      for (const listener of sessionListeners) {
        try {
          listener(update)
        } catch (error) {
          flowBusSessionLog.error('Session listener threw during notification', {
            meta: {
              sessionId,
              state: update.currentState
            },
            error
          })
        }
      }
    }

    // Notify global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(update)
      } catch (error) {
        flowBusSessionLog.error('Global listener threw during notification', {
          meta: {
            sessionId,
            state: update.currentState
          },
          error
        })
      }
    }
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions(): FlowSession[] {
    const active: FlowSession[] = []
    for (const session of this.sessions.values()) {
      if (!['ACKED', 'FAILED', 'CANCELLED'].includes(session.state)) {
        active.push(session)
      }
    }
    return active
  }

  /**
   * Gets sessions by sender
   */
  getSessionsBySender(senderId: string): FlowSession[] {
    const result: FlowSession[] = []
    for (const session of this.sessions.values()) {
      if (session.senderId === senderId) {
        result.push(session)
      }
    }
    return result
  }

  /**
   * Cleans up old completed sessions
   */
  cleanup(maxAge: number = 5 * 60 * 1000): number {
    const now = Date.now()
    let count = 0

    for (const [sessionId, session] of this.sessions) {
      const isCompleted = ['ACKED', 'FAILED', 'CANCELLED'].includes(session.state)
      const isOld = now - session.updatedAt > maxAge

      if (isCompleted && isOld) {
        this.sessions.delete(sessionId)
        this.listeners.delete(sessionId)
        count++
      }
    }

    if (count > 0) {
      flowBusSessionLog.debug('Cleaned up completed sessions', {
        meta: {
          count
        }
      })
    }
    return count
  }

  /**
   * Clears all sessions
   */
  clear(): void {
    this.sessions.clear()
    this.listeners.clear()
    this.globalListeners.clear()
    flowBusSessionLog.info('Cleared all sessions')
  }

  /**
   * Gets default timeout
   */
  getDefaultTimeout(): number {
    return this.DEFAULT_TIMEOUT
  }
}

export const flowSessionManager = FlowSessionManager.getInstance()
