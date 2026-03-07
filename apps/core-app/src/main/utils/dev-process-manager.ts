import process from 'node:process'
import { app, BrowserWindow } from 'electron'
import { createLogger } from './logger'

const devProcessLog = createLogger('DevProcessManager')
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000

/**
 * @file dev-process-manager.ts
 * Development Process Manager
 * This class manages the lifecycle of development processes in Electron,
 * ensuring that all processes are properly cleaned up during a graceful shutdown.
 * It listens for various signals and exceptions to handle shutdowns gracefully.
 */
export class DevProcessManager {
  private static instance: DevProcessManager | null = null
  private isShuttingDown = false
  private shutdownTimeout: NodeJS.Timeout | null = null
  private forceShutdownPromise: Promise<never> | null = null

  static getInstance(): DevProcessManager {
    if (!DevProcessManager.instance) {
      DevProcessManager.instance = new DevProcessManager()
    }
    return DevProcessManager.instance
  }

  /**
   * Initialize the development process manager.
   * This method sets up event listeners for various signals and exceptions
   * to handle shutdowns gracefully.
   */
  init() {
    if (app.isPackaged) {
      return // Only enable in development mode
    }

    // Listen for various signals and exceptions
    process.on('SIGTERM', this.handleGracefulShutdown.bind(this))
    process.on('SIGINT', this.handleGracefulShutdown.bind(this))
    process.on('SIGHUP', this.handleGracefulShutdown.bind(this))

    // Listen for uncaught exceptions
    process.on('uncaughtException', (error) => {
      devProcessLog.error('Uncaught exception', { error })
      this.handleGracefulShutdown()
    })

    process.on('unhandledRejection', (reason, promise) => {
      devProcessLog.error('Unhandled rejection', {
        meta: { reason: String(reason) },
        error: promise
      })
    })

    app.on('will-quit', () => {
      this.clearShutdownTimeout()
      if (this.isShuttingDown) {
        devProcessLog.info('Graceful shutdown completed')
      }
    })
  }

  /**
   * Handle graceful shutdown of the process.
   * This method ensures that all processes are properly cleaned up and
   * that the application exits gracefully.
   */
  private handleGracefulShutdown() {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    devProcessLog.info('Graceful shutdown initiated')

    // Set a timeout to ensure that the process does not wait indefinitely
    this.shutdownTimeout = setTimeout(() => {
      devProcessLog.warn('Shutdown timeout reached, forcing exit')
      void this.forceShutdown('timeout')
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS)

    try {
      app.quit()
    } catch (error) {
      devProcessLog.error('Failed to trigger app.quit, fallback to forced shutdown', { error })
      void this.forceShutdown('app-quit-failed')
    }
  }

  private clearShutdownTimeout(): void {
    if (!this.shutdownTimeout) {
      return
    }
    clearTimeout(this.shutdownTimeout)
    this.shutdownTimeout = null
  }

  private async forceShutdown(reason: string): Promise<never> {
    if (this.forceShutdownPromise) {
      return this.forceShutdownPromise
    }

    this.forceShutdownPromise = (async () => {
      devProcessLog.warn('Force shutdown started', { meta: { reason } })
      try {
        await this.cleanupProcesses()
      } catch (error) {
        devProcessLog.error('Error during forced shutdown cleanup', { error })
      } finally {
        this.clearShutdownTimeout()
      }
      process.exit(1)
    })()

    return this.forceShutdownPromise
  }

  /**
   * Clean up all processes and windows.
   * This method ensures that all BrowserWindow instances are properly closed
   * and that all processes are terminated.
   */
  private async cleanupProcesses(): Promise<void> {
    devProcessLog.info('Cleaning up processes')

    const windows = BrowserWindow.getAllWindows()
    devProcessLog.info(`Found ${windows.length} windows to cleanup`)

    for (const window of windows) {
      if (!window.isDestroyed()) {
        try {
          window.hide()

          if (window.webContents && !window.webContents.isDestroyed()) {
            // Send a close signal to the renderer process
            window.webContents.send('app-will-quit')

            // Wait for a short period to allow the renderer process to clean up
            await new Promise((resolve) => setTimeout(resolve, 100))

            // If the renderer process is still running, forcefully crash it
            if (!window.webContents.isDestroyed()) {
              try {
                window.webContents.forcefullyCrashRenderer()
              } catch (error) {
                devProcessLog.warn('Error crashing renderer', { error })
              }
            }
          }

          // Close the Window
          window.destroy()
        } catch (error) {
          devProcessLog.warn('Error cleaning up window', { error })
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200))

    devProcessLog.info('Process cleanup completed')
  }

  /**
   * Check if the process is currently shutting down.
   */
  isShuttingDownProcess(): boolean {
    return this.isShuttingDown
  }

  /**
   * Trigger graceful shutdown manually.
   */
  triggerGracefulShutdown() {
    this.handleGracefulShutdown()
  }
}

export const devProcessManager = DevProcessManager.getInstance()
