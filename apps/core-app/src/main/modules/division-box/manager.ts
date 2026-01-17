/**
 * DivisionBoxManager - Main Process
 *
 * Singleton manager for all DivisionBox sessions.
 * Handles session creation, lifecycle management, resource limits, and LRU caching.
 */

import type { CloseOptions, DivisionBoxConfig, SessionInfo } from '@talex-touch/utils'
// app import removed - not currently used
import { DivisionBoxError, DivisionBoxErrorCode, DivisionBoxState } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { LRUCache } from './lru-cache'
import { DivisionBoxSession } from './session'

/**
 * Resource limits for DivisionBox system
 */
const RESOURCE_LIMITS = {
  /** Maximum number of active DivisionBox instances globally (matches window pool) */
  MAX_ACTIVE_SESSIONS: 5,

  /** Maximum number of WebContentsView instances per session */
  MAX_VIEWS_PER_SESSION: 3,

  /** Maximum number of cached keepAlive sessions */
  MAX_CACHED_SESSIONS: 5
}

/**
 * DivisionBoxManager - Singleton class for managing all DivisionBox sessions
 *
 * Responsibilities:
 * - Create and register new sessions
 * - Query and destroy sessions
 * - Enforce resource limits
 * - Manage LRU cache for keepAlive sessions
 * - Handle memory pressure events
 */
export class DivisionBoxManager {
  /** Singleton instance */
  private static instance: DivisionBoxManager | null = null
  private readonly pollingService = PollingService.getInstance()
  private readonly memoryPressureTaskId = 'division-box.memory-pressure'

  /** Map of all active sessions (sessionId -> DivisionBoxSession) */
  private sessions: Map<string, DivisionBoxSession>

  /** LRU cache for keepAlive sessions */
  private lruCache: LRUCache

  /** Counter for generating unique session IDs */
  private sessionIdCounter: number = 0

  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {
    this.sessions = new Map()
    this.lruCache = new LRUCache(RESOURCE_LIMITS.MAX_CACHED_SESSIONS)

    // Initialize memory pressure handling
    this.initializeMemoryPressureHandling()
  }

  /**
   * Gets the singleton instance of DivisionBoxManager
   *
   * @returns The singleton instance
   */
  static getInstance(): DivisionBoxManager {
    if (!DivisionBoxManager.instance) {
      DivisionBoxManager.instance = new DivisionBoxManager()
    }
    return DivisionBoxManager.instance
  }

  /**
   * Initializes memory pressure event handling
   *
   * Listens for system memory pressure events and triggers cache eviction.
   */
  private initializeMemoryPressureHandling(): void {
    // Listen for memory pressure warnings (if available)
    // Note: Electron doesn't have a direct memory pressure API,
    // but we can monitor process memory usage

    // Set up periodic memory check (every 30 seconds)
    this.pollingService.register(
      this.memoryPressureTaskId,
      () => {
        const memoryUsage = process.memoryUsage()
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024

        // If heap usage exceeds 500MB, trigger cache eviction
        if (heapUsedMB > 500) {
          console.warn(
            `[DivisionBoxManager] High memory usage detected: ${heapUsedMB.toFixed(2)}MB`
          )
          this.handleMemoryPressure()
        }
      },
      { interval: 30, unit: 'seconds' }
    )
    this.pollingService.start()
  }

  /**
   * Generates a unique session ID
   *
   * @returns Unique session ID string
   */
  private generateSessionId(): string {
    const timestamp = Date.now()
    const counter = this.sessionIdCounter++
    return `division-box-${timestamp}-${counter}`
  }

  /**
   * Validates and applies default values to DivisionBoxConfig
   *
   * @param config - Configuration to validate
   * @returns Validated configuration with defaults applied
   * @throws {DivisionBoxError} If configuration is invalid
   */
  private validateAndApplyDefaults(config: DivisionBoxConfig): DivisionBoxConfig {
    // Validate required fields
    if (!config.url || typeof config.url !== 'string') {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.CONFIG_ERROR,
        'Invalid or missing URL in configuration'
      )
    }

    if (!config.title || typeof config.title !== 'string') {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.CONFIG_ERROR,
        'Invalid or missing title in configuration'
      )
    }

    // Apply defaults
    const validatedConfig: DivisionBoxConfig = {
      ...config,
      size: config.size || 'medium',
      keepAlive: config.keepAlive ?? false,
      header: config.header ?? { show: true }
    }

    // Validate size
    const validSizes = ['compact', 'medium', 'expanded']
    if (!validSizes.includes(validatedConfig.size!)) {
      console.warn(
        `[DivisionBoxManager] Invalid size: ${validatedConfig.size}, using default 'medium'`
      )
      validatedConfig.size = 'medium'
    }

    return validatedConfig
  }

  /**
   * Creates a new DivisionBox session
   *
   * Validates configuration, enforces resource limits, generates unique sessionId,
   * creates DivisionBoxSession instance, creates window, and optionally attaches UI view.
   *
   * @param config - Configuration for the new DivisionBox
   * @param stateChangeCallback - Optional callback for state changes (used by IPC layer for broadcasting)
   * @returns The created DivisionBoxSession
   * @throws {DivisionBoxError} If resource limits are exceeded or configuration is invalid
   */
  async createSession(
    config: DivisionBoxConfig,
    stateChangeCallback?: (event: import('@talex-touch/utils').StateChangeEvent) => void
  ): Promise<DivisionBoxSession> {
    // Check global session limit
    if (this.sessions.size >= RESOURCE_LIMITS.MAX_ACTIVE_SESSIONS) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.LIMIT_EXCEEDED,
        `Maximum number of active sessions (${RESOURCE_LIMITS.MAX_ACTIVE_SESSIONS}) exceeded`
      )
    }

    // Validate and apply defaults to configuration
    const validatedConfig = this.validateAndApplyDefaults(config)

    // Generate unique session ID
    const sessionId = this.generateSessionId()

    // Create new session
    const session = new DivisionBoxSession(sessionId, validatedConfig)

    // Register session
    this.sessions.set(sessionId, session)

    // Register state change callback if provided (for IPC broadcasting)
    if (stateChangeCallback) {
      session.onStateChange(stateChangeCallback)
    }

    // If keepAlive is enabled, add to LRU cache when it becomes inactive
    if (validatedConfig.keepAlive) {
      session.onStateChange((event) => {
        if (event.newState === DivisionBoxState.INACTIVE) {
          this.lruCache.add(session)
        } else if (event.newState === DivisionBoxState.ACTIVE) {
          // Update access time when reactivated
          this.lruCache.updateAccess(sessionId)
        } else if (event.newState === DivisionBoxState.DESTROY) {
          // Remove from cache when destroyed
          this.lruCache.remove(sessionId)
        }
      })
    }

    // Create and show the window
    try {
      await session.createWindow()

      // Attach UI view with plugin URL if provided
      if (validatedConfig.url) {
        // Get plugin reference if pluginId is provided
        const { pluginModule } = await import('../plugin/plugin-module')
        const plugin = validatedConfig.pluginId
          ? (pluginModule.pluginManager?.getPluginByName(validatedConfig.pluginId) as any)
          : undefined

        await session.attachUIView(validatedConfig.url, plugin)
      }
    } catch (error) {
      // Clean up on error
      this.sessions.delete(sessionId)
      throw error
    }

    console.log(`[DivisionBoxManager] Created session: ${sessionId}`)
    return session
  }

  /**
   * Creates a new DivisionBox session without attaching a UI view.
   * Used when transferring an existing WebContentsView from CoreBox.
   *
   * @param config - Configuration for the new DivisionBox
   * @param stateChangeCallback - Optional callback for state changes
   * @returns The created DivisionBoxSession (window only, no UI view)
   */
  async createSessionWithoutUI(
    config: DivisionBoxConfig,
    stateChangeCallback?: (event: import('@talex-touch/utils').StateChangeEvent) => void
  ): Promise<DivisionBoxSession> {
    // Check global session limit
    if (this.sessions.size >= RESOURCE_LIMITS.MAX_ACTIVE_SESSIONS) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.LIMIT_EXCEEDED,
        `Maximum number of active sessions (${RESOURCE_LIMITS.MAX_ACTIVE_SESSIONS}) exceeded`
      )
    }

    // Validate and apply defaults to configuration
    const validatedConfig = this.validateAndApplyDefaults(config)

    // Generate unique session ID
    const sessionId = this.generateSessionId()

    // Create new session
    const session = new DivisionBoxSession(sessionId, validatedConfig)

    // Register session
    this.sessions.set(sessionId, session)

    // Register state change callback if provided
    if (stateChangeCallback) {
      session.onStateChange(stateChangeCallback)
    }

    // If keepAlive is enabled, add to LRU cache when it becomes inactive
    if (validatedConfig.keepAlive) {
      session.onStateChange((event) => {
        if (event.newState === DivisionBoxState.INACTIVE) {
          this.lruCache.add(session)
        } else if (event.newState === DivisionBoxState.ACTIVE) {
          this.lruCache.updateAccess(sessionId)
        } else if (event.newState === DivisionBoxState.DESTROY) {
          this.lruCache.remove(sessionId)
        }
      })
    }

    // Create window only (no UI view attachment)
    try {
      await session.createWindow()
    } catch (error) {
      this.sessions.delete(sessionId)
      throw error
    }

    console.log(`[DivisionBoxManager] Created session without UI: ${sessionId}`)
    return session
  }

  /**
   * Gets a session by ID
   *
   * @param sessionId - ID of the session to retrieve
   * @returns The session if found, undefined otherwise
   */
  getSession(sessionId: string): DivisionBoxSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Destroys a session and cleans up all resources
   *
   * Removes the session from the registry, LRU cache, and calls session.destroy().
   *
   * @param sessionId - ID of the session to destroy
   * @param options - Optional close options
   * @throws {DivisionBoxError} If session is not found
   */
  async destroySession(sessionId: string, options?: CloseOptions): Promise<void> {
    const session = this.sessions.get(sessionId)

    if (!session) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.SESSION_NOT_FOUND,
        `Session not found: ${sessionId}`,
        sessionId
      )
    }

    // Handle delay if specified
    if (options?.delay && options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delay))
    }

    // Remove from LRU cache if present
    this.lruCache.remove(sessionId)

    // Remove from sessions map
    this.sessions.delete(sessionId)

    // Destroy the session
    await session.destroy()

    console.log(`[DivisionBoxManager] Destroyed session: ${sessionId}`)
  }

  /**
   * Gets all active sessions
   *
   * Returns sessions that are not in DESTROY state.
   *
   * @returns Array of active DivisionBoxSession instances
   */
  getActiveSessions(): DivisionBoxSession[] {
    const activeSessions: DivisionBoxSession[] = []

    for (const session of this.sessions.values()) {
      if (session.getState() !== DivisionBoxState.DESTROY) {
        activeSessions.push(session)
      }
    }

    return activeSessions
  }

  /**
   * Gets session information for all active sessions
   *
   * @returns Array of SessionInfo objects
   */
  getActiveSessionsInfo(): SessionInfo[] {
    return this.getActiveSessions().map((session) => ({
      sessionId: session.sessionId,
      state: session.getState(),
      meta: session.meta
    }))
  }

  /**
   * Validates that a session can register a new WebContentsView
   *
   * Enforces the limit of MAX_VIEWS_PER_SESSION (3) per session.
   * Note: This is a placeholder for future multi-view support.
   * Currently, each session only has one WebContentsView.
   *
   * @param sessionId - ID of the session
   * @param currentViewCount - Current number of views in the session
   * @throws {DivisionBoxError} If view limit is exceeded
   */
  validateViewLimit(sessionId: string, currentViewCount: number): void {
    if (currentViewCount >= RESOURCE_LIMITS.MAX_VIEWS_PER_SESSION) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.LIMIT_EXCEEDED,
        `Session ${sessionId} has reached maximum WebContentsView limit (${RESOURCE_LIMITS.MAX_VIEWS_PER_SESSION})`,
        sessionId
      )
    }
  }

  /**
   * Gets the current resource usage statistics
   *
   * @returns Object containing current resource usage
   */
  getResourceStats(): {
    activeSessions: number
    maxActiveSessions: number
    cachedSessions: number
    maxCachedSessions: number
    maxViewsPerSession: number
  } {
    return {
      activeSessions: this.sessions.size,
      maxActiveSessions: RESOURCE_LIMITS.MAX_ACTIVE_SESSIONS,
      cachedSessions: this.lruCache.size(),
      maxCachedSessions: RESOURCE_LIMITS.MAX_CACHED_SESSIONS,
      maxViewsPerSession: RESOURCE_LIMITS.MAX_VIEWS_PER_SESSION
    }
  }

  /**
   * Handles memory pressure by evicting cached sessions
   *
   * Evicts up to 50% of cached keepAlive sessions to free memory.
   * This is called automatically when high memory usage is detected,
   * or can be called manually.
   */
  handleMemoryPressure(): void {
    const cacheSize = this.lruCache.size()

    if (cacheSize === 0) {
      console.log('[DivisionBoxManager] No cached sessions to evict')
      return
    }

    // Evict up to 50% of cached sessions
    const evictCount = Math.ceil(cacheSize * 0.5)

    console.log(
      `[DivisionBoxManager] Memory pressure detected, evicting ${evictCount} cached sessions`
    )

    const evictedIds = this.lruCache.evictMultiple(evictCount)

    // Remove evicted sessions from the sessions map
    for (const sessionId of evictedIds) {
      this.sessions.delete(sessionId)
    }

    console.log(
      `[DivisionBoxManager] Evicted ${evictedIds.length} sessions: ${evictedIds.join(', ')}`
    )
  }

  /**
   * Gets the singleton instance (alias for getInstance)
   *
   * @returns The singleton instance
   */
  static get(): DivisionBoxManager {
    return DivisionBoxManager.getInstance()
  }
}
