/**
 * DivisionBox Window Owner
 *
 * Creates renderer windows only for active DivisionBox sessions and destroys
 * them on release. No hidden renderer is prewarmed or refilled.
 */

import type { BrowserWindow } from 'electron'
import { DivisionBoxWindowOption } from '../../config/default'
import {
  markTouchWindowRenderFailureDegraded,
  TouchWindow,
  unmarkTouchWindowRenderFailureDegraded
} from '../../core/touch-window'
import { devProcessManager } from '../../utils/dev-process-manager'
import { createLogger } from '../../utils/logger'
import { getCoreBoxRendererPath, getCoreBoxRendererUrl, isDevMode } from '../../utils/renderer-url'

const divisionBoxWindowPoolLog = createLogger('DivisionBoxPool')

/** Maximum number of active DivisionBox instances */
const MAX_DIVISION_BOX_INSTANCES = 5

/**
 * Tracks active on-demand DivisionBox windows and owns their teardown.
 */
export class DivisionBoxWindowPool {
  private static instance: DivisionBoxWindowPool | null = null
  private readonly activeWindows = new Set<BrowserWindow>()
  private destroyed = false

  private constructor() {}

  static getInstance(): DivisionBoxWindowPool {
    if (!DivisionBoxWindowPool.instance) {
      DivisionBoxWindowPool.instance = new DivisionBoxWindowPool()
    }
    return DivisionBoxWindowPool.instance
  }

  async initialize(): Promise<void> {
    this.destroyed = false
    divisionBoxWindowPoolLog.info('DivisionBox window pool uses on-demand mode')
  }

  private async createOnDemandWindow(): Promise<TouchWindow> {
    if (this.destroyed || devProcessManager.isShuttingDownProcess()) {
      throw new Error('DivisionBox window owner is shutting down')
    }

    const touchWindow = new TouchWindow({
      ...DivisionBoxWindowOption,
      show: false,
      title: 'Tuff Division'
    })
    markTouchWindowRenderFailureDegraded(touchWindow.window)

    try {
      if (isDevMode()) {
        await touchWindow.loadURL(getCoreBoxRendererUrl())
      } else {
        await touchWindow.loadFile(getCoreBoxRendererPath())
      }
      unmarkTouchWindowRenderFailureDegraded(touchWindow.window)
    } catch (error) {
      if (!touchWindow.window.isDestroyed()) touchWindow.window.destroy()
      throw error
    }

    touchWindow.window.on('closed', () => {
      this.activeWindows.delete(touchWindow.window)
    })
    return touchWindow
  }

  async acquire(): Promise<TouchWindow> {
    if (this.activeWindows.size >= MAX_DIVISION_BOX_INSTANCES) {
      throw new Error(`Maximum DivisionBox instances (${MAX_DIVISION_BOX_INSTANCES}) reached`)
    }

    const touchWindow = await this.createOnDemandWindow()
    this.activeWindows.add(touchWindow.window)
    divisionBoxWindowPoolLog.debug(
      `Created on demand (${this.activeWindows.size}/${MAX_DIVISION_BOX_INSTANCES} active)`
    )
    return touchWindow
  }

  release(window: BrowserWindow): void {
    this.activeWindows.delete(window)
    if (!window.isDestroyed()) window.destroy()
  }

  getTotalWindowCount(): number {
    return this.activeWindows.size
  }

  getActiveCount(): number {
    return this.activeWindows.size
  }

  getStats(): {
    poolSize: number
    activeCount: number
    maxInstances: number
    canCreate: boolean
  } {
    return {
      poolSize: 0,
      activeCount: this.activeWindows.size,
      maxInstances: MAX_DIVISION_BOX_INSTANCES,
      canCreate: this.activeWindows.size < MAX_DIVISION_BOX_INSTANCES
    }
  }

  destroy(): void {
    this.destroyed = true
    for (const window of this.activeWindows) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.activeWindows.clear()
    divisionBoxWindowPoolLog.info('DivisionBox window owner destroyed')
  }
}

export const windowPool = DivisionBoxWindowPool.getInstance()
