/**
 * DivisionBox Pinia Store
 * 
 * Manages DivisionBox state in the renderer process, including:
 * - Active sessions
 * - Recent and pinned lists
 * - UI state (dragging, resizing)
 */

import { defineStore } from 'pinia'
import type {
  DivisionBoxStoreState,
  SessionInfo,
  DivisionBoxConfig,
  CloseOptions,
  DivisionBoxIPCChannel
} from '../types'

export const useDivisionBoxStore = defineStore('divisionBox', {
  state: (): DivisionBoxStoreState => ({
    activeSessions: new Map(),
    recentList: [],
    pinnedList: [],
    uiState: {
      draggingSessionId: null,
      resizingSessionId: null,
      showDockHint: false
    }
  }),

  getters: {
    /**
     * Get session by ID
     */
    getSessionById: (state) => (sessionId: string): SessionInfo | undefined => {
      return state.activeSessions.get(sessionId)
    },

    /**
     * Get all active sessions as array
     */
    activeSessionsList: (state): SessionInfo[] => {
      return Array.from(state.activeSessions.values())
    },

    /**
     * Check if session is pinned
     */
    isSessionPinned: (state) => (sessionId: string): boolean => {
      return state.pinnedList.includes(sessionId)
    }
  },

  actions: {
    /**
     * Open a new DivisionBox
     */
    async openDivisionBox(config: DivisionBoxConfig): Promise<SessionInfo> {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'division-box:open' as DivisionBoxIPCChannel,
          config
        )

        if (result.success && result.data) {
          const sessionInfo: SessionInfo = result.data
          this.activeSessions.set(sessionInfo.sessionId, sessionInfo)
          this.addToRecent(sessionInfo.sessionId)
          return sessionInfo
        } else {
          throw new Error(result.error?.message || 'Failed to open DivisionBox')
        }
      } catch (error) {
        console.error('Failed to open DivisionBox:', error)
        throw error
      }
    },

    /**
     * Close a DivisionBox
     */
    async closeDivisionBox(sessionId: string, options?: CloseOptions): Promise<void> {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'division-box:close' as DivisionBoxIPCChannel,
          sessionId,
          options
        )

        if (result.success) {
          this.activeSessions.delete(sessionId)
        } else {
          throw new Error(result.error?.message || 'Failed to close DivisionBox')
        }
      } catch (error) {
        console.error('Failed to close DivisionBox:', error)
        throw error
      }
    },

    /**
     * Update session state
     */
    async updateSessionState(sessionId: string, key: string, value: any): Promise<void> {
      try {
        await window.electron.ipcRenderer.invoke(
          'division-box:update-state' as DivisionBoxIPCChannel,
          sessionId,
          key,
          value
        )
      } catch (error) {
        console.error('Failed to update session state:', error)
        throw error
      }
    },

    /**
     * Add session to recent list
     */
    addToRecent(sessionId: string): void {
      // Remove if already exists
      const index = this.recentList.indexOf(sessionId)
      if (index > -1) {
        this.recentList.splice(index, 1)
      }

      // Add to front
      this.recentList.unshift(sessionId)

      // Keep only 10 most recent
      if (this.recentList.length > 10) {
        this.recentList = this.recentList.slice(0, 10)
      }
    },

    /**
     * Toggle pin status
     */
    togglePin(sessionId: string): void {
      const index = this.pinnedList.indexOf(sessionId)
      if (index > -1) {
        // Unpin
        this.pinnedList.splice(index, 1)
      } else {
        // Pin
        this.pinnedList.push(sessionId)
      }

      // Save to persistent storage
      this.savePinnedList()
    },

    /**
     * Load pinned list from storage
     */
    async loadPinnedList(): Promise<void> {
      try {
        // TODO: Implement loading from persistent storage
        // For now, use localStorage as a placeholder
        const stored = localStorage.getItem('division-box:pinned-list')
        if (stored) {
          this.pinnedList = JSON.parse(stored)
        }
      } catch (error) {
        console.error('Failed to load pinned list:', error)
      }
    },

    /**
     * Save pinned list to storage
     */
    async savePinnedList(): Promise<void> {
      try {
        // TODO: Implement saving to persistent storage
        // For now, use localStorage as a placeholder
        localStorage.setItem('division-box:pinned-list', JSON.stringify(this.pinnedList))
      } catch (error) {
        console.error('Failed to save pinned list:', error)
      }
    },

    /**
     * Set dragging session
     */
    setDraggingSession(sessionId: string | null): void {
      this.uiState.draggingSessionId = sessionId
    },

    /**
     * Set resizing session
     */
    setResizingSession(sessionId: string | null): void {
      this.uiState.resizingSessionId = sessionId
    },

    /**
     * Handle state change event from main process
     */
    handleStateChanged(event: { sessionId: string; oldState: string; newState: string }): void {
      const session = this.activeSessions.get(event.sessionId)
      if (session) {
        session.state = event.newState as any
        this.activeSessions.set(event.sessionId, session)
      }
    },

    /**
     * Handle session destroyed event from main process
     */
    handleSessionDestroyed(sessionId: string): void {
      this.activeSessions.delete(sessionId)
    },

    /**
     * Initialize IPC event listeners
     */
    initializeIPCListeners(): void {
      // Listen for state changes
      window.electron.ipcRenderer.on(
        'division-box:state-changed' as DivisionBoxIPCChannel,
        (_event: any, data: any) => {
          this.handleStateChanged(data)
        }
      )

      // Listen for session destroyed
      window.electron.ipcRenderer.on(
        'division-box:session-destroyed' as DivisionBoxIPCChannel,
        (_event: any, sessionId: string) => {
          this.handleSessionDestroyed(sessionId)
        }
      )
    }
  }
})
