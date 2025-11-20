/**
 * LRUCache - Least Recently Used Cache Manager
 * 
 * Manages DivisionBox sessions with keepAlive mode using LRU eviction strategy.
 * Evicts the least recently used sessions when cache size exceeds threshold.
 */

import type { DivisionBoxSession } from './session'
// DivisionBoxState import removed - not needed for LRU cache logic

/**
 * LRU Cache for managing keepAlive DivisionBox sessions
 * 
 * Tracks sessions by their lastAccessedAt timestamp and evicts
 * the least recently used sessions when the cache is full.
 */
export class LRUCache {
  /** Maximum number of cached sessions */
  private readonly maxSize: number

  /** Map of sessionId to DivisionBoxSession */
  private cache: Map<string, DivisionBoxSession>

  /**
   * Creates a new LRU cache
   * 
   * @param maxSize - Maximum number of sessions to cache (default: 10)
   */
  constructor(maxSize: number = 10) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  /**
   * Adds a session to the cache
   * 
   * If the cache is full, evicts the least recently used session first.
   * Only sessions with keepAlive enabled should be added to the cache.
   * 
   * @param session - Session to add to cache
   */
  add(session: DivisionBoxSession): void {
    // Check if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(session.sessionId)) {
      // Evict least recently used session
      this.evict()
    }

    // Add or update session in cache
    this.cache.set(session.sessionId, session)
  }

  /**
   * Removes a session from the cache
   * 
   * @param sessionId - ID of session to remove
   * @returns True if session was removed, false if not found
   */
  remove(sessionId: string): boolean {
    return this.cache.delete(sessionId)
  }

  /**
   * Gets a session from the cache
   * 
   * @param sessionId - ID of session to retrieve
   * @returns Session if found, undefined otherwise
   */
  get(sessionId: string): DivisionBoxSession | undefined {
    return this.cache.get(sessionId)
  }

  /**
   * Checks if a session is in the cache
   * 
   * @param sessionId - ID of session to check
   * @returns True if session is cached
   */
  has(sessionId: string): boolean {
    return this.cache.has(sessionId)
  }

  /**
   * Updates the access time for a session
   * 
   * This should be called whenever a session is accessed to maintain
   * accurate LRU ordering. The session's lastAccessedAt timestamp
   * is already updated by the session itself.
   * 
   * @param sessionId - ID of session to update
   */
  updateAccess(sessionId: string): void {
    const session = this.cache.get(sessionId)
    if (session) {
      // Update the session's lastAccessedAt timestamp
      session.meta.lastAccessedAt = Date.now()
    }
  }

  /**
   * Evicts the least recently used session from the cache
   * 
   * Finds the session with the oldest lastAccessedAt timestamp
   * and destroys it to free up resources.
   * 
   * @returns The sessionId of the evicted session, or null if cache is empty
   */
  evict(): string | null {
    if (this.cache.size === 0) {
      return null
    }

    // Find the least recently used session
    let lruSessionId: string | null = null
    let oldestAccessTime = Infinity

    for (const [sessionId, session] of this.cache.entries()) {
      const accessTime = session.meta.lastAccessedAt
      if (accessTime < oldestAccessTime) {
        oldestAccessTime = accessTime
        lruSessionId = sessionId
      }
    }

    if (lruSessionId) {
      const session = this.cache.get(lruSessionId)
      
      // Remove from cache
      this.cache.delete(lruSessionId)
      
      // Destroy the session to free resources
      if (session) {
        session.destroy().catch(error => {
          console.error(`[LRUCache] Error destroying evicted session ${lruSessionId}:`, error)
        })
      }

      return lruSessionId
    }

    return null
  }

  /**
   * Evicts multiple sessions to reduce cache size
   * 
   * Useful for handling memory pressure by freeing up multiple sessions at once.
   * 
   * @param count - Number of sessions to evict
   * @returns Array of evicted session IDs
   */
  evictMultiple(count: number): string[] {
    const evicted: string[] = []
    
    for (let i = 0; i < count && this.cache.size > 0; i++) {
      const sessionId = this.evict()
      if (sessionId) {
        evicted.push(sessionId)
      }
    }

    return evicted
  }

  /**
   * Gets the current cache size
   * 
   * @returns Number of sessions currently cached
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Gets the maximum cache size
   * 
   * @returns Maximum number of sessions that can be cached
   */
  getMaxSize(): number {
    return this.maxSize
  }

  /**
   * Checks if the cache is full
   * 
   * @returns True if cache has reached maximum size
   */
  isFull(): boolean {
    return this.cache.size >= this.maxSize
  }

  /**
   * Gets all cached session IDs
   * 
   * @returns Array of session IDs in the cache
   */
  getAllSessionIds(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Gets all cached sessions sorted by access time (most recent first)
   * 
   * @returns Array of sessions sorted by lastAccessedAt descending
   */
  getSortedSessions(): DivisionBoxSession[] {
    return Array.from(this.cache.values()).sort((a, b) => {
      return b.meta.lastAccessedAt - a.meta.lastAccessedAt
    })
  }

  /**
   * Clears all sessions from the cache
   * 
   * Destroys all cached sessions and clears the cache.
   * Use with caution as this will destroy all keepAlive sessions.
   */
  async clear(): Promise<void> {
    const sessions = Array.from(this.cache.values())
    this.cache.clear()

    // Destroy all sessions
    await Promise.all(
      sessions.map(session => 
        session.destroy().catch(error => {
          console.error(`[LRUCache] Error destroying session ${session.sessionId}:`, error)
        })
      )
    )
  }
}
