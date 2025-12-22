/**
 * DivisionBox Window Pool
 * 
 * Pre-creates DivisionBox windows for instant availability.
 * Maintains a pool of ready-to-use windows to reduce latency when detaching.
 */

import { BrowserWindow } from 'electron'
import { TouchWindow } from '../../core/touch-window'
import { DivisionBoxWindowOption } from '../../config/default'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'

const LOG_PREFIX = '[DivisionBox Pool]'
const IS_WINDOWS = process.platform === 'win32'

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
    if (IS_WINDOWS) {
      console.log(LOG_PREFIX, 'Skip pre-warm on Windows (pool disabled)')
      return
    }

    if (this.initializing) return
    this.initializing = true

    console.log(LOG_PREFIX, 'Initializing window pool...')
    
    try {
      await this.fillPool()
      console.log(LOG_PREFIX, `✓ Pool ready (${this.pool.length} windows pre-warmed)`)
    } catch (error) {
      console.error(LOG_PREFIX, '✗ Failed to initialize:', error)
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

    // Prevent concurrent fills
    if (this.filling) return
    this.filling = true
    
    try {
      // Clean up destroyed windows from pool
      this.pool = this.pool.filter(p => !p.touchWindow.window.isDestroyed())
      
      const needed = POOL_SIZE - this.pool.length
      
      if (needed <= 0) {
        return
      }
      
      console.log(LOG_PREFIX, `Filling pool (need ${needed}, have ${this.pool.length})`)
      
      for (let i = 0; i < needed; i++) {
        // Check if we've hit the max limit (pool + active)
        if (this.getTotalWindowCount() >= MAX_DIVISION_BOX_INSTANCES) {
          console.log(LOG_PREFIX, `Max instances reached (${MAX_DIVISION_BOX_INSTANCES})`)
          break
        }
        
        try {
          const pooledWindow = await this.createPooledWindow()
          this.pool.push(pooledWindow)
          console.log(LOG_PREFIX, `+ Window added to pool (pool: ${this.pool.length})`)
        } catch (error) {
          console.error(LOG_PREFIX, 'Failed to create pooled window:', error)
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
    console.log(LOG_PREFIX, 'Creating new window...')
    
    const touchWindow = new TouchWindow({
      ...DivisionBoxWindowOption,
      show: false, // Don't show until acquired
      title: 'Tuff Division (Pool)'
    })
    console.log(LOG_PREFIX, 'TouchWindow created')

    // Load the CoreBox renderer
    const rendererUrl = getCoreBoxRendererUrl()
    console.log(LOG_PREFIX, `Loading renderer: ${rendererUrl}`)
    
    try {
      if (isDevMode()) {
        await touchWindow.loadURL(rendererUrl)
      } else {
        await touchWindow.loadFile(getCoreBoxRendererPath())
      }
      console.log(LOG_PREFIX, 'Renderer loaded successfully')
      
      // loadURL/loadFile already waits for the page to load
      // No need for additional dom-ready wait
    } catch (error) {
      console.error(LOG_PREFIX, 'Failed to load renderer:', error)
      throw error
    }
    
    console.log(LOG_PREFIX, 'Window ready')

    // Handle window closed (remove from pool)
    touchWindow.window.on('closed', () => {
      this.pool = this.pool.filter(p => p.touchWindow !== touchWindow)
      this.activeWindows.delete(touchWindow.window)
      
      // Refill pool after a delay
      setTimeout(() => this.fillPool(), 1000)
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
      console.log(LOG_PREFIX, 'Windows: creating on-demand (pool disabled)')
      const newPooled = await this.createPooledWindow()
      const touchWindow = newPooled.touchWindow
      this.activeWindows.add(touchWindow.window)
      console.log(LOG_PREFIX, `Active: ${this.activeWindows.size}/${MAX_DIVISION_BOX_INSTANCES}`)
      return touchWindow
    }

    let touchWindow: TouchWindow

    // Clean up destroyed windows first
    this.pool = this.pool.filter(p => !p.touchWindow.window.isDestroyed())

    // Try to get from pool
    const pooledWindow = this.pool.shift()
    
    if (pooledWindow) {
      touchWindow = pooledWindow.touchWindow
      console.log(LOG_PREFIX, `← Acquired from pool (remaining: ${this.pool.length})`)
    } else {
      // Create new window on-demand
      console.log(LOG_PREFIX, 'Pool empty, creating on-demand...')
      const newPooled = await this.createPooledWindow()
      touchWindow = newPooled.touchWindow
      console.log(LOG_PREFIX, '✓ On-demand window created')
    }

    // Track as active
    this.activeWindows.add(touchWindow.window)
    console.log(LOG_PREFIX, `Active: ${this.activeWindows.size}/${MAX_DIVISION_BOX_INSTANCES}`)

    // Refill pool in background (with delay to avoid blocking)
    setTimeout(() => this.fillPool(), 500)

    return touchWindow
  }

  /**
   * Release a window (called when DivisionBox is closed)
   */
  release(window: BrowserWindow): void {
    const wasActive = this.activeWindows.delete(window)
    if (wasActive) {
      console.log(LOG_PREFIX, `Released window (active: ${this.activeWindows.size})`)
    }
    
    // Refill pool
    setTimeout(() => this.fillPool(), 500)
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
    // Destroy pooled windows
    for (const pooled of this.pool) {
      if (!pooled.touchWindow.window.isDestroyed()) {
        pooled.touchWindow.window.destroy()
      }
    }
    this.pool = []
    
    // Clear active tracking (windows should be destroyed by their sessions)
    this.activeWindows.clear()
    
    console.log(LOG_PREFIX, 'Pool destroyed')
  }
}

export const windowPool = DivisionBoxWindowPool.getInstance()
