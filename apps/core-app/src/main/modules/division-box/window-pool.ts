/**
 * DivisionBox Window Pool
 *
 * Pre-creates DivisionBox windows for instant availability.
 * Maintains a pool of ready-to-use windows to reduce latency when detaching.
 */

import type { BrowserWindow } from 'electron'
import process from 'node:process'
import { DivisionBoxWindowOption } from '../../config/default'
import { TouchWindow } from '../../core/touch-window'
import { devProcessManager } from '../../utils/dev-process-manager'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'

const IS_WINDOWS = process.platform === 'win32'
const divisionBoxWindowPoolLog = createLogger('DivisionBoxPool')

/** Maximum number of active DivisionBox instances */
const MAX_DIVISION_BOX_INSTANCES = 5

/** Number of pre-warmed windows in the pool */
const POOL_SIZE = 1

/** Pooled window entry */
interface PooledWindow {
  touchWindow: TouchWindow
  createdAt: number
  ready: boolean
}

/**
 * DivisionBox Window Pool
 *
 * Manages a pool of pre-created windows for fast detach operations.
 */
export class DivisionBoxWindowPool {
  private static instance: DivisionBoxWindowPool | null = null

  /** Pool of ready windows */
  private pool: PooledWindow[] = []

  /** Currently active DivisionBox windows (not in pool) */
  private activeWindows: Set<BrowserWindow> = new Set()

  /** Whether pool initialization is in progress */
  private initializing: boolean = false

  /** Whether a fill operation is in progress */
  private filling: boolean = false

  private destroyed: boolean = false

  private constructor() {}

  static getInstance(): DivisionBoxWindowPool {
    if (!DivisionBoxWindowPool.instance) {
      DivisionBoxWindowPool.instance = new DivisionBoxWindowPool()
    }
    return DivisionBoxWindowPool.instance
  }

  /**
   * Initialize the window pool
   * Should be called after app is ready
   */
  async initialize(): Promise<void> {
    this.destroyed = false

    if (IS_WINDOWS) {
      divisionBoxWindowPoolLog.debug('Skip pre-warm on Windows (pool disabled)')
      return
    }

    if (this.initializing) return
    this.initializing = true

    divisionBoxWindowPoolLog.debug('Initializing window pool')

    try {
      await this.fillPool()
      divisionBoxWindowPoolLog.info(`Pool ready (${this.pool.length} windows pre-warmed)`)
    } catch (error) {
      divisionBoxWindowPoolLog.error('Failed to initialize DivisionBox window pool', { error })
    } finally {
      this.initializing = false
    }
  }

  /**
   * Fill the pool to maintain POOL_SIZE ready windows
   */
  private async fillPool(): Promise<void> {
    if (IS_WINDOWS) {
      return
    }

    if (this.destroyed || devProcessManager.isShuttingDownProcess()) {
      return
    }

    // Prevent concurrent fills
    if (this.filling) return
    this.filling = true

    try {
      // Clean up destroyed windows from pool
      this.pool = this.pool.filter((p) => !p.touchWindow.window.isDestroyed())

      const needed = POOL_SIZE - this.pool.length

      if (needed <= 0) {
        return
      }

      divisionBoxWindowPoolLog.debug(`Filling pool (need ${needed}, have ${this.pool.length})`)

      for (let i = 0; i < needed; i++) {
        if (this.destroyed || devProcessManager.isShuttingDownProcess()) {
          break
        }

        // Check if we've hit the max limit (pool + active)
        if (this.getTotalWindowCount() >= MAX_DIVISION_BOX_INSTANCES) {
          divisionBoxWindowPoolLog.debug(`Max instances reached (${MAX_DIVISION_BOX_INSTANCES})`)
          break
        }

        try {
          const pooledWindow = await this.createPooledWindow()
          this.pool.push(pooledWindow)
          divisionBoxWindowPoolLog.debug(`Window added to pool (pool: ${this.pool.length})`)
        } catch (error) {
          divisionBoxWindowPoolLog.error('Failed to create pooled window', { error })
        }
      }
    } finally {
      this.filling = false
    }
  }

  /**
   * Create a pre-warmed window for the pool
   */
  private async createPooledWindow(): Promise<PooledWindow> {
    if (this.destroyed || devProcessManager.isShuttingDownProcess()) {
      throw new Error('DivisionBox window pool is shutting down')
    }

    divisionBoxWindowPoolLog.debug('Creating pooled DivisionBox window')

    const touchWindow = new TouchWindow({
      ...DivisionBoxWindowOption,
      show: false, // Don't show until acquired
      title: 'Tuff Division (Pool)'
    })
    divisionBoxWindowPoolLog.debug('TouchWindow created')

    // Load the CoreBox renderer
    const rendererUrl = getCoreBoxRendererUrl()
    divisionBoxWindowPoolLog.debug(`Loading renderer: ${rendererUrl}`)

    try {
      if (isDevMode()) {
        await touchWindow.loadURL(rendererUrl)
      } else {
        await touchWindow.loadFile(getCoreBoxRendererPath())
      }
      divisionBoxWindowPoolLog.debug('Renderer loaded successfully')

      // loadURL/loadFile already waits for the page to load
      // No need for additional dom-ready wait
    } catch (error) {
      divisionBoxWindowPoolLog.error('Failed to load DivisionBox renderer', { error })
      throw error
    }

    divisionBoxWindowPoolLog.debug('Pooled window ready')

    // Handle window closed (remove from pool)
    touchWindow.window.on('closed', () => {
      this.pool = this.pool.filter((p) => p.touchWindow !== touchWindow)
      this.activeWindows.delete(touchWindow.window)

      // Refill pool after a delay
      if (!this.destroyed && !devProcessManager.isShuttingDownProcess()) {
        setTimeout(() => this.fillPool(), 1000)
      }
    })

    return {
      touchWindow,
      createdAt: Date.now(),
      ready: true
    }
  }

  /**
   * Acquire a window from the pool
   * Returns a pre-warmed window if available, otherwise creates a new one
   */
  async acquire(): Promise<TouchWindow> {
    // Check max limit
    if (this.activeWindows.size >= MAX_DIVISION_BOX_INSTANCES) {
      throw new Error(`Maximum DivisionBox instances (${MAX_DIVISION_BOX_INSTANCES}) reached`)
    }

    if (IS_WINDOWS) {
      divisionBoxWindowPoolLog.debug('Windows: creating on-demand (pool disabled)')
      const newPooled = await this.createPooledWindow()
      const touchWindow = newPooled.touchWindow
      this.activeWindows.add(touchWindow.window)
      divisionBoxWindowPoolLog.debug(
        `Active: ${this.activeWindows.size}/${MAX_DIVISION_BOX_INSTANCES}`
      )
      return touchWindow
    }

    let touchWindow: TouchWindow

    // Clean up destroyed windows first
    this.pool = this.pool.filter((p) => !p.touchWindow.window.isDestroyed())

    // Try to get from pool
    const pooledWindow = this.pool.shift()

    if (pooledWindow) {
      touchWindow = pooledWindow.touchWindow
      divisionBoxWindowPoolLog.debug(`Acquired from pool (remaining: ${this.pool.length})`)
    } else {
      // Create new window on-demand
      divisionBoxWindowPoolLog.debug('Pool empty, creating on-demand')
      const newPooled = await this.createPooledWindow()
      touchWindow = newPooled.touchWindow
      divisionBoxWindowPoolLog.debug('On-demand window created')
    }

    // Track as active
    this.activeWindows.add(touchWindow.window)
    divisionBoxWindowPoolLog.debug(
      `Active: ${this.activeWindows.size}/${MAX_DIVISION_BOX_INSTANCES}`
    )

    // Refill pool in background (with delay to avoid blocking)
    if (!this.destroyed && !devProcessManager.isShuttingDownProcess()) {
      setTimeout(() => this.fillPool(), 500)
    }

    return touchWindow
  }

  /**
   * Release a window (called when DivisionBox is closed)
   */
  release(window: BrowserWindow): void {
    const wasActive = this.activeWindows.delete(window)
    if (wasActive) {
      divisionBoxWindowPoolLog.debug(`Released window (active: ${this.activeWindows.size})`)
    }

    // Refill pool
    if (!this.destroyed && !devProcessManager.isShuttingDownProcess()) {
      setTimeout(() => this.fillPool(), 500)
    }
  }

  /**
   * Get total window count (pool + active)
   */
  getTotalWindowCount(): number {
    return this.pool.length + this.activeWindows.size
  }

  /**
   * Get active window count
   */
  getActiveCount(): number {
    return this.activeWindows.size
  }

  /**
   * Get pool stats
   */
  getStats(): {
    poolSize: number
    activeCount: number
    maxInstances: number
    canCreate: boolean
  } {
    return {
      poolSize: this.pool.length,
      activeCount: this.activeWindows.size,
      maxInstances: MAX_DIVISION_BOX_INSTANCES,
      canCreate: this.activeWindows.size < MAX_DIVISION_BOX_INSTANCES
    }
  }

  /**
   * Cleanup all windows
   */
  destroy(): void {
    this.destroyed = true

    // Destroy pooled windows
    for (const pooled of this.pool) {
      if (!pooled.touchWindow.window.isDestroyed()) {
        pooled.touchWindow.window.destroy()
      }
    }
    this.pool = []

    // Clear active tracking (windows should be destroyed by their sessions)
    this.activeWindows.clear()

    divisionBoxWindowPoolLog.info('Pool destroyed')
  }
}

export const windowPool = DivisionBoxWindowPool.getInstance()
